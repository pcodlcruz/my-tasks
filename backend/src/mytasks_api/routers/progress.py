from fastapi import APIRouter, Depends, Response, status

from mytasks_api.auth import CurrentUser, get_active_user
from mytasks_api.schemas.progress import AckIn, MissionIn, ProgressOut
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
