from fastapi import APIRouter, Depends, status

from mytasks_api.auth import CurrentUser, get_current_user
from mytasks_api.schemas.access import MeOut
from mytasks_api.schemas.task import ErrorOut
from mytasks_api.services.access_service import AccessService, get_access_service

router = APIRouter(prefix="/api/v1", tags=["access"])


@router.get(
    "/me",
    response_model=MeOut,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
    },
)
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    service: AccessService = Depends(get_access_service),
) -> MeOut:
    """The account behind the session. The only endpoint that can create one: it accepts a
    pending invitation, or applies the bootstrap rule for the first administrator."""
    account = await service.resolve_session(
        current_user.uid, current_user.email, current_user.email_verified
    )
    return MeOut(uid=account.uid, email=account.email, role=account.role)
