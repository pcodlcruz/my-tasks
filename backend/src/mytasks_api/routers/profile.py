from fastapi import APIRouter, Depends, status

from mytasks_api.auth import CurrentUser, get_active_user
from mytasks_api.schemas.profile import ProfileOut, ProfileUpdateIn
from mytasks_api.schemas.task import ErrorOut
from mytasks_api.services.profile_service import ProfileService, get_profile_service

# Every operation needs an active account, and the `uid` comes only from the token: no
# parameter of the request can point to someone else's profile.
router = APIRouter(
    prefix="/api/v1/me/profile",
    tags=["profile"],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
    },
)


@router.get("", response_model=ProfileOut, status_code=status.HTTP_200_OK)
async def get_profile(
    current_user: CurrentUser = Depends(get_active_user),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileOut:
    return ProfileOut.from_profile(await service.get_profile(current_user.uid))


@router.patch(
    "",
    response_model=ProfileOut,
    status_code=status.HTTP_200_OK,
    responses={status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ErrorOut}},
)
async def update_profile(
    payload: ProfileUpdateIn,
    current_user: CurrentUser = Depends(get_active_user),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileOut:
    return ProfileOut.from_profile(await service.update_profile(current_user.uid, payload))


@router.delete("", response_model=ProfileOut, status_code=status.HTTP_200_OK)
async def reset_profile(
    current_user: CurrentUser = Depends(get_active_user),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileOut:
    return ProfileOut.from_profile(await service.reset_profile(current_user.uid))
