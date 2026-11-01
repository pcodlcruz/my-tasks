import logging
from datetime import UTC, datetime
from typing import Protocol

from fastapi import Depends, HTTPException, Request, status

from mytasks_api.config import Settings, get_settings
from mytasks_api.logging_config import log_event

logger = logging.getLogger(__name__)

# Lets the end-to-end tests move the server's "now" across days (research R15). Only honored with
# APP_ENV=local, the one environment that already admits the emulators; anywhere else it is
# ignored and logged, so a forged header can never change anyone's progress.
TEST_NOW_HEADER = "X-Test-Now"


class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class FixedClock:
    def __init__(self, moment: datetime) -> None:
        self._moment = moment.astimezone(UTC)

    def now(self) -> datetime:
        return self._moment


def _parse_test_now(raw: str) -> datetime:
    try:
        moment = datetime.fromisoformat(raw)
    except ValueError as error:
        raise _invalid_test_now() from error
    if moment.tzinfo is None:
        raise _invalid_test_now()
    return moment


def _invalid_test_now() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={
            "code": "validation_error",
            "message": f"{TEST_NOW_HEADER} debe ser un instante ISO 8601 con zona horaria.",
        },
    )


def get_clock(request: Request, settings: Settings = Depends(get_settings)) -> Clock:
    raw = request.headers.get(TEST_NOW_HEADER)
    if raw is None:
        return SystemClock()
    if not settings.is_local:
        log_event(logger, logging.WARNING, "test_clock_ignored", reason=settings.app_env)
        return SystemClock()
    return FixedClock(_parse_test_now(raw))
