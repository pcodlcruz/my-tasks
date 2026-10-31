import re
from typing import Any

from fastapi import APIRouter, Depends, Path, Response, status

from mytasks_api.auth import CurrentUser, get_active_user
from mytasks_api.domain.schedule import NewSchedule, ScheduleNotFoundError
from mytasks_api.schemas.schedule import ScheduleIn, ScheduleOut, SchedulePage, ScheduleUpdateIn
from mytasks_api.schemas.task import ErrorOut
from mytasks_api.services.schedule_service import ScheduleService, get_schedule_service

# Every operation needs an active account, and the schedules are always those of the `uid` in
# the token: someone else's is answered like a missing one (404).
router = APIRouter(
    prefix="/api/v1/schedules",
    tags=["schedules"],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
    },
)

# Same shape as a task id (routers/tasks.py): Firestore's ids, never a reserved one.
_SCHEDULE_ID_PATTERN = re.compile(r"(?!__.*__$)[A-Za-z0-9_-]{1,128}")

_NOT_FOUND: dict[int | str, dict[str, Any]] = {status.HTTP_404_NOT_FOUND: {"model": ErrorOut}}
_FINISHED: dict[int | str, dict[str, Any]] = {status.HTTP_409_CONFLICT: {"model": ErrorOut}}


async def valid_schedule_id(
    schedule_id: str = Path(min_length=1, max_length=128),
    _: CurrentUser = Depends(get_active_user),
) -> str:
    # Depends on authentication so a 401 is never masked by a 404.
    if _SCHEDULE_ID_PATTERN.fullmatch(schedule_id) is None:
        raise ScheduleNotFoundError(schedule_id)
    return schedule_id


ScheduleId = Depends(valid_schedule_id)


@router.get("", response_model=SchedulePage, status_code=status.HTTP_200_OK)
async def list_schedules(
    current_user: CurrentUser = Depends(get_active_user),
    service: ScheduleService = Depends(get_schedule_service),
) -> SchedulePage:
    schedules = await service.list_all(current_user.uid)
    return SchedulePage(items=[ScheduleOut.from_schedule(item) for item in schedules])


@router.post(
    "",
    response_model=ScheduleOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_409_CONFLICT: {"model": ErrorOut},
        status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ErrorOut},
    },
)
async def create_schedule(
    payload: ScheduleIn,
    current_user: CurrentUser = Depends(get_active_user),
    service: ScheduleService = Depends(get_schedule_service),
) -> ScheduleOut:
    schedule = await service.create(
        current_user.uid,
        NewSchedule(
            title=payload.title,
            description=payload.description,
            urgent=payload.urgent,
            important=payload.important,
            scope=payload.scope,
            recurrence=payload.recurrence.to_recurrence(),
            next_occurrence=None,
        ),
    )
    return ScheduleOut.from_schedule(schedule)


@router.patch(
    "/{schedule_id}",
    response_model=ScheduleOut,
    status_code=status.HTTP_200_OK,
    responses={
        **_NOT_FOUND,
        **_FINISHED,
        status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ErrorOut},
    },
)
async def update_schedule(
    payload: ScheduleUpdateIn,
    schedule_id: str = ScheduleId,
    current_user: CurrentUser = Depends(get_active_user),
    service: ScheduleService = Depends(get_schedule_service),
) -> ScheduleOut:
    schedule = await service.update(current_user.uid, schedule_id, payload.to_changes())
    return ScheduleOut.from_schedule(schedule)


@router.delete(
    "/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=_NOT_FOUND,
)
async def delete_schedule(
    schedule_id: str = ScheduleId,
    current_user: CurrentUser = Depends(get_active_user),
    service: ScheduleService = Depends(get_schedule_service),
) -> Response:
    # The tasks it already generated stay where they are.
    await service.delete(current_user.uid, schedule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{schedule_id}/pause",
    response_model=ScheduleOut,
    status_code=status.HTTP_200_OK,
    responses={**_NOT_FOUND, **_FINISHED},
)
async def pause_schedule(
    schedule_id: str = ScheduleId,
    current_user: CurrentUser = Depends(get_active_user),
    service: ScheduleService = Depends(get_schedule_service),
) -> ScheduleOut:
    return ScheduleOut.from_schedule(await service.pause(current_user.uid, schedule_id))


@router.post(
    "/{schedule_id}/resume",
    response_model=ScheduleOut,
    status_code=status.HTTP_200_OK,
    responses={**_NOT_FOUND, **_FINISHED},
)
async def resume_schedule(
    schedule_id: str = ScheduleId,
    current_user: CurrentUser = Depends(get_active_user),
    service: ScheduleService = Depends(get_schedule_service),
) -> ScheduleOut:
    return ScheduleOut.from_schedule(await service.resume(current_user.uid, schedule_id))
