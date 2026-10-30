import logging
from collections.abc import Callable
from datetime import UTC, datetime

import pytest

from mytasks_api.clock import FixedClock
from mytasks_api.domain.profile import Profile, default_profile
from mytasks_api.domain.progress import DaySettings, Outcome, PlayerState, new_day
from mytasks_api.domain.task import Scope, Status, Task
from mytasks_api.services.task_service import ProgressTracking, TaskService

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 3, 9, 0, tzinfo=UTC)


def _do_now_task() -> Task:
    return Task(
        id="t1",
        title="Urgente",
        description="Hacer ya",
        urgent=True,
        important=True,
        scope=Scope.WORK,
        pinned=False,
        status=Status.ACTIVE,
        in_trash=False,
        created_at=NOW,
        updated_at=NOW,
        completed_at=None,
        trashed_at=None,
        purge_at=None,
    )


class BrokenCountRepository:
    """A task repository whose "do now" count fails, as a missing index would."""

    async def get(self, uid: str, task_id: str) -> Task | None:
        return _do_now_task()

    async def count_active_do_now(self, uid: str) -> int:
        raise RuntimeError("FailedPrecondition: the query requires an index")


class FakeProfiles:
    async def get(self, uid: str) -> Profile:
        return default_profile()


class RecordingProgressRepository:
    def __init__(self) -> None:
        self.outcome: Outcome | None = None

    async def run_task_transition(
        self,
        uid: str,
        task_id: str,
        transition: Callable[[Task, datetime], Task],
        rule: Callable[[Task, Task, object, PlayerState], Outcome],
        today: str,
        settings: DaySettings,
        now: datetime,
    ) -> Task:
        before = _do_now_task()
        after = transition(before, now)
        self.outcome = rule(before, after, new_day(today, settings), PlayerState())
        return after


async def test_completing_still_works_when_the_do_now_count_fails(
    caplog: pytest.LogCaptureFixture,
) -> None:
    progress = RecordingProgressRepository()
    service = TaskService(
        BrokenCountRepository(),  # type: ignore[arg-type]
        ProgressTracking(progress, FakeProfiles(), FixedClock(NOW)),  # type: ignore[arg-type]
    )

    with caplog.at_level(logging.WARNING, logger="mytasks_api.services.task_service"):
        task = await service.complete_task("uid", "t1")

    assert task.status is Status.COMPLETED
    assert progress.outcome is not None
    assert progress.outcome.day.completed_count == 1
    assert "do_now_clear" not in progress.outcome.state.achievements
    assert any(r.getMessage() == "progress_do_now_count_failed" for r in caplog.records)
