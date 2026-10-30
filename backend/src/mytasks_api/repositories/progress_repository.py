import logging
from collections.abc import Callable
from dataclasses import replace
from datetime import date, datetime, timedelta

from fastapi import Depends
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from mytasks_api.domain.progress import (
    DaySettings,
    Outcome,
    PlayerState,
    ProgressDay,
    acknowledge,
    close_days,
    day_from_document,
    day_to_document,
    open_day,
    set_mission,
    state_from_document,
    state_to_document,
)
from mytasks_api.domain.task import Status, Task
from mytasks_api.logging_config import log_event
from mytasks_api.repositories.account_repository import _retry_on_abort, _transactional
from mytasks_api.repositories.task_repository import (
    Transition,
    _document_to_task,
    _load_live_task,
    get_firestore_client,
)

logger = logging.getLogger(__name__)

USERS_COLLECTION = "users"
TASKS_COLLECTION = "tasks"
PROGRESS_COLLECTION = "progress"
STATE_DOCUMENT = "state"
DAYS_COLLECTION = "progress_days"

# How the progress changes with a task transition: the task before and after it, today's day
# and the player state, to the new day and state (domain/progress.py).
ProgressRule = Callable[[Task, Task, ProgressDay, PlayerState], Outcome]


def _yesterday(today: str) -> str:
    return (date.fromisoformat(today) - timedelta(days=1)).isoformat()


def _day_or_none(snapshot: firestore.DocumentSnapshot) -> ProgressDay | None:
    data = snapshot.to_dict() if snapshot.exists else None
    return day_from_document(data) if data else None


def _state(snapshot: firestore.DocumentSnapshot) -> PlayerState:
    return state_from_document((snapshot.to_dict() if snapshot.exists else None) or {})


@_transactional
async def _task_transition(
    transaction: firestore.AsyncTransaction,
    task_ref: firestore.AsyncDocumentReference,
    day_ref: firestore.AsyncDocumentReference,
    state_ref: firestore.AsyncDocumentReference,
    transition: Transition,
    rule: ProgressRule,
    today: str,
    settings: DaySettings,
    now: datetime,
) -> Task:
    # Firestore wants every read before the first write: the three documents first.
    task_snapshot = await task_ref.get(transaction=transaction)
    day_snapshot = await day_ref.get(transaction=transaction)
    state_snapshot = await state_ref.get(transaction=transaction)
    before = _load_live_task(task_snapshot, task_ref.id)
    after = transition(before, now)
    day = open_day(_day_or_none(day_snapshot), today, settings)
    state = _state(state_snapshot)

    completed_day, points_awarded_on = before.completed_day, before.points_awarded_on
    if day.closed:
        # Only possible after moving the time zone back into a day already closed: that day must
        # not change (FR-006), so the transition goes through without touching the progress.
        log_event(logger, logging.WARNING, "progress_day_already_closed", day=today)
    else:
        outcome = rule(before, after, day, state)
        completed_day, points_awarded_on = outcome.completed_day, outcome.points_awarded_on
        if outcome.day != day or not day_snapshot.exists:
            transaction.set(day_ref, day_to_document(outcome.day, now))
        if outcome.state != state:
            transaction.set(state_ref, state_to_document(outcome.state, now))

    transaction.update(
        task_ref,
        {
            "status": after.status.value,
            "in_trash": after.in_trash,
            "completed_at": after.completed_at,
            "trashed_at": after.trashed_at,
            "purge_at": after.purge_at,
            "updated_at": after.updated_at,
            "completed_day": completed_day,
            "points_awarded_on": points_awarded_on,
        },
    )
    return _document_to_task(
        task_snapshot.id,
        {
            **(task_snapshot.to_dict() or {}),
            "status": after.status.value,
            "in_trash": after.in_trash,
            "completed_at": after.completed_at,
            "trashed_at": after.trashed_at,
            "purge_at": after.purge_at,
            "updated_at": after.updated_at,
            "completed_day": completed_day,
            "points_awarded_on": points_awarded_on,
        },
    )


@_transactional
async def _close_days(
    transaction: firestore.AsyncTransaction,
    state_ref: firestore.AsyncDocumentReference,
    days: firestore.AsyncCollectionReference,
    settings: DaySettings,
    today: str,
    now: datetime,
) -> PlayerState:
    state_snapshot = await state_ref.get(transaction=transaction)
    state = _state(state_snapshot)
    if state.last_closed_day == _yesterday(today):
        return state  # another request closed them in the meantime
    query = days.where(filter=FieldFilter("date", "<", today))
    if state.last_closed_day is not None:
        query = query.where(filter=FieldFilter("date", ">", state.last_closed_day))
    stored: dict[str, ProgressDay] = {}
    async for snapshot in query.stream(transaction=transaction):
        day = _day_or_none(snapshot)
        if day is not None:
            stored[day.date] = day
    new_state, closed = close_days(state, stored, settings, today, now)
    for day in closed:
        transaction.set(days.document(day.date), day_to_document(day, now))
    if new_state != state or not state_snapshot.exists:
        transaction.set(state_ref, state_to_document(new_state, now))
    if closed:
        log_event(logger, logging.INFO, "progress_day_closed", day=today, count=str(len(closed)))
    return new_state


@_transactional
async def _set_mission(
    transaction: firestore.AsyncTransaction,
    day_ref: firestore.AsyncDocumentReference,
    state_ref: firestore.AsyncDocumentReference,
    task_refs: list[firestore.AsyncDocumentReference],
    task_ids: list[str],
    today: str,
    settings: DaySettings,
    now: datetime,
) -> ProgressDay:
    day_snapshot = await day_ref.get(transaction=transaction)
    state_snapshot = await state_ref.get(transaction=transaction)
    active_ids: set[str] = set()
    for task_ref in task_refs:
        snapshot = await task_ref.get(transaction=transaction)
        data = snapshot.to_dict() if snapshot.exists else None
        if data is None:
            continue
        task = _document_to_task(snapshot.id, data)
        if task.status is Status.ACTIVE and not task.in_trash:
            active_ids.add(task.id)
    day = open_day(_day_or_none(day_snapshot), today, settings)
    state = _state(state_snapshot)
    updated_day, updated_state = set_mission(task_ids, active_ids, day, state, now)
    transaction.set(day_ref, day_to_document(updated_day, now))
    if updated_state != state:
        transaction.set(state_ref, state_to_document(updated_state, now))
    return updated_day


@_transactional
async def _mark_review_seen(
    transaction: firestore.AsyncTransaction,
    day_ref: firestore.AsyncDocumentReference,
    today: str,
    settings: DaySettings,
    now: datetime,
) -> ProgressDay:
    snapshot = await day_ref.get(transaction=transaction)
    day = open_day(_day_or_none(snapshot), today, settings)
    if day.review_seen and snapshot.exists:
        return day
    seen = replace(day, review_seen=True)
    transaction.set(day_ref, day_to_document(seen, now))
    return seen


@_transactional
async def _acknowledge(
    transaction: firestore.AsyncTransaction,
    state_ref: firestore.AsyncDocumentReference,
    announcement_ids: list[str],
    notice_ids: list[str],
    now: datetime,
) -> PlayerState:
    snapshot = await state_ref.get(transaction=transaction)
    state = _state(snapshot)
    updated = acknowledge(state, announcement_ids, notice_ids)
    if updated != state:
        transaction.set(state_ref, state_to_document(updated, now))
    return updated


class ProgressRepository:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _user(self, uid: str) -> firestore.AsyncDocumentReference:
        return self._client.collection(USERS_COLLECTION).document(uid)

    def _state_ref(self, uid: str) -> firestore.AsyncDocumentReference:
        state: firestore.AsyncDocumentReference = (
            self._user(uid).collection(PROGRESS_COLLECTION).document(STATE_DOCUMENT)
        )
        return state

    def _days(self, uid: str) -> firestore.AsyncCollectionReference:
        collection: firestore.AsyncCollectionReference = self._user(uid).collection(DAYS_COLLECTION)
        return collection

    def _task_ref(self, uid: str, task_id: str) -> firestore.AsyncDocumentReference:
        task: firestore.AsyncDocumentReference = (
            self._user(uid).collection(TASKS_COLLECTION).document(task_id)
        )
        return task

    async def get_state(self, uid: str) -> PlayerState:
        return _state(await self._state_ref(uid).get())

    async def get_day(self, uid: str, day: str) -> ProgressDay | None:
        return _day_or_none(await self._days(uid).document(day).get())

    async def run_task_transition(
        self,
        uid: str,
        task_id: str,
        transition: Transition,
        rule: ProgressRule,
        today: str,
        settings: DaySettings,
        now: datetime,
    ) -> Task:
        task_ref = self._task_ref(uid, task_id)
        day_ref = self._days(uid).document(today)
        state_ref = self._state_ref(uid)
        return await _retry_on_abort(
            lambda: _task_transition(
                self._client.transaction(),
                task_ref,
                day_ref,
                state_ref,
                transition,
                rule,
                today,
                settings,
                now,
            )
        )

    async def close_days(
        self, uid: str, settings: DaySettings, today: str, now: datetime
    ) -> PlayerState:
        state = await self.get_state(uid)
        if state.last_closed_day == _yesterday(today):
            return state  # the usual case: nothing to close, and no transaction to pay for
        state_ref, days = self._state_ref(uid), self._days(uid)
        return await _retry_on_abort(
            lambda: _close_days(self._client.transaction(), state_ref, days, settings, today, now)
        )

    async def set_mission(
        self, uid: str, task_ids: list[str], today: str, settings: DaySettings, now: datetime
    ) -> ProgressDay:
        day_ref, state_ref = self._days(uid).document(today), self._state_ref(uid)
        task_refs = [self._task_ref(uid, task_id) for task_id in task_ids]
        return await _retry_on_abort(
            lambda: _set_mission(
                self._client.transaction(),
                day_ref,
                state_ref,
                task_refs,
                task_ids,
                today,
                settings,
                now,
            )
        )

    async def mark_review_seen(
        self, uid: str, today: str, settings: DaySettings, now: datetime
    ) -> ProgressDay:
        day_ref = self._days(uid).document(today)
        return await _retry_on_abort(
            lambda: _mark_review_seen(self._client.transaction(), day_ref, today, settings, now)
        )

    async def acknowledge(
        self, uid: str, announcement_ids: list[str], notice_ids: list[str], now: datetime
    ) -> PlayerState:
        state_ref = self._state_ref(uid)
        return await _retry_on_abort(
            lambda: _acknowledge(
                self._client.transaction(), state_ref, announcement_ids, notice_ids, now
            )
        )


def get_progress_repository(
    client: firestore.AsyncClient = Depends(get_firestore_client),
) -> ProgressRepository:
    return ProgressRepository(client)
