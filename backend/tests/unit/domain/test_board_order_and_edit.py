from datetime import UTC, datetime, timedelta

import pytest

from mytasks_api.domain.task import (
    BoardOrder,
    InvalidTransitionError,
    Scope,
    Status,
    Task,
    ensure_editable,
    sort_board,
)

pytestmark = pytest.mark.unit


def _task(**overrides: object) -> Task:
    now = datetime.now(UTC)
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
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
        "trashed_at": None,
        "purge_at": None,
    }
    defaults.update(overrides)
    return Task(**defaults)  # type: ignore[arg-type]


def test_sort_board_puts_pinned_tasks_first() -> None:
    now = datetime.now(UTC)
    older_pinned = _task(id="older-pinned", pinned=True, created_at=now - timedelta(days=1))
    newer_unpinned = _task(id="newer-unpinned", pinned=False, created_at=now)

    result = sort_board([newer_unpinned, older_pinned])

    assert [task.id for task in result] == ["older-pinned", "newer-unpinned"]


def test_sort_board_orders_by_created_at_ascending_within_same_pinned_state() -> None:
    now = datetime.now(UTC)
    first = _task(id="first", created_at=now - timedelta(minutes=5))
    second = _task(id="second", created_at=now)

    result = sort_board([second, first])

    assert [task.id for task in result] == ["first", "second"]


def test_sort_board_oldest_is_the_default_order() -> None:
    now = datetime.now(UTC)
    first = _task(id="first", created_at=now - timedelta(minutes=5))
    second = _task(id="second", created_at=now)

    assert [task.id for task in sort_board([second, first], BoardOrder.OLDEST)] == [
        "first",
        "second",
    ]


def test_sort_board_newest_orders_by_created_at_descending() -> None:
    now = datetime.now(UTC)
    first = _task(id="first", created_at=now - timedelta(minutes=5))
    second = _task(id="second", created_at=now)

    result = sort_board([first, second], BoardOrder.NEWEST)

    assert [task.id for task in result] == ["second", "first"]


@pytest.mark.parametrize("order", [BoardOrder.OLDEST, BoardOrder.NEWEST])
def test_sort_board_keeps_pinned_tasks_first_in_both_orders(order: BoardOrder) -> None:
    now = datetime.now(UTC)
    old_pinned = _task(id="old-pinned", pinned=True, created_at=now - timedelta(days=2))
    new_pinned = _task(id="new-pinned", pinned=True, created_at=now - timedelta(days=1))
    unpinned = _task(id="unpinned", pinned=False, created_at=now)

    result = sort_board([unpinned, new_pinned, old_pinned], order)

    assert {task.id for task in result[:2]} == {"old-pinned", "new-pinned"}
    assert result[2].id == "unpinned"


@pytest.mark.parametrize("order", [BoardOrder.OLDEST, BoardOrder.NEWEST])
def test_sort_board_breaks_ties_by_keeping_the_input_order(order: BoardOrder) -> None:
    moment = datetime.now(UTC)
    tasks = [_task(id=f"task-{index}", created_at=moment) for index in range(4)]

    result = sort_board(tasks, order)

    assert [task.id for task in result] == [task.id for task in tasks]


def test_ensure_editable_allows_active_task_out_of_trash() -> None:
    ensure_editable(_task(status=Status.ACTIVE, in_trash=False))


def test_ensure_editable_rejects_completed_task() -> None:
    with pytest.raises(InvalidTransitionError):
        ensure_editable(_task(status=Status.COMPLETED, in_trash=False))


def test_ensure_editable_rejects_task_in_trash() -> None:
    with pytest.raises(InvalidTransitionError):
        ensure_editable(_task(status=Status.ACTIVE, in_trash=True))
