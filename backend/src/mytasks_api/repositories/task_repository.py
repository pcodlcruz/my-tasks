import os
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from fastapi import Depends
from google.cloud import firestore

from mytasks_api.config import get_settings
from mytasks_api.domain.task import Scope, Status, Task


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
