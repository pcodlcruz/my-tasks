from dataclasses import replace
from datetime import UTC, datetime

import pytest

from mytasks_api.domain.progress import (
    MISSION_BONUS,
    MISSION_TASK_POINTS,
    PHASE_BONUS,
    POINTS_PER_TASK,
    AnnouncementKind,
    DaySettings,
    PlayerState,
    ProgressDay,
    TaskFacts,
    apply_complete,
    apply_reopen,
    apply_trash,
    new_day,
    open_day,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 3, 9, 0, tzinfo=UTC)
TODAY = "2026-11-03"  # a Tuesday
SETTINGS = DaySettings(goal=3, active_weekdays=(1, 2, 3, 4, 5, 6, 7))


def _day(**changes: object) -> ProgressDay:
    return replace(new_day(TODAY, SETTINGS), **changes)  # type: ignore[arg-type]


def _task(task_id: str = "t1", **changes: object) -> TaskFacts:
    return replace(TaskFacts(id=task_id, completed_day=None, points_awarded_on=None), **changes)  # type: ignore[arg-type]


def _kinds(state: PlayerState) -> list[AnnouncementKind]:
    return [item.kind for item in state.announcements]


def test_completing_a_task_never_scored_counts_and_gives_its_points() -> None:
    outcome = apply_complete(_task(), _day(), PlayerState(), NOW)

    assert outcome.day.completed_task_ids == ("t1",)
    assert outcome.state.score == POINTS_PER_TASK
    assert outcome.state.tasks_scored == 1
    assert outcome.completed_day == TODAY
    assert outcome.points_awarded_on == TODAY
    assert "first_coin" in outcome.state.achievements


def test_completing_a_task_scored_another_day_counts_without_points() -> None:
    outcome = apply_complete(
        _task(points_awarded_on="2026-11-02"), _day(), PlayerState(tasks_scored=1), NOW
    )

    assert outcome.day.completed_count == 1
    assert outcome.state.score == 0
    assert outcome.state.tasks_scored == 1
    assert outcome.points_awarded_on == "2026-11-02"


def test_reaching_the_goal_gives_the_phase_bonus_once() -> None:
    day = _day(completed_task_ids=("a", "b"))

    first = apply_complete(_task("c"), day, PlayerState(), NOW)
    second = apply_complete(_task("d"), first.day, first.state, NOW)

    assert first.day.phase_bonus
    assert first.state.score == POINTS_PER_TASK + PHASE_BONUS
    assert second.state.score == first.state.score + POINTS_PER_TASK
    assert _kinds(second.state).count(AnnouncementKind.PHASE_CLEAR) == 1


def test_phase_bonus_also_counts_on_a_day_that_is_not_active() -> None:
    sunday = replace(_day(completed_task_ids=("a", "b")), active=False)

    outcome = apply_complete(_task("c"), sunday, PlayerState(), NOW)

    assert outcome.day.phase_bonus
    assert outcome.state.current_streak == 0


def test_reopening_the_same_day_undoes_the_completion_and_its_points() -> None:
    done = apply_complete(_task(), _day(), PlayerState(), NOW)
    completed = _task(completed_day=done.completed_day, points_awarded_on=done.points_awarded_on)

    undone = apply_reopen(completed, done.day, done.state, NOW)

    assert undone.day.completed_count == 0
    assert undone.state.score == 0
    assert undone.state.tasks_scored == 0
    assert undone.points_awarded_on is None
    assert undone.completed_day is None


def test_reopening_below_the_goal_takes_back_the_phase_bonus_and_its_announcement() -> None:
    state = PlayerState()
    day = _day()
    facts = {}
    for task_id in ("a", "b", "c"):
        outcome = apply_complete(_task(task_id), day, state, NOW)
        day, state = outcome.day, outcome.state
        facts[task_id] = _task(task_id, completed_day=TODAY, points_awarded_on=TODAY)

    undone = apply_reopen(facts["c"], day, state, NOW)

    assert not undone.day.phase_bonus
    assert undone.state.score == 2 * POINTS_PER_TASK
    assert AnnouncementKind.PHASE_CLEAR not in _kinds(undone.state)


def test_reopening_a_later_day_changes_nothing() -> None:
    task = _task(completed_day="2026-11-02", points_awarded_on="2026-11-02")
    state = PlayerState(score=100, tasks_scored=1)

    outcome = apply_reopen(task, _day(), state, NOW)

    assert outcome.day == _day()
    assert outcome.state == state
    assert outcome.points_awarded_on == "2026-11-02"
    assert outcome.completed_day is None


def test_trashing_a_completed_task_changes_no_progress() -> None:
    day = _day(completed_task_ids=("t1",))
    state = PlayerState(score=100)

    outcome = apply_trash(_task(completed_day=TODAY), False, day, state, NOW)

    assert outcome.day == day
    assert outcome.state == state


@pytest.mark.parametrize("rounds", [1, 2, 10])
def test_completing_and_reopening_any_number_of_times_nets_one_completion(rounds: int) -> None:
    day, state = _day(), PlayerState()
    facts = _task()
    for _ in range(rounds):
        done = apply_complete(facts, day, state, NOW)
        facts = _task(completed_day=done.completed_day, points_awarded_on=done.points_awarded_on)
        undone = apply_reopen(facts, done.day, done.state, NOW)
        day, state = undone.day, undone.state
        facts = _task(points_awarded_on=undone.points_awarded_on)

    final = apply_complete(facts, day, state, NOW)

    assert final.day.completed_count == 1
    assert final.state.score == POINTS_PER_TASK


def test_raising_the_goal_after_meeting_it_keeps_the_bonus_already_won() -> None:
    day = _day(completed_task_ids=("a", "b"))
    done = apply_complete(_task("c"), day, PlayerState(), NOW)

    raised = open_day(
        done.day, TODAY, DaySettings(goal=5, active_weekdays=SETTINGS.active_weekdays)
    )

    assert raised.phase_bonus
    assert not raised.goal_met


def test_completing_a_mission_task_gives_the_extra_and_the_whole_mission_its_bonus() -> None:
    day = _day(mission_task_ids=("a", "b"))

    first = apply_complete(_task("a"), day, PlayerState(), NOW)
    second = apply_complete(_task("b"), first.day, first.state, NOW)

    assert first.state.score == POINTS_PER_TASK + MISSION_TASK_POINTS
    assert second.day.mission_cleared
    assert second.state.score == 2 * (POINTS_PER_TASK + MISSION_TASK_POINTS) + MISSION_BONUS
    assert AnnouncementKind.MISSION_CLEAR in _kinds(second.state)


def test_do_now_left_empty_unlocks_its_achievement() -> None:
    outcome = apply_complete(_task(is_do_now=True), _day(), PlayerState(), NOW, do_now_left=0)

    assert "do_now_clear" in outcome.state.achievements


def test_a_scheduled_task_unlocks_its_achievement() -> None:
    outcome = apply_complete(_task(is_scheduled=True), _day(), PlayerState(), NOW)

    assert "scheduled_done" in outcome.state.achievements


def test_ten_scored_tasks_unlock_the_first_count_achievement() -> None:
    outcome = apply_complete(_task(), _day(), PlayerState(tasks_scored=9), NOW)

    assert "tasks_10" in outcome.state.achievements
    assert "tasks_100" not in outcome.state.achievements


def test_a_phase_bonus_won_back_is_celebrated_again_only_if_it_was_never_seen() -> None:
    state, day = PlayerState(), _day(completed_task_ids=("a", "b"))
    won = apply_complete(_task("c"), day, state, NOW)
    facts = _task("c", completed_day=TODAY, points_awarded_on=TODAY)

    unseen_lost = apply_reopen(facts, won.day, won.state, NOW)
    unseen_back = apply_complete(
        _task("c", points_awarded_on=None), unseen_lost.day, unseen_lost.state, NOW
    )
    seen_state = replace(won.state, announcements=())  # acknowledged
    seen_lost = apply_reopen(facts, won.day, seen_state, NOW)
    seen_back = apply_complete(
        _task("c", points_awarded_on=None), seen_lost.day, seen_lost.state, NOW
    )

    assert _kinds(unseen_back.state).count(AnnouncementKind.PHASE_CLEAR) == 1
    assert AnnouncementKind.PHASE_CLEAR not in _kinds(seen_back.state)
    assert seen_back.day.phase_bonus
