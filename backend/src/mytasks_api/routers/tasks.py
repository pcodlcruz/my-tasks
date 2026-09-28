from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, status

from mytasks_api.auth import CurrentUser, get_current_user
from mytasks_api.domain.task import Scope
from mytasks_api.schemas.task import TaskCreate, TaskOut, TaskPage
from mytasks_api.services.task_service import TaskService, get_task_service

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])

TaskId = Path(min_length=1, max_length=128)


@router.get("", response_model=TaskPage)
async def list_tasks(
    view: Literal["board"] = Query(...),
    scope: Scope | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskPage:
    tasks = await service.list_board(current_user.uid, scope)
    return TaskPage(items=[TaskOut.from_task(task) for task in tasks], next_cursor=None)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TaskOut)
async def create_task(
    payload: TaskCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    task = await service.create_task(current_user.uid, payload)
    return TaskOut.from_task(task)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    task = await service.get_task(current_user.uid, task_id)
    return TaskOut.from_task(task)
