import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.cloud import firestore

from mytasks_api.config import Settings, get_settings
from mytasks_api.domain.account import (
    AccessDeniedError,
    AccountAlreadyActiveError,
    AccountNotFoundError,
    AdminAccountProtectedError,
    InvalidEmailError,
    InvitationNotFoundError,
    PendingInvitationLimitError,
)
from mytasks_api.domain.avatar_image import AvatarTooLargeError, AvatarUnsupportedError
from mytasks_api.domain.profile import AvatarNotFoundError, AvatarRateLimitedError
from mytasks_api.domain.progress import (
    InvalidDayRangeError,
    InvalidMissionError,
    ProgressDayNotFoundError,
)
from mytasks_api.domain.recurrence import InvalidRecurrenceError
from mytasks_api.domain.schedule import (
    MAX_SCHEDULES,
    ScheduleFinishedError,
    ScheduleLimitError,
    ScheduleNotFoundError,
)
from mytasks_api.domain.task import (
    MAX_ACTIVE_TASKS,
    ActiveTaskLimitError,
    InvalidCursorError,
    InvalidTransitionError,
    TaskNotFoundError,
)
from mytasks_api.logging_config import configure_logging, request_id_var
from mytasks_api.readiness import ReadinessProbe
from mytasks_api.repositories.task_repository import get_firestore_client
from mytasks_api.routers.admin import router as admin_router
from mytasks_api.routers.me import router as me_router
from mytasks_api.routers.profile import avatar_router
from mytasks_api.routers.profile import router as profile_router
from mytasks_api.routers.progress import router as progress_router
from mytasks_api.routers.schedules import router as schedules_router
from mytasks_api.routers.tasks import router as tasks_router
from mytasks_api.schemas.task import ErrorOut, ReadinessOut
from mytasks_api.services.access_service import MAX_PENDING_INVITATIONS

# The API only uses these methods and headers (contract in openapi.yaml).
ALLOWED_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"]
ALLOWED_HEADERS = ["Authorization", "Content-Type"]

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


def get_firestore_client_factory() -> Callable[[], firestore.AsyncClient]:
    # A dependency that returns the factory instead of the client, so /readyz can build the
    # client inside its own error handling (a failing dependency would escape it as a 500).
    return get_firestore_client


def _error_response(status_code: int, error: ErrorOut) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=jsonable_encoder(error))


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()
    settings.export_emulator_hosts()

    # The interactive docs and the schema are only published in local mode.
    docs_options: dict[str, Any] = (
        {} if settings.is_local else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    )
    app = FastAPI(title="MyTasks API", **docs_options)
    # One probe per app: its cached result is per instance, and the tests can reset it.
    readiness = ReadinessProbe()
    app.state.readiness = readiness

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
    )

    # Added after CORS so it wraps it: the security headers and the request id also
    # appear on preflight responses.
    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # The server generates the id; any id sent by the client is ignored so it
        # cannot inject text into the logs.
        request_id = uuid.uuid4().hex
        token = request_id_var.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        for header, value in SECURITY_HEADERS.items():
            # A response that sets its own caching (the avatar image) keeps it; everything else
            # is `no-store`.
            if header == "Cache-Control" and header in response.headers:
                continue
            response.headers[header] = value
        return response

    app.include_router(me_router)
    app.include_router(profile_router)
    app.include_router(avatar_router)
    app.include_router(progress_router)
    app.include_router(schedules_router)
    app.include_router(admin_router)
    app.include_router(tasks_router)

    # Anonymous and data-free on purpose: they are probed by the deploy pipeline and by
    # Cloud Run, which cannot present a token.
    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "version": settings.app_version}

    # The same answer under a path Cloud Run lets through: the frontend of Google intercepts
    # /healthz on run.app and never forwards it to the container, so the deploy pipeline and the
    # owner use /health there. /healthz stays for local runs and Docker. It is a separate function
    # on purpose: renaming healthz would change its operationId in the API contract.
    @app.get("/health")
    async def health() -> dict[str, str]:
        return await healthz()

    @app.get("/readyz", responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessOut}})
    async def readyz(
        client_factory: Callable[[], firestore.AsyncClient] = Depends(get_firestore_client_factory),
    ) -> JSONResponse:
        if not await readiness.is_ready(client_factory):
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "unavailable"},
            )
        return JSONResponse(status_code=status.HTTP_200_OK, content={"status": "ready"})

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail and "message" in detail:
            error = ErrorOut.model_validate(detail)
        else:
            error = ErrorOut(code="error", message=str(detail))
        return _error_response(exc.status_code, error)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        error = ErrorOut(
            code="validation_error",
            message="La entrada no es válida.",
            details=jsonable_encoder(exc.errors()),
        )
        return _error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, error)

    @app.exception_handler(AccessDeniedError)
    async def access_denied_handler(_: Request, __: AccessDeniedError) -> JSONResponse:
        # One message for every cause (no invitation, revoked, wrong role): it must not
        # reveal whether an address is invited or has an account (FR-017).
        error = ErrorOut(code="access_denied", message="No tienes acceso a esta aplicación.")
        return _error_response(status.HTTP_403_FORBIDDEN, error)

    @app.exception_handler(InvalidEmailError)
    async def invalid_email_handler(_: Request, __: InvalidEmailError) -> JSONResponse:
        error = ErrorOut(code="validation_error", message="El correo no tiene un formato válido.")
        return _error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, error)

    @app.exception_handler(AccountAlreadyActiveError)
    async def account_already_active_handler(
        _: Request, __: AccountAlreadyActiveError
    ) -> JSONResponse:
        error = ErrorOut(code="already_active", message="Esa persona ya tiene acceso.")
        return _error_response(status.HTTP_409_CONFLICT, error)

    @app.exception_handler(PendingInvitationLimitError)
    async def invitation_limit_handler(_: Request, __: PendingInvitationLimitError) -> JSONResponse:
        error = ErrorOut(
            code="invitation_limit_reached",
            message=(
                f"Hay {MAX_PENDING_INVITATIONS} invitaciones pendientes. "
                "Revoca alguna o espera a que se acepte."
            ),
        )
        return _error_response(status.HTTP_409_CONFLICT, error)

    @app.exception_handler(AdminAccountProtectedError)
    async def admin_protected_handler(_: Request, __: AdminAccountProtectedError) -> JSONResponse:
        error = ErrorOut(
            code="admin_protected",
            message="No se puede retirar el acceso a un administrador.",
        )
        return _error_response(status.HTTP_409_CONFLICT, error)

    @app.exception_handler(AccountNotFoundError)
    async def account_not_found_handler(_: Request, __: AccountNotFoundError) -> JSONResponse:
        error = ErrorOut(code="not_found", message="La cuenta no existe.")
        return _error_response(status.HTTP_404_NOT_FOUND, error)

    @app.exception_handler(InvitationNotFoundError)
    async def invitation_not_found_handler(_: Request, __: InvitationNotFoundError) -> JSONResponse:
        error = ErrorOut(
            code="not_found", message="No hay una invitación pendiente para ese correo."
        )
        return _error_response(status.HTTP_404_NOT_FOUND, error)

    @app.exception_handler(TaskNotFoundError)
    async def task_not_found_handler(_: Request, __: TaskNotFoundError) -> JSONResponse:
        error = ErrorOut(code="not_found", message="La tarea no existe.")
        return _error_response(status.HTTP_404_NOT_FOUND, error)

    @app.exception_handler(InvalidCursorError)
    async def invalid_cursor_handler(_: Request, __: InvalidCursorError) -> JSONResponse:
        error = ErrorOut(code="validation_error", message="El cursor no es válido.")
        return _error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, error)

    @app.exception_handler(InvalidTransitionError)
    async def invalid_transition_handler(_: Request, __: InvalidTransitionError) -> JSONResponse:
        error = ErrorOut(code="invalid_transition", message="La tarea no admite esa operación.")
        return _error_response(status.HTTP_409_CONFLICT, error)

    @app.exception_handler(ActiveTaskLimitError)
    async def active_task_limit_handler(_: Request, __: ActiveTaskLimitError) -> JSONResponse:
        error = ErrorOut(
            code="task_limit_reached",
            message=(
                f"Has alcanzado el límite de {MAX_ACTIVE_TASKS} tareas activas. "
                "Completa o elimina alguna para poder añadir otra."
            ),
        )
        return _error_response(status.HTTP_409_CONFLICT, error)

    @app.exception_handler(AvatarTooLargeError)
    async def avatar_too_large_handler(_: Request, __: AvatarTooLargeError) -> JSONResponse:
        error = ErrorOut(code="avatar_too_large", message="La imagen supera los 2 MB.")
        return _error_response(status.HTTP_413_CONTENT_TOO_LARGE, error)

    @app.exception_handler(AvatarUnsupportedError)
    async def avatar_unsupported_handler(_: Request, __: AvatarUnsupportedError) -> JSONResponse:
        error = ErrorOut(
            code="avatar_unsupported",
            message="La imagen no es válida. Usa un archivo JPEG, PNG o WebP.",
        )
        return _error_response(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, error)

    @app.exception_handler(AvatarRateLimitedError)
    async def avatar_rate_limited_handler(_: Request, exc: AvatarRateLimitedError) -> JSONResponse:
        error = ErrorOut(
            code="avatar_rate_limited",
            message=(
                "Has subido demasiadas imágenes. Espera unos minutos antes de volver a intentarlo."
            ),
        )
        response = _error_response(status.HTTP_429_TOO_MANY_REQUESTS, error)
        response.headers["Retry-After"] = str(exc.retry_after_seconds)
        return response

    @app.exception_handler(AvatarNotFoundError)
    async def avatar_not_found_handler(_: Request, __: AvatarNotFoundError) -> JSONResponse:
        error = ErrorOut(code="avatar_not_found", message="No hay una imagen de avatar subida.")
        return _error_response(status.HTTP_404_NOT_FOUND, error)

    @app.exception_handler(InvalidMissionError)
    async def invalid_mission_handler(_: Request, exc: InvalidMissionError) -> JSONResponse:
        # A task of someone else is "not active" here, like a missing one: the answer never
        # reveals whether an id exists in another account.
        error = ErrorOut(code="mission_invalid_task", message=str(exc))
        return _error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, error)

    @app.exception_handler(InvalidDayRangeError)
    async def invalid_day_range_handler(_: Request, exc: InvalidDayRangeError) -> JSONResponse:
        error = ErrorOut(code="validation_error", message=str(exc))
        return _error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, error)

    @app.exception_handler(ProgressDayNotFoundError)
    async def progress_day_not_found_handler(
        _: Request, __: ProgressDayNotFoundError
    ) -> JSONResponse:
        # The same answer for a day that never existed, one that is not a date and, for another
        # account, one that exists: it never reveals anything about someone else's progress.
        error = ErrorOut(code="not_found", message="No hay progreso registrado ese día.")
        return _error_response(status.HTTP_404_NOT_FOUND, error)

    @app.exception_handler(ScheduleNotFoundError)
    async def schedule_not_found_handler(_: Request, __: ScheduleNotFoundError) -> JSONResponse:
        error = ErrorOut(code="not_found", message="La programación no existe.")
        return _error_response(status.HTTP_404_NOT_FOUND, error)

    @app.exception_handler(ScheduleLimitError)
    async def schedule_limit_handler(_: Request, __: ScheduleLimitError) -> JSONResponse:
        error = ErrorOut(
            code="schedule_limit",
            message=(
                f"Has alcanzado el límite de {MAX_SCHEDULES} tareas programadas. "
                "Elimina alguna para poder crear otra."
            ),
        )
        return _error_response(status.HTTP_409_CONFLICT, error)

    @app.exception_handler(ScheduleFinishedError)
    async def schedule_finished_handler(_: Request, __: ScheduleFinishedError) -> JSONResponse:
        error = ErrorOut(
            code="schedule_finished",
            message="Esta programación ya ha terminado y no se puede cambiar.",
        )
        return _error_response(status.HTTP_409_CONFLICT, error)

    @app.exception_handler(InvalidRecurrenceError)
    async def invalid_recurrence_handler(_: Request, exc: InvalidRecurrenceError) -> JSONResponse:
        error = ErrorOut(code="validation_error", message=str(exc))
        return _error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, error)

    return app
