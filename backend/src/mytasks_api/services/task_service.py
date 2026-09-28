from fastapi import Depends

from mytasks_api.domain.task import Scope, Task, TaskNotFoundError
from mytasks_api.repositories.task_repository import TaskRepository, get_task_repository
from mytasks_api.schemas.task import TaskCreate


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

    async def list_board(self, uid: str, scope: Scope | None = None) -> list[Task]:
        tasks = await self._repository.list_board(uid, scope)
        return sorted(tasks, key=lambda task: task.created_at)


def get_task_service(
    repository: TaskRepository = Depends(get_task_repository),
) -> TaskService:
    return TaskService(repository)
