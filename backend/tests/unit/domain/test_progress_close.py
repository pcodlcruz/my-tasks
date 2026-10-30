from dataclasses import replace
from datetime import UTC, datetime

import pytest

from mytasks_api.domain.progress import (
    MAX_DAYS_TO_CLOSE,
    AnnouncementKind,
    DaySettings,
    PlayerState,
    ProgressDay,
    close_days,
    new_day,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 10, 9, 0, tzinfo=UTC)
TODAY = "2026-11-10"  # Tuesday
EVERY_DAY = DaySettings(goal=2, active_weekdays=(1, 2, 3, 4, 5, 6, 7))


def _day(date: str, done: int, settings: DaySettings = EVERY_DAY) -> ProgressDay:
    return replace(new_day(date, settings), completed_task_ids=tuple(f"t{i}" for i in range(done)))


def test_a_new_player_with_no_days_only_sets_the_last_closed_day() -> None:
    state, closed = close_days(PlayerState(), {}, EVERY_DAY, TODAY, NOW)

    assert state.last_closed_day == "2026-11-09"
    assert closed == []
    assert state.current_streak == 0


def test_an_active_day_with_the_goal_met_raises_the_streak() -> None:
    state = PlayerState(last_closed_day="2026-11-08", current_streak=2)

    new_state, closed = close_days(
        state, {"2026-11-09": _day("2026-11-09", 2)}, EVERY_DAY, TODAY, NOW
    )

    assert new_state.current_streak == 3
    assert new_state.best_streak == 3
    assert closed[0].closed
    assert "streak_3" in new_state.achievements
    assert any(item.kind is AnnouncementKind.ACHIEVEMENT for item in new_state.announcements)


@pytest.mark.parametrize("stored", [{}, {"2026-11-09": _day("2026-11-09", 1)}])
def test_an_active_day_without_the_goal_or_activity_resets_the_streak(
    stored: dict[str, ProgressDay],
) -> None:
    state = PlayerState(last_closed_day="2026-11-08", current_streak=4, best_streak=4)

    new_state, closed = close_days(state, stored, EVERY_DAY, TODAY, NOW)

    assert new_state.current_streak == 0
    assert new_state.best_streak == 4
    assert len(closed) == 1
    assert closed[0].goal == 2  # a day without a document keeps the goal in force


def test_a_day_that_is_not_active_keeps_the_streak() -> None:
    weekdays_only = DaySettings(goal=2, active_weekdays=(1, 2, 3, 4, 5))
    state = PlayerState(last_closed_day="2026-11-07", current_streak=5)  # up to Saturday

    new_state, _ = close_days(state, {}, weekdays_only, "2026-11-09", NOW)  # Sunday closes

    assert new_state.current_streak == 5


def test_closing_updates_the_best_day() -> None:
    state = PlayerState(last_closed_day="2026-11-08", best_day_count=3)

    new_state, _ = close_days(state, {"2026-11-09": _day("2026-11-09", 5)}, EVERY_DAY, TODAY, NOW)

    assert new_state.best_day_count == 5
    assert new_state.best_day_date == "2026-11-09"


def test_closing_twice_changes_nothing() -> None:
    state = PlayerState(last_closed_day="2026-11-08", current_streak=1)
    stored = {"2026-11-09": _day("2026-11-09", 2)}

    once, _ = close_days(state, stored, EVERY_DAY, TODAY, NOW)
    twice, closed = close_days(once, stored, EVERY_DAY, TODAY, NOW)

    assert twice == once
    assert closed == []


def test_a_closed_day_is_never_changed() -> None:
    already = replace(_day("2026-11-09", 0), closed=True)
    state = PlayerState(last_closed_day="2026-11-08", current_streak=1)

    new_state, closed = close_days(state, {"2026-11-09": already}, EVERY_DAY, TODAY, NOW)

    assert closed == []
    assert new_state.current_streak == 1


def test_a_long_absence_only_keeps_the_last_84_days_and_breaks_the_streak() -> None:
    state = PlayerState(last_closed_day="2026-01-01", current_streak=10)

    new_state, closed = close_days(state, {}, EVERY_DAY, TODAY, NOW)

    assert len(closed) == MAX_DAYS_TO_CLOSE
    assert closed[-1].date == "2026-11-09"
    assert new_state.current_streak == 0


def test_a_new_game_starts_from_the_first_stored_day() -> None:
    stored = {"2026-11-08": _day("2026-11-08", 2), "2026-11-09": _day("2026-11-09", 2)}

    new_state, closed = close_days(PlayerState(), stored, EVERY_DAY, TODAY, NOW)

    assert [day.date for day in closed] == ["2026-11-08", "2026-11-09"]
    assert new_state.current_streak == 2
    assert new_state.last_active_closed_day == "2026-11-09"
