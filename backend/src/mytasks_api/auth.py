import logging
from dataclasses import dataclass

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from mytasks_api.config import Settings, get_settings
from mytasks_api.logging_config import log_event

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    uid: str
    email: str | None


def _init_firebase_app(settings: Settings) -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        return firebase_admin.initialize_app(options={"projectId": settings.google_cloud_project})


def _unauthenticated(reason: str) -> HTTPException:
    # Solo se registra la causa, nunca el token ni el texto de la excepción: el
    # mensaje de algunas excepciones del SDK incluye el token recibido.
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
        # No se comprueba la revocación (`check_revoked`): un token robado o de una cuenta
        # deshabilitada vale hasta que caduca (~1 h). Riesgo aceptado por el propietario
        # (security-review.md, LOW-004): la comprobación cuesta una llamada por petición.
        decoded = auth.verify_id_token(credentials.credentials)
    except auth.ExpiredIdTokenError as exc:
        raise _unauthenticated("expired_token") from exc
    except (auth.InvalidIdTokenError, ValueError) as exc:
        raise _unauthenticated("invalid_token") from exc
    except Exception as exc:
        # Fallo del propio verificador (red, certificados de Google, SDK): no es culpa
        # del cliente, así que no se le responde 401.
        raise _verifier_unavailable(exc) from exc

    return CurrentUser(uid=decoded["uid"], email=decoded.get("email"))
