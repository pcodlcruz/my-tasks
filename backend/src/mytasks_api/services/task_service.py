from fastapi import Depends

from mytasks_api.domain.task import (
    Scope,
    Task,
    TaskNotFoundError,
    complete,
    move_to_trash,
    reopen,
    restore,
    sort_board,
)
from mytasks_api.repositories.task_repository import TaskRepository, get_task_repository
from mytasks_api.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    def __init__(self, repository: TaskRepository) -> None:
        self._repository = repository

    async def get_task(self, uid: str, task_id: str) -> Task:
        task = await self._repository.get(uid, task_id)
        if task is None:
            raise TaskNotFoundError(task_id)
        return task

    async def create_task(self, uid: str, data: TaskCreate) -> Task:
        return await self._repository.create(uid, data)

    async def update_task(self, uid: str, task_id: str, data: TaskUpdate) -> Task:
        return await self._repository.update(uid, task_id, data.updated_fields())

    async def list_board(self, uid: str, scope: Scope | None = None) -> list[Task]:
        tasks = await self._repository.list_board(uid, scope)
        return sort_board(tasks)

    async def complete_task(self, uid: str, task_id: str) -> Task:
        return await self._repository.apply_transition(uid, task_id, complete)

    async def reopen_task(self, uid: str, task_id: str) -> Task:
        return await self._repository.apply_transition(uid, task_id, reopen)

    async def trash_task(self, uid: str, task_id: str) -> Task:
        return await self._repository.apply_transition(uid, task_id, move_to_trash)

    async def restore_task(self, uid: str, task_id: str) -> Task:
        return await self._repository.apply_transition(uid, task_id, restore)

    async def delete_task(self, uid: str, task_id: str) -> None:
        await self._repository.delete(uid, task_id)

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
