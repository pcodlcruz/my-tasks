import logging

from fastapi import Depends

from mytasks_api.domain.task import (
    MAX_ACTIVE_TASKS,
    ActiveTaskLimitError,
    Scope,
    Status,
    Task,
    TaskNotFoundError,
    complete,
    move_to_trash,
    reopen,
    restore,
    sort_board,
)
from mytasks_api.logging_config import log_event
from mytasks_api.repositories.task_repository import (
    TaskRepository,
    Transition,
    get_task_repository,
)
from mytasks_api.schemas.task import TaskCreate, TaskUpdate

logger = logging.getLogger(__name__)


class TaskService:
    def __init__(self, repository: TaskRepository) -> None:
        self._repository = repository

    def _log_missing(self, uid: str, task_id: str, action: str) -> None:
        # Una tarea ajena y una inexistente dan el mismo 404 al cliente; el registro
        # permite detectar a quien va probando identificadores.
        log_event(
            logger, logging.WARNING, "task_not_found", uid=uid, task_id=task_id, action=action
        )

    async def _ensure_room_for_active_task(self, uid: str) -> None:
        # Tope "blando": el recuento y la escritura no son atómicos, así que dos altas
        # simultáneas podrían pasarse por muy poco. Basta para acotar el abuso.
        if await self._repository.count_active(uid) >= MAX_ACTIVE_TASKS:
            raise ActiveTaskLimitError(uid)

    async def _transition(
        self, uid: str, task_id: str, action: str, transition: Transition
    ) -> Task:
        try:
            task = await self._repository.apply_transition(uid, task_id, transition)
        except TaskNotFoundError:
            self._log_missing(uid, task_id, action)
            raise
        log_event(logger, logging.INFO, "task_transition", uid=uid, task_id=task_id, action=action)
        return task

    async def get_task(self, uid: str, task_id: str) -> Task:
        task = await self._repository.get(uid, task_id)
        if task is None:
            self._log_missing(uid, task_id, "get")
            raise TaskNotFoundError(task_id)
        return task

    async def create_task(self, uid: str, data: TaskCreate) -> Task:
        await self._ensure_room_for_active_task(uid)
        return await self._repository.create(uid, data)

    async def update_task(self, uid: str, task_id: str, data: TaskUpdate) -> Task:
        try:
            return await self._repository.update(uid, task_id, data.updated_fields())
        except TaskNotFoundError:
            self._log_missing(uid, task_id, "update")
            raise

    async def list_board(self, uid: str, scope: Scope | None = None) -> list[Task]:
        tasks = await self._repository.list_board(uid, scope)
        return sort_board(tasks)

    async def complete_task(self, uid: str, task_id: str) -> Task:
        return await self._transition(uid, task_id, "complete", complete)

    async def reopen_task(self, uid: str, task_id: str) -> Task:
        existing = await self._repository.get(uid, task_id)
        if existing is not None and existing.status == Status.COMPLETED and not existing.in_trash:
            await self._ensure_room_for_active_task(uid)
        return await self._transition(uid, task_id, "reopen", reopen)

    async def trash_task(self, uid: str, task_id: str) -> Task:
        return await self._transition(uid, task_id, "trash", move_to_trash)

    async def restore_task(self, uid: str, task_id: str) -> Task:
        existing = await self._repository.get(uid, task_id)
        if existing is not None and existing.in_trash and existing.status == Status.ACTIVE:
            await self._ensure_room_for_active_task(uid)
        return await self._transition(uid, task_id, "restore", restore)

    async def delete_task(self, uid: str, task_id: str) -> None:
        try:
            await self._repository.delete(uid, task_id)
        except TaskNotFoundError:
            self._log_missing(uid, task_id, "delete")
            raise
        log_event(
            logger, logging.INFO, "task_transition", uid=uid, task_id=task_id, action="delete"
        )

    async def list_history(
        self, uid: str, cursor: str | None, limit: int
    ) -> tuple[list[Task], str | None]:
        return await self._repository.list_history(uid, cursor, limit)

    async def list_trash(
        self, uid: str, cursor: str | None, limit: int
    ) -> tuple[list[Task], str | None]:
        return await self._repository.list_trash(uid, cursor, limit)


def get_task_service(
    repository: TaskRepository = Depends(get_task_repository),
) -> TaskService:
    return TaskService(repository)
