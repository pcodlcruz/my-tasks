from dataclasses import replace
from datetime import UTC, datetime

import pytest

from mytasks_api.domain.progress import (
    MISSION_BONUS,
    MISSION_TASK_POINTS,
    POINTS_PER_TASK,
    DaySettings,
    InvalidMissionError,
    PlayerState,
    ProgressDay,
    TaskFacts,
    apply_complete,
    apply_reopen,
    apply_trash,
    new_day,
    set_mission,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 3, 9, 0, tzinfo=UTC)
TODAY = "2026-11-03"


def _day(**changes: object) -> ProgressDay:
    base = new_day(TODAY, DaySettings(goal=3, active_weekdays=(1, 2, 3, 4, 5, 6, 7)))
    return replace(base, **changes)  # type: ignore[arg-type]


def _task(task_id: str, **changes: object) -> TaskFacts:
    return replace(TaskFacts(id=task_id, completed_day=None, points_awarded_on=None), **changes)  # type: ignore[arg-type]


def test_set_mission_accepts_up_to_five_active_tasks_and_gives_no_points() -> None:
    ids = ["a", "b", "c", "d", "e"]

    day, state = set_mission(ids, set(ids), _day(), PlayerState(), NOW)

    assert day.mission_task_ids == tuple(ids)
    assert state == PlayerState()


@pytest.mark.parametrize(
    ("ids", "active"),
    [
        (["a", "b", "c", "d", "e", "f"], {"a", "b", "c", "d", "e", "f"}),
        (["a", "a"], {"a"}),
        (["a", "x"], {"a"}),
    ],
)
def test_set_mission_rejects_too_many_repeated_or_inactive_tasks(
    ids: list[str], active: set[str]
) -> None:
    with pytest.raises(InvalidMissionError):
        set_mission(ids, active, _day(), PlayerState(), NOW)


def test_a_mission_task_completed_today_can_stay_while_others_are_added() -> None:
    day = _day(mission_task_ids=("a",), mission_completed_ids=("a",), completed_task_ids=("a",))

    updated, _ = set_mission(["a", "b"], {"b"}, day, PlayerState(), NOW)

    assert updated.mission_task_ids == ("a", "b")
    assert updated.mission_completed_ids == ("a",)


def test_an_empty_mission_never_counts_as_cleared() -> None:
    day, state = set_mission([], set(), _day(), PlayerState(), NOW)

    assert not day.mission_cleared
    assert not day.mission_bonus
    assert state.score == 0


def test_reopening_a_mission_task_takes_back_its_extra_and_the_bonus() -> None:
    day = _day(mission_task_ids=("a",))
    done = apply_complete(_task("a"), day, PlayerState(), NOW)
    facts = _task("a", completed_day=TODAY, points_awarded_on=TODAY)

    undone = apply_reopen(facts, done.day, done.state, NOW)

    assert done.state.score == POINTS_PER_TASK + MISSION_TASK_POINTS + MISSION_BONUS
    assert undone.state.score == 0
    assert not undone.day.mission_bonus
    assert undone.day.mission_task_ids == ("a",)


def test_trashing_an_active_mission_task_removes_it_and_can_clear_the_mission() -> None:
    day = _day(mission_task_ids=("a", "b"), mission_completed_ids=("a",), completed_task_ids=("a",))

    outcome = apply_trash(_task("b"), True, day, PlayerState(), NOW)

    assert outcome.day.mission_task_ids == ("a",)
    assert outcome.day.mission_bonus
    assert outcome.state.score == MISSION_BONUS


def test_unmarking_a_completed_mission_task_keeps_its_points() -> None:
    day = _day(mission_task_ids=("a", "b"))
    done = apply_complete(_task("a"), day, PlayerState(), NOW)

    updated, state = set_mission(["b"], {"b"}, done.day, done.state, NOW)

    assert updated.mission_task_ids == ("b",)
    assert state.score == done.state.score
