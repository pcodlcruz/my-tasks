from fastapi import APIRouter, Depends, Path

from mytasks_api.auth import CurrentUser, get_current_user
from mytasks_api.schemas.task import TaskOut
from mytasks_api.services.task_service import TaskService, get_task_service

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])

TaskId = Path(min_length=1, max_length=128)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    task = await service.get_task(current_user.uid, task_id)
    return TaskOut.from_task(task)
