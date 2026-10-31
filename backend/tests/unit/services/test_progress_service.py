from dataclasses import replace
from datetime import UTC, datetime

import pytest

from mytasks_api.clock import FixedClock
from mytasks_api.domain.profile import Profile, default_profile
from mytasks_api.domain.progress import (
    Announcement,
    AnnouncementKind,
    DaySettings,
    PlayerState,
    ProgressDay,
    close_days,
    new_day,
)
from mytasks_api.schemas.progress import ProgressOut
from mytasks_api.services.progress_service import ProgressService

pytestmark = pytest.mark.unit

# Tuesday 3 November 2026, 10:00 in Madrid.
NOW = datetime(2026, 11, 3, 9, 0, tzinfo=UTC)
TODAY = "2026-11-03"


class FakeProfiles:
    def __init__(self, profile: Profile) -> None:
        self.profile = profile

    async def get(self, uid: str) -> Profile:
        return self.profile


class FakeProgressRepository:
    def __init__(self) -> None:
        self.state = PlayerState()
        self.days: dict[str, ProgressDay] = {}
        self.close_calls = 0

    async def close_days(
        self, uid: str, settings: DaySettings, today: str, now: datetime
    ) -> PlayerState:
        self.close_calls += 1
        self.state, closed = close_days(self.state, self.days, settings, today, now)
        for day in closed:
            self.days[day.date] = day
        return self.state

    async def get_day(self, uid: str, day: str) -> ProgressDay | None:
        return self.days.get(day)

    async def get_state(self, uid: str) -> PlayerState:
        return self.state


def _service(profile: Profile | None = None) -> tuple[ProgressService, FakeProgressRepository]:
    repository = FakeProgressRepository()
    service = ProgressService(
        repository,  # type: ignore[arg-type]
        FakeProfiles(profile or default_profile()),  # type: ignore[arg-type]
        FixedClock(NOW),
    )
    return service, repository


async def test_a_new_player_sees_the_default_goal_and_the_review() -> None:
    service, _ = _service()

    out = ProgressOut.from_snapshot(await service.get_progress("uid"))

    assert out.today == TODAY
    assert out.goal == 3
    assert out.completed_count == 0
    assert out.show_review is True
    assert out.streak == 0
    assert out.arcade is not None
    assert out.arcade.level == 1


async def test_the_catch_up_does_nothing_when_already_up_to_date() -> None:
    service, repository = _service()
    await service.get_progress("uid")
    state = repository.state

    await service.get_progress("uid")

    assert repository.state == state


async def test_the_streak_counts_today_once_the_goal_is_met_on_an_active_day() -> None:
    service, repository = _service()
    repository.state = PlayerState(last_closed_day="2026-11-02", current_streak=2)
    settings = DaySettings(goal=3, active_weekdays=(1, 2, 3, 4, 5, 6, 7))
    repository.days[TODAY] = replace(new_day(TODAY, settings), completed_task_ids=("a", "b", "c"))

    out = ProgressOut.from_snapshot(await service.get_progress("uid"))

    assert out.goal_met
    assert out.streak == 3
    assert out.streak_at_stake is False


async def test_the_streak_is_at_stake_until_the_goal_is_met() -> None:
    service, repository = _service()
    repository.state = PlayerState(last_closed_day="2026-11-02", current_streak=2)

    out = ProgressOut.from_snapshot(await service.get_progress("uid"))

    assert out.streak == 2
    assert out.streak_at_stake is True


async def test_no_review_on_a_day_that_is_not_active_or_when_disabled() -> None:
    weekends_off = replace(default_profile(), active_weekdays=(1, 3, 4, 5))  # Tuesday off
    service, _ = _service(weekends_off)
    assert (await service.get_progress("uid")).today.show_review is False

    disabled = replace(default_profile(), morning_review=False)
    service, _ = _service(disabled)
    assert (await service.get_progress("uid")).today.show_review is False


async def test_the_arcade_mode_off_hides_score_and_announcements_but_keeps_them() -> None:
    service, repository = _service(replace(default_profile(), arcade_mode=False))
    announcement = Announcement(
        id="a1", kind=AnnouncementKind.PHASE_CLEAR, value=500, day=TODAY, created_at=NOW
    )
    repository.state = PlayerState(
        score=700, last_closed_day="2026-11-02", announcements=(announcement,)
    )

    out = ProgressOut.from_snapshot(await service.get_progress("uid"))

    assert out.arcade is None
    assert out.announcements == []
    assert repository.state.announcements == (announcement,)
    assert repository.state.score == 700


async def test_the_last_day_is_the_last_active_closed_day() -> None:
    service, repository = _service()
    settings = DaySettings(goal=3, active_weekdays=(1, 2, 3, 4, 5, 6, 7))
    repository.days["2026-11-02"] = replace(
        new_day("2026-11-02", settings), completed_task_ids=("a", "b", "c", "d")
    )
    repository.state = PlayerState(last_closed_day="2026-11-01")

    out = ProgressOut.from_snapshot(await service.get_progress("uid"))

    assert out.last_day is not None
    assert out.last_day.date == "2026-11-02"
    assert out.last_day.completed_count == 4
    assert out.last_day.goal_met
