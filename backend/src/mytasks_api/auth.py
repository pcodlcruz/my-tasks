import logging
from dataclasses import dataclass, replace

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from mytasks_api.config import Settings, get_settings
from mytasks_api.domain.account import Role
from mytasks_api.logging_config import log_event
from mytasks_api.services.access_service import AccessService, get_access_service

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    uid: str
    email: str | None
    # Whether Google verified the address: invitations and the bootstrap admin are only
    # honored for verified ones.
    email_verified: bool = False
    # Filled in by `get_active_user` from the account; a bare token carries no role.
    role: Role | None = None


def _init_firebase_app(settings: Settings) -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        return firebase_admin.initialize_app(options={"projectId": settings.google_cloud_project})


def _unauthenticated(reason: str) -> HTTPException:
    # Only the cause is logged, never the token nor the exception text: the message
    # of some SDK exceptions includes the received token.
    log_event(logger, logging.WARNING, "auth_failed", reason=reason)
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "unauthenticated", "message": "Falta el token o no es válido."},
    )


def _verifier_unavailable(error: Exception) -> HTTPException:
    log_event(logger, logging.ERROR, "auth_verifier_unavailable", reason=type(error).__name__)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "auth_unavailable",
            "message": "No se pudo verificar la sesión. Inténtalo de nuevo en unos segundos.",
        },
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if credentials is None:
        raise _unauthenticated("missing_token")

    _init_firebase_app(settings)
    try:
        # Revocation is not checked (`check_revoked`): a stolen token, or one from a
        # disabled account, stays valid until it expires (~1 h). Risk accepted by the
        # owner (security-review.md, LOW-004): checking costs one call per request.
        decoded = auth.verify_id_token(credentials.credentials)
    except auth.ExpiredIdTokenError as exc:
        raise _unauthenticated("expired_token") from exc
    except (auth.InvalidIdTokenError, ValueError) as exc:
        raise _unauthenticated("invalid_token") from exc
    except Exception as exc:
        # Failure of the verifier itself (network, Google certificates, SDK): it is not
        # the client's fault, so it is not answered with a 401.
        raise _verifier_unavailable(exc) from exc

    return CurrentUser(
        uid=decoded["uid"],
        email=decoded.get("email"),
        email_verified=decoded.get("email_verified") is True,
    )


async def get_active_user(
    current_user: CurrentUser = Depends(get_current_user),
    service: AccessService = Depends(get_access_service),
) -> CurrentUser:
    """A verified token is not enough: the caller must also hold an active account.

    Authentication (401) is always evaluated first; without an account the answer is 403.
    Any failure to read the account propagates as an error, so access is never granted by
    default (FR-018).
    """
    account = await service.require_active(current_user.uid)
    return replace(current_user, role=account.role)
