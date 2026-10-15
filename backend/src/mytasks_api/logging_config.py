import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

PACKAGE_LOGGER_NAME = "mytasks_api"

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Closed list of fields allowed in a log entry: never the token nor task content
# (Principle III). Anything not listed here is dropped.
_LOGGED_FIELDS = ("action", "uid", "task_id", "reason")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        request_id = getattr(record, "request_id", None) or request_id_var.get()
        if request_id:
            payload["request_id"] = request_id
        for field in _LOGGED_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, ensure_ascii=False)


def log_event(logger: logging.Logger, level: int, message: str, **fields: str) -> None:
    logger.log(level, message, extra={**fields, "request_id": request_id_var.get()})


_configured_handler: logging.Handler | None = None


def configure_logging() -> None:
    """Make the package logger write structured JSON to stdout (idempotent)."""
    global _configured_handler
    package_logger = logging.getLogger(PACKAGE_LOGGER_NAME)
    package_logger.setLevel(logging.INFO)
    if _configured_handler is not None:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    package_logger.addHandler(handler)
    _configured_handler = handler
