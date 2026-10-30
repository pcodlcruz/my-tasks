from dataclasses import replace
from datetime import UTC, datetime

import pytest

from mytasks_api.domain.progress import (
    ACHIEVEMENTS,
    LEVELS,
    MAX_ANNOUNCEMENTS,
    POINTS_PER_TASK,
    Announcement,
    AnnouncementKind,
    DaySettings,
    PlayerState,
    TaskFacts,
    acknowledge,
    apply_complete,
    apply_reopen,
    level_for,
    new_day,
    next_level_threshold,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 3, 9, 0, tzinfo=UTC)
TODAY = "2026-11-03"
SETTINGS = DaySettings(goal=20, active_weekdays=(1, 2, 3, 4, 5, 6, 7))


def _task(task_id: str, **changes: object) -> TaskFacts:
    return replace(TaskFacts(id=task_id, completed_day=None, points_awarded_on=None), **changes)  # type: ignore[arg-type]


def test_there_are_ten_levels_with_growing_thresholds_and_names() -> None:
    assert [level.number for level in LEVELS] == list(range(1, 11))
    thresholds = [level.threshold for level in LEVELS]
    assert thresholds == sorted(thresholds)
    assert LEVELS[0].name == "Novato"
    assert LEVELS[-1].name == "Jefe final"


@pytest.mark.parametrize(
    ("score", "level", "next_at"),
    [(0, 1, 1_000), (999, 1, 1_000), (1_000, 2, 3_000), (90_000, 10, None)],
)
def test_the_level_is_derived_from_the_score(score: int, level: int, next_at: int | None) -> None:
    assert level_for(score).number == level
    assert next_level_threshold(score) == next_at


def test_the_catalog_has_twelve_achievements_with_stable_ids() -> None:
    assert len(ACHIEVEMENTS) == 12
    assert len({achievement.id for achievement in ACHIEVEMENTS}) == 12


def test_a_level_up_is_announced_once_even_if_lost_and_won_again() -> None:
    state = PlayerState(score=1_000 - POINTS_PER_TASK)
    day = new_day(TODAY, SETTINGS)

    up = apply_complete(_task("a"), day, state, NOW)
    down = apply_reopen(
        _task("a", completed_day=TODAY, points_awarded_on=TODAY), up.day, up.state, NOW
    )
    again = apply_complete(_task("a"), down.day, down.state, NOW)

    kinds = [item.kind for item in again.state.announcements]
    assert kinds.count(AnnouncementKind.LEVEL_UP) == 1
    assert again.state.max_level_announced == 2


def test_a_new_record_is_announced_once_a_day_and_never_on_the_first_day() -> None:
    first_day = apply_complete(_task("a"), new_day(TODAY, SETTINGS), PlayerState(), NOW)
    assert AnnouncementKind.NEW_RECORD not in [item.kind for item in first_day.state.announcements]

    state = PlayerState(best_day_count=1)
    day = new_day(TODAY, SETTINGS)
    for task_id in ("a", "b", "c"):
        outcome = apply_complete(_task(task_id), day, state, NOW)
        day, state = outcome.day, outcome.state

    kinds = [item.kind for item in state.announcements]
    assert kinds.count(AnnouncementKind.NEW_RECORD) == 1
    assert "new_record" not in state.achievements  # the achievement needs five


def test_the_record_achievement_needs_five_tasks() -> None:
    state = PlayerState(best_day_count=4)
    day = new_day(TODAY, SETTINGS)
    for task_id in ("a", "b", "c", "d", "e"):
        outcome = apply_complete(_task(task_id), day, state, NOW)
        day, state = outcome.day, outcome.state

    assert "new_record" in state.achievements


def test_achievements_are_never_taken_back() -> None:
    done = apply_complete(_task("a"), new_day(TODAY, SETTINGS), PlayerState(), NOW)
    undone = apply_reopen(
        _task("a", completed_day=TODAY, points_awarded_on=TODAY), done.day, done.state, NOW
    )

    assert "first_coin" in undone.state.achievements


def test_announcements_are_capped_keeping_the_newest() -> None:
    old = tuple(
        Announcement(
            id=f"old{i}", kind=AnnouncementKind.ACHIEVEMENT, value="x", day=TODAY, created_at=NOW
        )
        for i in range(MAX_ANNOUNCEMENTS)
    )

    outcome = apply_complete(
        _task("a"), new_day(TODAY, SETTINGS), PlayerState(announcements=old), NOW
    )

    assert len(outcome.state.announcements) == MAX_ANNOUNCEMENTS
    assert outcome.state.announcements[0].id != "old0"


def test_acknowledge_removes_only_the_given_ids() -> None:
    items = tuple(
        Announcement(
            id=name, kind=AnnouncementKind.PHASE_CLEAR, value=500, day=TODAY, created_at=NOW
        )
        for name in ("a", "b")
    )

    state = acknowledge(PlayerState(announcements=items), ["a", "unknown"], [])

    assert [item.id for item in state.announcements] == ["b"]
