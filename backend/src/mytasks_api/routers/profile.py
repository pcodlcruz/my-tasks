from fastapi import APIRouter, Depends, Query, Request, Response, status

from mytasks_api.auth import CurrentUser, get_active_user
from mytasks_api.domain.avatar_image import MAX_INPUT_BYTES, AvatarTooLargeError
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


# The avatar endpoints. Same rules as the profile: an active account and a `uid` that comes only
# from the token, so no route, query or header can point to someone else's image.
avatar_router = APIRouter(
    prefix="/api/v1/me/avatar",
    tags=["profile"],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
    },
)

_AVATAR_CACHE_CONTROL = "private, max-age=31536000, immutable"
_UPLOAD_CONTENT = {"type": "string", "format": "binary", "maxLength": MAX_INPUT_BYTES}


async def _read_limited_body(request: Request) -> bytes:
    """The request body, never more than `MAX_INPUT_BYTES`: refused up front if the declared
    length is too big, and cut off as soon as the bytes actually received pass the limit (a
    client can lie about, or leave out, the length)."""
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_INPUT_BYTES:
        raise AvatarTooLargeError
    received = bytearray()
    async for chunk in request.stream():
        received.extend(chunk)
        if len(received) > MAX_INPUT_BYTES:
            raise AvatarTooLargeError
    return bytes(received)


@avatar_router.get(
    "",
    status_code=status.HTTP_200_OK,
    response_class=Response,
    responses={
        status.HTTP_200_OK: {
            "description": "Imagen reprocesada (WebP cuadrado de 256×256).",
            "content": {"image/webp": {"schema": {"type": "string", "format": "binary"}}},
        },
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
async def get_avatar(
    # Only for the browser cache (the client asks with `?v=<version>`): the server ignores it.
    v: int | None = Query(default=None, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    service: ProfileService = Depends(get_profile_service),
) -> Response:
    image = await service.get_avatar(current_user.uid)
    return Response(
        content=image,
        media_type="image/webp",
        # `Vary: Authorization`: the URL (`?v=1`) is the same for every person, so the browser
        # must only reuse a cached image for requests made with the same credentials; otherwise
        # one person could be shown the picture another cached on a shared browser.
        headers={"Cache-Control": _AVATAR_CACHE_CONTROL, "Vary": "Authorization"},
    )


@avatar_router.put(
    "",
    response_model=ProfileOut,
    status_code=status.HTTP_200_OK,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "image/jpeg": {"schema": _UPLOAD_CONTENT},
                "image/png": {"schema": _UPLOAD_CONTENT},
                "image/webp": {"schema": _UPLOAD_CONTENT},
            },
        }
    },
    responses={
        status.HTTP_413_CONTENT_TOO_LARGE: {"model": ErrorOut},
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: {"model": ErrorOut},
        status.HTTP_429_TOO_MANY_REQUESTS: {"model": ErrorOut},
    },
)
async def upload_avatar(
    request: Request,
    current_user: CurrentUser = Depends(get_active_user),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileOut:
    # Authentication and the account are resolved by the dependency above, so nothing is read
    # from the body for a caller who is not allowed to upload.
    data = await _read_limited_body(request)
    return ProfileOut.from_profile(await service.upload_avatar(current_user.uid, data))


@avatar_router.delete("", response_model=ProfileOut, status_code=status.HTTP_200_OK)
async def delete_avatar(
    current_user: CurrentUser = Depends(get_active_user),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileOut:
    return ProfileOut.from_profile(await service.remove_avatar(current_user.uid))
