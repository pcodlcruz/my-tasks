from datetime import UTC, datetime, timedelta

import pytest

from mytasks_api.domain.task import (
    TRASH_RETENTION,
    InvalidTransitionError,
    Scope,
    Status,
    Task,
    complete,
    ensure_purgeable,
    move_to_trash,
    reopen,
    restore,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)


def _task(**overrides: object) -> Task:
    created = NOW - timedelta(days=3)
    defaults: dict[str, object] = {
        "id": "task-1",
        "title": "Tarea",
        "description": "Descripción",
        "urgent": True,
        "important": True,
        "scope": Scope.PERSONAL,
        "pinned": False,
        "status": Status.ACTIVE,
        "in_trash": False,
        "created_at": created,
        "updated_at": created,
        "completed_at": None,
        "trashed_at": None,
        "purge_at": None,
    }
    defaults.update(overrides)
    return Task(**defaults)  # type: ignore[arg-type]


def _trashed(status: Status) -> Task:
    completed_at = NOW - timedelta(days=2) if status == Status.COMPLETED else None
    return _task(
        status=status,
        in_trash=True,
        completed_at=completed_at,
        trashed_at=NOW - timedelta(days=1),
        purge_at=NOW - timedelta(days=1) + TRASH_RETENTION,
    )


def test_complete_marks_active_task_as_completed_at_now() -> None:
    result = complete(_task(), NOW)

    assert result.status == Status.COMPLETED
    assert result.completed_at == NOW
    assert result.updated_at == NOW


def test_complete_rejects_completed_task() -> None:
    with pytest.raises(InvalidTransitionError):
        complete(_task(status=Status.COMPLETED, completed_at=NOW), NOW)


def test_complete_rejects_task_in_trash() -> None:
    with pytest.raises(InvalidTransitionError):
        complete(_trashed(Status.ACTIVE), NOW)


def test_reopen_returns_completed_task_to_active_without_completion_date() -> None:
    completed = _task(status=Status.COMPLETED, completed_at=NOW - timedelta(days=1))

    result = reopen(completed, NOW)

    assert result.status == Status.ACTIVE
    assert result.completed_at is None
    assert result.updated_at == NOW


def test_reopen_rejects_active_task() -> None:
    with pytest.raises(InvalidTransitionError):
        reopen(_task(), NOW)


def test_reopen_rejects_completed_task_in_trash() -> None:
    with pytest.raises(InvalidTransitionError):
        reopen(_trashed(Status.COMPLETED), NOW)


@pytest.mark.parametrize("status", [Status.ACTIVE, Status.COMPLETED])
def test_move_to_trash_sets_dates_and_keeps_status(status: Status) -> None:
    completed_at = NOW - timedelta(days=1) if status == Status.COMPLETED else None
    task = _task(status=status, completed_at=completed_at)

    result = move_to_trash(task, NOW)

    assert result.in_trash is True
    assert result.status == status
    assert result.completed_at == completed_at
    assert result.trashed_at == NOW
    assert result.updated_at == NOW


def test_move_to_trash_sets_purge_at_thirty_days_after_trashed_at() -> None:
    result = move_to_trash(_task(), NOW)

    assert result.purge_at == NOW + timedelta(days=30)


def test_move_to_trash_rejects_task_already_in_trash() -> None:
    with pytest.raises(InvalidTransitionError):
        move_to_trash(_trashed(Status.ACTIVE), NOW)


@pytest.mark.parametrize("status", [Status.ACTIVE, Status.COMPLETED])
def test_restore_clears_trash_dates_and_keeps_status(status: Status) -> None:
    trashed = _trashed(status)

    result = restore(trashed, NOW)

    assert result.in_trash is False
    assert result.trashed_at is None
    assert result.purge_at is None
    assert result.status == status
    assert result.completed_at == trashed.completed_at
    assert result.updated_at == NOW


def test_restore_rejects_task_not_in_trash() -> None:
    with pytest.raises(InvalidTransitionError):
        restore(_task(), NOW)


def test_ensure_purgeable_allows_task_in_trash() -> None:
    ensure_purgeable(_trashed(Status.ACTIVE))


def test_ensure_purgeable_rejects_task_out_of_trash() -> None:
    with pytest.raises(InvalidTransitionError):
        ensure_purgeable(_task())


def test_trash_retention_is_thirty_days() -> None:
    assert timedelta(days=30) == TRASH_RETENTION
