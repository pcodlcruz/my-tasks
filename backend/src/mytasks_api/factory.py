import asyncio
import logging
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
from mytasks_api.domain.task import (
    MAX_ACTIVE_TASKS,
    ActiveTaskLimitError,
    InvalidCursorError,
    InvalidTransitionError,
    TaskNotFoundError,
)
from mytasks_api.logging_config import configure_logging, log_event, request_id_var
from mytasks_api.repositories.task_repository import get_firestore_client
from mytasks_api.routers.tasks import router as tasks_router
from mytasks_api.schemas.task import ErrorOut, ReadinessOut

logger = logging.getLogger(__name__)

READINESS_COLLECTION = "_readyz"
READINESS_DOCUMENT = "probe"
READINESS_TIMEOUT_SECONDS = 3.0

# The API only uses these methods and headers (contract in openapi.yaml).
ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"]
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
            response.headers[header] = value
        return response

    app.include_router(tasks_router)

    # Anonymous and data-free on purpose: they are probed by the deploy pipeline and by
    # Cloud Run, which cannot present a token.
    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "version": settings.app_version}

    @app.get("/readyz", responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessOut}})
    async def readyz(
        client_factory: Callable[[], firestore.AsyncClient] = Depends(get_firestore_client_factory),
    ) -> JSONResponse:
        try:
            async with asyncio.timeout(READINESS_TIMEOUT_SECONDS):
                # Building the client discovers credentials, which can fail or block for
                # seconds when the runtime identity is broken: it belongs inside the
                # try and off the event loop, so a broken service answers 503, not 500.
                client = await asyncio.to_thread(client_factory)
                # Minimal read: it proves the runtime identity can reach Firestore
                # without touching user data (the document does not need to exist).
                await client.collection(READINESS_COLLECTION).document(READINESS_DOCUMENT).get()
        except Exception as exc:
            # The cause goes to the log, never to the anonymous response.
            log_event(logger, logging.ERROR, "readiness_failed", reason=type(exc).__name__)
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

    return app
