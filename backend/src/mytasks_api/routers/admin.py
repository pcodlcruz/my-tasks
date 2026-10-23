import re

from fastapi import APIRouter, Depends, Path, Response, status

from mytasks_api.auth import CurrentUser, require_admin
from mytasks_api.domain.account import AccountNotFoundError, InviteOutcome
from mytasks_api.schemas.access import (
    AccessListOut,
    AccountOut,
    InvitationIn,
    InvitationOut,
    InviteResultOut,
)
from mytasks_api.schemas.task import ErrorOut
from mytasks_api.services.access_service import AccessService, get_access_service

# Every operation here needs an active account with the admin role (`require_admin`).
router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
    },
)

# Firebase uids are alphanumeric; Firestore rejects reserved ids (`__something__`). Any other
# shape cannot be an account, so it is answered as a missing one, like a malformed task id.
_UID_PATTERN = re.compile(r"(?!__.*__$)[A-Za-z0-9_-]{1,128}")


@router.get("/access", response_model=AccessListOut)
async def list_access(
    _: CurrentUser = Depends(require_admin),
    service: AccessService = Depends(get_access_service),
) -> AccessListOut:
    invitations, accounts = await service.list_access()
    return AccessListOut(
        invitations=[InvitationOut.from_invitation(item) for item in invitations],
        accounts=[AccountOut.from_account(item) for item in accounts],
    )


@router.post(
    "/invitations",
    status_code=status.HTTP_201_CREATED,
    response_model=InviteResultOut,
    responses={
        status.HTTP_200_OK: {"model": InviteResultOut},
        status.HTTP_409_CONFLICT: {"model": ErrorOut},
    },
)
async def create_invitation(
    payload: InvitationIn,
    response: Response,
    admin: CurrentUser = Depends(require_admin),
    service: AccessService = Depends(get_access_service),
) -> InviteResultOut:
    result = await service.invite(admin.uid, payload.email)
    if result.outcome is InviteOutcome.ALREADY_PENDING:
        response.status_code = status.HTTP_200_OK
    return InviteResultOut(outcome=result.outcome, email=result.email)


@router.delete(
    "/invitations/{email}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
async def revoke_invitation(
    email: str = Path(min_length=1, max_length=254),
    admin: CurrentUser = Depends(require_admin),
    service: AccessService = Depends(get_access_service),
) -> Response:
    await service.revoke_invitation(admin.uid, email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/users/{uid}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
        status.HTTP_409_CONFLICT: {"model": ErrorOut},
    },
)
async def revoke_user_access(
    uid: str = Path(),
    admin: CurrentUser = Depends(require_admin),
    service: AccessService = Depends(get_access_service),
) -> Response:
    if _UID_PATTERN.fullmatch(uid) is None:
        raise AccountNotFoundError(uid)
    await service.revoke_account(admin.uid, uid)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
