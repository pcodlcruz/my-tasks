import re
from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, Response, status

from mytasks_api.auth import CurrentUser, get_current_user
from mytasks_api.domain.task import Scope, TaskNotFoundError
from mytasks_api.schemas.task import TaskCreate, TaskOut, TaskPage, TaskUpdate
from mytasks_api.services.task_service import TaskService, get_task_service

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])

# Firestore genera identificadores alfanuméricos y rechaza los reservados (`__algo__`).
# Cualquier otra forma no puede corresponder a una tarea: se trata como inexistente.
_TASK_ID_PATTERN = re.compile(r"(?!__.*__$)[A-Za-z0-9_-]{1,128}")


async def valid_task_id(
    task_id: str = Path(min_length=1, max_length=128),
    _: CurrentUser = Depends(get_current_user),
) -> str:
    # Depende de la autenticación para que un 401 nunca quede tapado por un 404.
    if _TASK_ID_PATTERN.fullmatch(task_id) is None:
        raise TaskNotFoundError(task_id)
    return task_id


TaskId = Depends(valid_task_id)


@router.get("", response_model=TaskPage)
async def list_tasks(
    view: Literal["board", "history", "trash"] = Query(...),
    scope: Scope | None = Query(default=None),
    cursor: str | None = Query(default=None, max_length=512),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskPage:
    if view == "history":
        tasks, next_cursor = await service.list_history(current_user.uid, cursor, limit)
    elif view == "trash":
        tasks, next_cursor = await service.list_trash(current_user.uid, cursor, limit)
    else:
        tasks, next_cursor = await service.list_board(current_user.uid, scope), None
    return TaskPage(items=[TaskOut.from_task(task) for task in tasks], next_cursor=next_cursor)


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


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    payload: TaskUpdate,
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    task = await service.update_task(current_user.uid, task_id, payload)
    return TaskOut.from_task(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> Response:
    await service.delete_task(current_user.uid, task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{task_id}/complete", response_model=TaskOut)
async def complete_task(
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    return TaskOut.from_task(await service.complete_task(current_user.uid, task_id))


@router.post("/{task_id}/reopen", response_model=TaskOut)
async def reopen_task(
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    return TaskOut.from_task(await service.reopen_task(current_user.uid, task_id))


@router.post("/{task_id}/trash", response_model=TaskOut)
async def trash_task(
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    return TaskOut.from_task(await service.trash_task(current_user.uid, task_id))


@router.post("/{task_id}/restore", response_model=TaskOut)
async def restore_task(
    task_id: str = TaskId,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskOut:
    return TaskOut.from_task(await service.restore_task(current_user.uid, task_id))
