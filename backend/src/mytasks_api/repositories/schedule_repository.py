from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, date, datetime
from typing import Any

from fastapi import Depends
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from mytasks_api.domain.progress import add_notice, state_from_document, state_to_document
from mytasks_api.domain.recurrence import Recurrence, RecurrenceKind
from mytasks_api.domain.schedule import (
    MAX_SCHEDULES,
    GenerationPlan,
    NewSchedule,
    Schedule,
    ScheduleLimitError,
    ScheduleNotFoundError,
    ScheduleStatus,
    plan_generation,
)
from mytasks_api.domain.task import Scope, Status
from mytasks_api.repositories.account_repository import _retry_on_abort, _transactional
from mytasks_api.repositories.task_repository import _document_to_task, get_firestore_client

USERS_COLLECTION = "users"
SCHEDULES_COLLECTION = "schedules"
TASKS_COLLECTION = "tasks"


def _day(value: object) -> date | None:
    return date.fromisoformat(value) if isinstance(value, str) else None


def _recurrence_from_document(data: dict[str, Any]) -> Recurrence:
    kind = RecurrenceKind(data["kind"])
    return Recurrence(
        kind,
        date=_day(data.get("date")),
        weekdays=tuple(int(day) for day in data.get("weekdays") or ()),
        month_day=data.get("month_day"),
    )


def _recurrence_to_document(rule: Recurrence) -> dict[str, Any]:
    document: dict[str, Any] = {"kind": rule.kind.value}
    if rule.kind is RecurrenceKind.ONCE and rule.date is not None:
        document["date"] = rule.date.isoformat()
    elif rule.kind is RecurrenceKind.WEEKLY:
        document["weekdays"] = list(rule.weekdays)
    elif rule.kind is RecurrenceKind.MONTHLY:
        document["month_day"] = rule.month_day
    return document


def _document_to_schedule(schedule_id: str, data: dict[str, Any]) -> Schedule:
    return Schedule(
        id=schedule_id,
        title=data["title"],
        description=data["description"],
        urgent=data["urgent"],
        important=data["important"],
        scope=Scope(data["scope"]),
        recurrence=_recurrence_from_document(data["recurrence"]),
        status=ScheduleStatus(data["status"]),
        next_occurrence=_day(data.get("next_occurrence")),
        last_task_id=data.get("last_task_id"),
        last_generated_for=_day(data.get("last_generated_for")),
        created_at=data["created_at"].astimezone(UTC),
        updated_at=data["updated_at"].astimezone(UTC),
    )


def _schedule_to_document(schedule: Schedule) -> dict[str, Any]:
    return {
        "title": schedule.title,
        "description": schedule.description,
        "urgent": schedule.urgent,
        "important": schedule.important,
        "scope": schedule.scope.value,
        "recurrence": _recurrence_to_document(schedule.recurrence),
        "status": schedule.status.value,
        # ISO dates compare like the days they are: `next_occurrence <= today` is a string range.
        "next_occurrence": schedule.next_occurrence.isoformat()
        if schedule.next_occurrence
        else None,
        "last_task_id": schedule.last_task_id,
        "last_generated_for": schedule.last_generated_for.isoformat()
        if schedule.last_generated_for
        else None,
        "created_at": schedule.created_at,
        "updated_at": schedule.updated_at,
    }


def _generated_task(schedule: Schedule, day: date, now: datetime) -> dict[str, Any]:
    # The same document as a task created by hand (task_repository.create), plus where it comes
    # from.
    return {
        "title": schedule.title,
        "description": schedule.description,
        "urgent": schedule.urgent,
        "important": schedule.important,
        "scope": schedule.scope.value,
        "pinned": False,
        "status": Status.ACTIVE.value,
        "in_trash": False,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
        "trashed_at": None,
        "purge_at": None,
        "schedule_id": schedule.id,
        "scheduled_for": day.isoformat(),
    }


def _is_live_and_active(snapshot: firestore.DocumentSnapshot, now: datetime) -> bool:
    data = snapshot.to_dict() if snapshot.exists else None
    if data is None:
        return False
    task = _document_to_task(snapshot.id, data)
    purged = task.purge_at is not None and task.purge_at <= now
    return task.status is Status.ACTIVE and not task.in_trash and not purged


@_transactional
async def _create_within_limit(
    transaction: firestore.AsyncTransaction,
    schedules: firestore.AsyncCollectionReference,
    doc_ref: firestore.AsyncDocumentReference,
    document: dict[str, Any],
    limit: int,
) -> bool:
    # The count is read inside the transaction: two creations racing for the last place conflict
    # and one of them retries and sees the full count. Counting outside it, as a first version
    # did, let a burst of parallel requests walk past the limit.
    result = await schedules.count().get(transaction=transaction)  # type: ignore[no-untyped-call]
    if int(result[0][0].value) >= limit:
        return False
    transaction.create(doc_ref, document)
    return True


@_transactional
async def _modify(
    transaction: firestore.AsyncTransaction,
    doc_ref: firestore.AsyncDocumentReference,
    change: Callable[[Schedule], Schedule],
    now: datetime,
) -> Schedule:
    snapshot = await doc_ref.get(transaction=transaction)
    data = snapshot.to_dict() if snapshot.exists else None
    if data is None:
        raise ScheduleNotFoundError(doc_ref.id)
    current = _document_to_schedule(snapshot.id, data)
    updated = change(current)
    if updated != current:
        updated = replace(updated, updated_at=now)
        transaction.set(doc_ref, _schedule_to_document(updated))
    return updated


@_transactional
async def _generate(
    transaction: firestore.AsyncTransaction,
    schedule_ref: firestore.AsyncDocumentReference,
    tasks: firestore.AsyncCollectionReference,
    state_ref: firestore.AsyncDocumentReference,
    today: date,
    now: datetime,
    has_room: bool,
) -> GenerationPlan | None:
    # Every read before the first write: the schedule, its last task and the player state.
    schedule_snapshot = await schedule_ref.get(transaction=transaction)
    data = schedule_snapshot.to_dict() if schedule_snapshot.exists else None
    if data is None:
        return None  # deleted in the meantime
    schedule = _document_to_schedule(schedule_snapshot.id, data)
    last_active = False
    if schedule.last_task_id is not None:
        last_snapshot = await tasks.document(schedule.last_task_id).get(transaction=transaction)
        last_active = _is_live_and_active(last_snapshot, now)
    state_snapshot = await state_ref.get(transaction=transaction)

    # Read again inside the transaction: if another request already generated today's task,
    # `next_occurrence` is past today and nothing happens (no duplicates, research R7).
    plan = plan_generation(schedule, today, last_task_active=last_active, has_room=has_room)
    if plan is None:
        return None

    last_task_id, last_generated_for = schedule.last_task_id, schedule.last_generated_for
    if plan.create_for is not None:
        task_ref = tasks.document()
        transaction.set(task_ref, _generated_task(schedule, plan.create_for, now))
        last_task_id, last_generated_for = task_ref.id, plan.create_for
    if plan.skipped_limit:
        state = state_from_document(
            (state_snapshot.to_dict() if state_snapshot.exists else None) or {}
        )
        transaction.set(
            state_ref, state_to_document(add_notice(state, schedule.id, plan.due.isoformat()), now)
        )
    updated = replace(
        schedule,
        status=plan.status,
        next_occurrence=plan.next_occurrence,
        last_task_id=last_task_id,
        last_generated_for=last_generated_for,
        updated_at=now,
    )
    transaction.set(schedule_ref, _schedule_to_document(updated))
    return plan


class ScheduleRepository:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _user(self, uid: str) -> firestore.AsyncDocumentReference:
        return self._client.collection(USERS_COLLECTION).document(uid)

    def _schedules(self, uid: str) -> firestore.AsyncCollectionReference:
        collection: firestore.AsyncCollectionReference = self._user(uid).collection(
            SCHEDULES_COLLECTION
        )
        return collection

    async def list_all(self, uid: str) -> list[Schedule]:
        schedules: list[Schedule] = []
        async for snapshot in self._schedules(uid).order_by("created_at").stream():
            data = snapshot.to_dict()
            if data is not None:
                schedules.append(_document_to_schedule(snapshot.id, data))
        return schedules

    async def get_titles(self, uid: str, schedule_ids: list[str]) -> dict[str, str]:
        """Titles of the schedules that still exist, to word the notices."""
        refs = [self._schedules(uid).document(schedule_id) for schedule_id in set(schedule_ids)]
        titles: dict[str, str] = {}
        async for snapshot in self._client.get_all(refs):
            data = snapshot.to_dict() if snapshot.exists else None
            if data is not None:
                titles[snapshot.id] = str(data["title"])
        return titles

    async def create(self, uid: str, data: NewSchedule, now: datetime) -> Schedule:
        """Raises `ScheduleLimitError` if the person already has `MAX_SCHEDULES` (finished ones
        included): the check and the write are one transaction."""
        schedules = self._schedules(uid)
        doc_ref = schedules.document()
        schedule = Schedule(
            id=doc_ref.id,
            title=data.title,
            description=data.description,
            urgent=data.urgent,
            important=data.important,
            scope=data.scope,
            recurrence=data.recurrence,
            status=ScheduleStatus.ACTIVE,
            next_occurrence=data.next_occurrence,
            last_task_id=None,
            last_generated_for=None,
            created_at=now,
            updated_at=now,
        )
        document = _schedule_to_document(schedule)
        created = await _retry_on_abort(
            lambda: _create_within_limit(
                self._client.transaction(), schedules, doc_ref, document, MAX_SCHEDULES
            )
        )
        if not created:
            raise ScheduleLimitError(uid)
        return schedule

    async def modify(
        self, uid: str, schedule_id: str, change: Callable[[Schedule], Schedule], now: datetime
    ) -> Schedule:
        doc_ref = self._schedules(uid).document(schedule_id)
        return await _retry_on_abort(
            lambda: _modify(self._client.transaction(), doc_ref, change, now)
        )

    async def delete(self, uid: str, schedule_id: str) -> None:
        doc_ref = self._schedules(uid).document(schedule_id)
        snapshot = await doc_ref.get()
        if not snapshot.exists:
            raise ScheduleNotFoundError(schedule_id)
        await doc_ref.delete()

    async def list_due(self, uid: str, today: date) -> list[Schedule]:
        # Paused and finished ones have no `next_occurrence`, so a range leaves them out.
        query = self._schedules(uid).where(
            filter=FieldFilter("next_occurrence", "<=", today.isoformat())
        )
        schedules: list[Schedule] = []
        async for snapshot in query.stream():
            data = snapshot.to_dict()
            if data is not None:
                schedules.append(_document_to_schedule(snapshot.id, data))
        return schedules

    async def generate(
        self, uid: str, schedule_id: str, today: date, now: datetime, *, has_room: bool
    ) -> GenerationPlan | None:
        user = self._user(uid)
        return await _retry_on_abort(
            lambda: _generate(
                self._client.transaction(),
                self._schedules(uid).document(schedule_id),
                user.collection(TASKS_COLLECTION),
                user.collection("progress").document("state"),
                today,
                now,
                has_room,
            )
        )


def get_schedule_repository(
    client: firestore.AsyncClient = Depends(get_firestore_client),
) -> ScheduleRepository:
    return ScheduleRepository(client)
