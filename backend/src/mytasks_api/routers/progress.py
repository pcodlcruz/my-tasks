import re
from datetime import date

from fastapi import APIRouter, Depends, Path, Query, Response, status

from mytasks_api.auth import CurrentUser, get_active_user
from mytasks_api.domain.progress import ProgressDayNotFoundError
from mytasks_api.schemas.progress import (
    AckIn,
    MissionIn,
    ProgressDayDetailOut,
    ProgressDaysOut,
    ProgressOut,
    StatsOut,
)
from mytasks_api.schemas.task import ErrorOut
from mytasks_api.services.progress_service import ProgressService, get_progress_service

# Every operation needs an active account, and the `uid` comes only from the token. None of
# them accepts a score, streak, level or achievement from the client (FR-032): those are always
# computed here.
router = APIRouter(
    prefix="/api/v1/me/progress",
    tags=["progress"],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
    },
)

_DAY_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


async def valid_day(
    day: str = Path(min_length=1, max_length=32),
    _: CurrentUser = Depends(get_active_user),
) -> date:
    # Depends on authentication so a 401 is never masked by a 404. Anything that is not a real
    # date is answered like a day that does not exist.
    if _DAY_PATTERN.fullmatch(day) is not None:
        try:
            return date.fromisoformat(day)
        except ValueError:
            pass
    raise ProgressDayNotFoundError(day)


@router.get("", response_model=ProgressOut, status_code=status.HTTP_200_OK)
async def get_progress(
    current_user: CurrentUser = Depends(get_active_user),
    service: ProgressService = Depends(get_progress_service),
) -> ProgressOut:
    # May close past days on the way (research R1, R2): idempotent, so repeating it is harmless.
    return ProgressOut.from_snapshot(await service.get_progress(current_user.uid))


@router.post("/review", response_model=ProgressOut, status_code=status.HTTP_200_OK)
async def mark_review_seen(
    current_user: CurrentUser = Depends(get_active_user),
    service: ProgressService = Depends(get_progress_service),
) -> ProgressOut:
    return ProgressOut.from_snapshot(await service.mark_review_seen(current_user.uid))


@router.put(
    "/today/mission",
    response_model=ProgressOut,
    status_code=status.HTTP_200_OK,
    responses={status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ErrorOut}},
)
async def set_today_mission(
    payload: MissionIn,
    current_user: CurrentUser = Depends(get_active_user),
    service: ProgressService = Depends(get_progress_service),
) -> ProgressOut:
    return ProgressOut.from_snapshot(
        await service.set_mission(current_user.uid, list(payload.task_ids))
    )


@router.post(
    "/ack",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ErrorOut}},
)
async def acknowledge(
    payload: AckIn,
    current_user: CurrentUser = Depends(get_active_user),
    service: ProgressService = Depends(get_progress_service),
) -> Response:
    await service.acknowledge(
        current_user.uid, list(payload.announcement_ids), list(payload.notice_ids)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/days",
    response_model=ProgressDaysOut,
    status_code=status.HTTP_200_OK,
    responses={status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ErrorOut}},
)
async def list_days(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    current_user: CurrentUser = Depends(get_active_user),
    service: ProgressService = Depends(get_progress_service),
) -> ProgressDaysOut:
    # At most 84 days; read-only, it never closes a day.
    return ProgressDaysOut.from_snapshot(await service.list_days(current_user.uid, start, end))


@router.get(
    "/days/{day}",
    response_model=ProgressDayDetailOut,
    status_code=status.HTTP_200_OK,
    responses={status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
async def get_day(
    day: date = Depends(valid_day),
    current_user: CurrentUser = Depends(get_active_user),
    service: ProgressService = Depends(get_progress_service),
) -> ProgressDayDetailOut:
    return ProgressDayDetailOut.from_snapshot(await service.get_day(current_user.uid, day))


@router.get("/stats", response_model=StatsOut, status_code=status.HTTP_200_OK)
async def get_stats(
    current_user: CurrentUser = Depends(get_active_user),
    service: ProgressService = Depends(get_progress_service),
) -> StatsOut:
    return StatsOut.from_snapshot(await service.get_stats(current_user.uid))
