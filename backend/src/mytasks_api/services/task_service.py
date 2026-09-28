from fastapi import Depends

from mytasks_api.domain.task import Task, TaskNotFoundError
from mytasks_api.repositories.task_repository import TaskRepository, get_task_repository


class TaskService:
    def __init__(self, repository: TaskRepository) -> None:
        self._repository = repository

    async def get_task(self, uid: str, task_id: str) -> Task:
        task = await self._repository.get(uid, task_id)
        if task is None:
            raise TaskNotFoundError(task_id)
        return task


def get_task_service(
    repository: TaskRepository = Depends(get_task_repository),
) -> TaskService:
    return TaskService(repository)
