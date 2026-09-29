import base64
import json
import os
from collections.abc import Callable
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from fastapi import Depends
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from mytasks_api.config import get_settings
from mytasks_api.domain.task import (
    InvalidCursorError,
    Scope,
    Status,
    Task,
    TaskNotFoundError,
    ensure_editable,
    ensure_purgeable,
)
from mytasks_api.schemas.task import TaskCreate

Transition = Callable[[Task, datetime], Task]


def _to_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(UTC)


def _document_to_task(task_id: str, data: dict[str, Any]) -> Task:
    return Task(
        id=task_id,
        title=data["title"],
        description=data["description"],
        urgent=data["urgent"],
        important=data["important"],
        scope=Scope(data["scope"]),
        pinned=data["pinned"],
        status=Status(data["status"]),
        in_trash=data["in_trash"],
        created_at=_to_utc(data["created_at"]),  # type: ignore[arg-type]
        updated_at=_to_utc(data["updated_at"]),  # type: ignore[arg-type]
        completed_at=_to_utc(data.get("completed_at")),
        trashed_at=_to_utc(data.get("trashed_at")),
        purge_at=_to_utc(data.get("purge_at")),
    )


def _encode_cursor(moment: datetime, task_id: str) -> str:
    raw = json.dumps({"t": moment.isoformat(), "id": task_id})
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        payload = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        moment = datetime.fromisoformat(payload["t"])
        task_id = payload["id"]
    except (ValueError, KeyError, TypeError) as error:
        raise InvalidCursorError(cursor) from error
    if moment.tzinfo is None or not isinstance(task_id, str) or not 1 <= len(task_id) <= 128:
        raise InvalidCursorError(cursor)
    return moment, task_id


def _load_live_task(snapshot: firestore.DocumentSnapshot, task_id: str) -> Task:
    data = snapshot.to_dict() if snapshot.exists else None
    if data is None:
        raise TaskNotFoundError(task_id)
    task = _document_to_task(snapshot.id, data)
    if task.purge_at is not None and task.purge_at <= datetime.now(UTC):
        raise TaskNotFoundError(task_id)
    return task


@firestore.async_transactional
async def _apply_update(
    transaction: firestore.AsyncTransaction,
    doc_ref: firestore.AsyncDocumentReference,
    fields: dict[str, Any],
) -> Task:
    snapshot = await doc_ref.get(transaction=transaction)
    task = _load_live_task(snapshot, doc_ref.id)
    ensure_editable(task)

    update_payload: dict[str, Any] = dict(fields)
    if isinstance(update_payload.get("scope"), Scope):
        update_payload["scope"] = update_payload["scope"].value
    update_payload["updated_at"] = datetime.now(UTC)

    transaction.update(doc_ref, update_payload)
    return _document_to_task(snapshot.id, {**(snapshot.to_dict() or {}), **update_payload})


@firestore.async_transactional
async def _apply_transition(
    transaction: firestore.AsyncTransaction,
    doc_ref: firestore.AsyncDocumentReference,
    transition: Transition,
) -> Task:
    snapshot = await doc_ref.get(transaction=transaction)
    task = _load_live_task(snapshot, doc_ref.id)
    updated = transition(task, datetime.now(UTC))
    transaction.update(
        doc_ref,
        {
            "status": updated.status.value,
            "in_trash": updated.in_trash,
            "completed_at": updated.completed_at,
            "trashed_at": updated.trashed_at,
            "purge_at": updated.purge_at,
            "updated_at": updated.updated_at,
        },
    )
    return updated


@firestore.async_transactional
async def _delete_trashed(
    transaction: firestore.AsyncTransaction,
    doc_ref: firestore.AsyncDocumentReference,
) -> None:
    snapshot = await doc_ref.get(transaction=transaction)
    ensure_purgeable(_load_live_task(snapshot, doc_ref.id))
    transaction.delete(doc_ref)


class TaskRepository:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _tasks_collection(self, uid: str) -> firestore.AsyncCollectionReference:
        collection: firestore.AsyncCollectionReference = (
            self._client.collection("users").document(uid).collection("tasks")
        )
        return collection

    async def get(self, uid: str, task_id: str) -> Task | None:
        snapshot = await self._tasks_collection(uid).document(task_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict()
        if data is None:
            return None
        task = _document_to_task(snapshot.id, data)
        if task.purge_at is not None and task.purge_at <= datetime.now(UTC):
            return None
        return task

    async def create(self, uid: str, data: TaskCreate) -> Task:
        now = datetime.now(UTC)
        document: dict[str, Any] = {
            "title": data.title,
            "description": data.description,
            "urgent": data.urgent,
            "important": data.important,
            "scope": data.scope.value,
            "pinned": False,
            "status": Status.ACTIVE.value,
            "in_trash": False,
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
            "trashed_at": None,
            "purge_at": None,
        }
        doc_ref = self._tasks_collection(uid).document()
        await doc_ref.set(document)
        return _document_to_task(doc_ref.id, document)

    async def update(self, uid: str, task_id: str, fields: dict[str, Any]) -> Task:
        doc_ref = self._tasks_collection(uid).document(task_id)
        transaction = self._client.transaction()
        return await _apply_update(transaction, doc_ref, fields)

    async def list_board(self, uid: str, scope: Scope | None = None) -> list[Task]:
        query = (
            self._tasks_collection(uid)
            .where(filter=FieldFilter("status", "==", Status.ACTIVE.value))
            .where(filter=FieldFilter("in_trash", "==", False))
        )
        if scope is not None:
            query = query.where(filter=FieldFilter("scope", "==", scope.value))
        tasks: list[Task] = []
        async for snapshot in query.stream():
            data = snapshot.to_dict()
            if data is not None:
                tasks.append(_document_to_task(snapshot.id, data))
        return tasks

    async def count_active(self, uid: str) -> int:
        query = (
            self._tasks_collection(uid)
            .where(filter=FieldFilter("status", "==", Status.ACTIVE.value))
            .where(filter=FieldFilter("in_trash", "==", False))
        )
        # Los tipos del SDK marcan `get` como método sin enlazar: es solo un fallo de mypy.
        result = await query.count().get()  # type: ignore[call-arg]
        return int(result[0][0].value)

    async def apply_transition(self, uid: str, task_id: str, transition: Transition) -> Task:
        doc_ref = self._tasks_collection(uid).document(task_id)
        transaction = self._client.transaction()
        return await _apply_transition(transaction, doc_ref, transition)

    async def delete(self, uid: str, task_id: str) -> None:
        doc_ref = self._tasks_collection(uid).document(task_id)
        transaction = self._client.transaction()
        await _delete_trashed(transaction, doc_ref)

    async def list_history(
        self, uid: str, cursor: str | None, limit: int
    ) -> tuple[list[Task], str | None]:
        query = (
            self._tasks_collection(uid)
            .where(filter=FieldFilter("status", "==", Status.COMPLETED.value))
            .where(filter=FieldFilter("in_trash", "==", False))
        )
        return await self._list_page(
            query, "completed_at", lambda task: task.completed_at, cursor, limit
        )

    async def list_trash(
        self, uid: str, cursor: str | None, limit: int
    ) -> tuple[list[Task], str | None]:
        query = (
            self._tasks_collection(uid)
            .where(filter=FieldFilter("in_trash", "==", True))
            .where(filter=FieldFilter("purge_at", ">", datetime.now(UTC)))
        )
        return await self._list_page(query, "purge_at", lambda task: task.purge_at, cursor, limit)

    async def _list_page(
        self,
        query: firestore.AsyncQuery,
        order_field: str,
        moment_of: Callable[[Task], datetime | None],
        cursor: str | None,
        limit: int,
    ) -> tuple[list[Task], str | None]:
        query = query.order_by(order_field, direction=firestore.Query.DESCENDING).order_by(
            "__name__", direction=firestore.Query.DESCENDING
        )
        if cursor is not None:
            moment, task_id = _decode_cursor(cursor)
            query = query.start_after({order_field: moment, "__name__": task_id})
        tasks: list[Task] = []
        async for snapshot in query.limit(limit + 1).stream():
            data = snapshot.to_dict()
            if data is not None:
                tasks.append(_document_to_task(snapshot.id, data))
        if len(tasks) <= limit:
            return tasks, None
        page = tasks[:limit]
        last_moment = moment_of(page[-1])
        next_cursor = _encode_cursor(last_moment, page[-1].id) if last_moment else None
        return page, next_cursor


@lru_cache
def get_firestore_client() -> firestore.AsyncClient:
    settings = get_settings()
    if settings.firestore_emulator_host:
        os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host
    return firestore.AsyncClient(project=settings.google_cloud_project)


def get_task_repository(
    client: firestore.AsyncClient = Depends(get_firestore_client),
) -> TaskRepository:
    return TaskRepository(client)
