import io
import json
import logging

import pytest

from mytasks_api.logging_config import JsonFormatter, email_fingerprint, request_id_var

pytestmark = pytest.mark.unit


def _log_line(**extra: object) -> dict[str, object]:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger(f"test.json.{id(stream)}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)
    logger.info("task_transition", extra=extra)
    parsed: dict[str, object] = json.loads(stream.getvalue())
    return parsed


def test_json_formatter_emits_severity_message_and_structured_fields() -> None:
    line = _log_line(action="trash", uid="user-1", task_id="task-1")

    assert line["severity"] == "INFO"
    assert line["message"] == "task_transition"
    assert line["action"] == "trash"
    assert line["uid"] == "user-1"
    assert line["task_id"] == "task-1"
    assert "time" in line


def test_json_formatter_includes_the_request_id_when_there_is_one() -> None:
    token = request_id_var.set("abc123")
    try:
        line = _log_line(action="delete")
    finally:
        request_id_var.reset(token)

    assert line["request_id"] == "abc123"


def test_json_formatter_never_emits_unlisted_fields() -> None:
    line = _log_line(action="trash", token="secret-token", title="Contenido privado")

    assert "token" not in line
    assert "title" not in line


def test_json_formatter_emits_the_access_audit_fields() -> None:
    line = _log_line(action="revoke", actor_uid="admin-1", target="3f2a9c1b7d4e")

    assert line["actor_uid"] == "admin-1"
    assert line["target"] == "3f2a9c1b7d4e"


def test_email_fingerprint_is_stable_short_and_hides_the_address() -> None:
    first = email_fingerprint("ana@example.com")

    assert first == email_fingerprint("ana@example.com")
    assert first != email_fingerprint("bob@example.com")
    assert len(first) == 12
    assert "ana" not in first


def test_json_formatter_emits_the_names_of_the_fields_a_profile_event_changed() -> None:
    line = _log_line(uid="user-1", fields="density,theme")

    assert line["uid"] == "user-1"
    assert line["fields"] == "density,theme"


def test_json_formatter_emits_the_size_of_an_uploaded_avatar() -> None:
    line = _log_line(uid="user-1", size="18432")

    assert line["uid"] == "user-1"
    assert line["size"] == "18432"


def test_json_formatter_emits_the_day_and_count_of_a_progress_event() -> None:
    line = _log_line(uid="user-1", day="2026-11-03", count="2")

    assert line["day"] == "2026-11-03"
    assert line["count"] == "2"


def test_json_formatter_never_emits_task_titles_of_a_progress_event() -> None:
    line = _log_line(uid="user-1", day="2026-11-03", title="Pagar alquiler", task_ids=["a"])

    assert "title" not in line
    assert "task_ids" not in line


@pytest.mark.parametrize(
    "event",
    [
        "schedule_created",
        "schedule_updated",
        "schedule_deleted",
        "schedule_generated",
        "schedule_skipped_limit",
    ],
)
def test_json_formatter_emits_only_ids_and_the_day_of_a_schedule_event(event: str) -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger(f"test.json.schedule.{event}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)

    logger.info(
        event,
        extra={
            "uid": "user-1",
            "schedule_id": "sched-1",
            "day": "2026-11-03",
            "title": "Pagar el alquiler",
            "description": "Detalle privado",
            "recurrence": {"kind": "daily"},
        },
    )

    line: dict[str, object] = json.loads(stream.getvalue())
    assert line["message"] == event
    assert line["uid"] == "user-1"
    assert line["schedule_id"] == "sched-1"
    assert line["day"] == "2026-11-03"
    assert {"title", "description", "recurrence"}.isdisjoint(line)
