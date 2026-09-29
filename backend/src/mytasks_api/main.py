from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from mytasks_api.config import get_settings
from mytasks_api.domain.task import InvalidCursorError, InvalidTransitionError, TaskNotFoundError
from mytasks_api.routers.tasks import router as tasks_router
from mytasks_api.schemas.task import ErrorOut

settings = get_settings()

app = FastAPI(title="MyTasks API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        error = ErrorOut.model_validate(detail)
    else:
        error = ErrorOut(code="error", message=str(detail))
    return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(error))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    error = ErrorOut(
        code="validation_error",
        message="La entrada no es válida.",
        details=jsonable_encoder(exc.errors()),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=jsonable_encoder(error)
    )


@app.exception_handler(TaskNotFoundError)
async def task_not_found_handler(_: Request, __: TaskNotFoundError) -> JSONResponse:
    error = ErrorOut(code="not_found", message="La tarea no existe.")
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=jsonable_encoder(error))


@app.exception_handler(InvalidCursorError)
async def invalid_cursor_handler(_: Request, __: InvalidCursorError) -> JSONResponse:
    error = ErrorOut(code="validation_error", message="El cursor no es válido.")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=jsonable_encoder(error)
    )


@app.exception_handler(InvalidTransitionError)
async def invalid_transition_handler(_: Request, __: InvalidTransitionError) -> JSONResponse:
    error = ErrorOut(code="invalid_transition", message="La tarea no admite esa operación.")
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=jsonable_encoder(error))
