from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime

import pytest

from mytasks_api.clock import FixedClock
from mytasks_api.domain.profile import default_profile
from mytasks_api.domain.recurrence import InvalidRecurrenceError, Recurrence, RecurrenceKind
from mytasks_api.domain.schedule import (
    MAX_SCHEDULES,
    GenerationPlan,
    NewSchedule,
    Schedule,
    ScheduleChanges,
    ScheduleFinishedError,
    ScheduleLimitError,
    ScheduleNotFoundError,
    ScheduleStatus,
    plan_generation,
)
from mytasks_api.domain.task import MAX_ACTIVE_TASKS, Scope
from mytasks_api.services.schedule_service import ScheduleService

pytestmark = pytest.mark.unit

# Wednesday 4 November 2026, 10:00 in Madrid.
NOW = datetime(2026, 11, 4, 9, 0, tzinfo=UTC)
MONDAY = date(2026, 11, 2)
WEDNESDAY = date(2026, 11, 4)
THURSDAY = date(2026, 11, 5)
NEXT_MONDAY = date(2026, 11, 9)

DAILY = Recurrence(RecurrenceKind.DAILY)
MONDAY_AND_WEDNESDAY = Recurrence(RecurrenceKind.WEEKLY, weekdays=(1, 3))


@dataclass
class FakeTask:
    id: str
    schedule_id: str
    scheduled_for: date
    active: bool = True


class FakeScheduleRepository:
    """In memory, with the same generation rule as the Firestore one (`plan_generation`)."""

    def __init__(self) -> None:
        self.schedules: dict[str, Schedule] = {}
        self.tasks: dict[str, FakeTask] = {}
        self.notices: list[tuple[str, date]] = []

    def add(self, schedule: Schedule) -> Schedule:
        self.schedules[schedule.id] = schedule
        return schedule

    async def list_all(self, uid: str) -> list[Schedule]:
        return sorted(self.schedules.values(), key=lambda item: item.created_at)

    async def create(self, uid: str, data: NewSchedule, now: datetime) -> Schedule:
        if len(self.schedules) >= MAX_SCHEDULES:
            raise ScheduleLimitError(uid)
        schedule = Schedule(
            id=f"s{len(self.schedules) + 1}",
            title=data.title,
            description=data.description,
            urgent=data.urgent,
            important=data.important,
            scope=data.scope,
            recurrence=data.recurrence,
            status=ScheduleStatus.ACTIVE,
            next_occurrence=data.next_occurrence,
            last_task_id=None,
            last_generated_for=None,
            created_at=now,
            updated_at=now,
        )
        return self.add(schedule)

    async def modify(
        self, uid: str, schedule_id: str, change: Callable[[Schedule], Schedule], now: datetime
    ) -> Schedule:
        schedule = self.schedules.get(schedule_id)
        if schedule is None:
            raise ScheduleNotFoundError(schedule_id)
        updated = replace(change(schedule), updated_at=now)
        self.schedules[schedule_id] = updated
        return updated

    async def delete(self, uid: str, schedule_id: str) -> None:
        if self.schedules.pop(schedule_id, None) is None:
            raise ScheduleNotFoundError(schedule_id)

    async def list_due(self, uid: str, today: date) -> list[Schedule]:
        return [
            schedule
            for schedule in self.schedules.values()
            if schedule.next_occurrence is not None and schedule.next_occurrence <= today
        ]

    async def generate(
        self, uid: str, schedule_id: str, today: date, now: datetime, *, has_room: bool
    ) -> GenerationPlan | None:
        schedule = self.schedules[schedule_id]
        last = self.tasks.get(schedule.last_task_id or "")
        plan = plan_generation(
            schedule, today, last_task_active=last is not None and last.active, has_room=has_room
        )
        if plan is None:
            return None
        task_id = schedule.last_task_id
        if plan.create_for is not None:
            task_id = f"t{len(self.tasks) + 1}"
            self.tasks[task_id] = FakeTask(task_id, schedule.id, plan.create_for)
        if plan.skipped_limit:
            self.notices.append((schedule.id, plan.due))
        self.schedules[schedule_id] = replace(
            schedule,
            status=plan.status,
            next_occurrence=plan.next_occurrence,
            last_task_id=task_id,
            last_generated_for=plan.create_for or schedule.last_generated_for,
        )
        return plan


class FakeTasks:
    def __init__(self, active: int = 0) -> None:
        self.active = active

    async def count_active(self, uid: str) -> int:
        return self.active


class FakeProfiles:
    async def get(self, uid: str):  # type: ignore[no-untyped-def]
        return default_profile()


def _schedule(
    schedule_id: str = "s1",
    recurrence: Recurrence = DAILY,
    next_occurrence: date | None = MONDAY,
    status: ScheduleStatus = ScheduleStatus.ACTIVE,
) -> Schedule:
    return Schedule(
        id=schedule_id,
        title="Regar las plantas",
        description="Las del balcón",
        urgent=False,
        important=True,
        scope=Scope.PERSONAL,
        recurrence=recurrence,
        status=status,
        next_occurrence=next_occurrence,
        last_task_id=None,
        last_generated_for=None,
        created_at=NOW,
        updated_at=NOW,
    )


def _service(
    active_tasks: int = 0,
) -> tuple[ScheduleService, FakeScheduleRepository, FakeTasks]:
    repository = FakeScheduleRepository()
    tasks = FakeTasks(active_tasks)
    service = ScheduleService(
        repository,  # type: ignore[arg-type]
        tasks,  # type: ignore[arg-type]
        FakeProfiles(),  # type: ignore[arg-type]
        FixedClock(NOW),
    )
    return service, repository, tasks


def _new(recurrence: Recurrence) -> NewSchedule:
    return NewSchedule(
        title="Regar",
        description="Balcón",
        urgent=False,
        important=True,
        scope=Scope.PERSONAL,
        recurrence=recurrence,
        next_occurrence=None,
    )


class TestGeneration:
    async def test_several_days_missed_give_one_task_for_the_latest_occurrence(self) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(next_occurrence=MONDAY))

        await service.generate_due("uid", WEDNESDAY, NOW)

        assert [(task.schedule_id, task.scheduled_for) for task in repository.tasks.values()] == [
            ("s1", WEDNESDAY)
        ]
        assert repository.schedules["s1"].next_occurrence == THURSDAY
        assert repository.schedules["s1"].last_generated_for == WEDNESDAY

    async def test_repeating_it_the_same_day_creates_nothing_more(self) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(next_occurrence=MONDAY))

        await service.generate_due("uid", WEDNESDAY, NOW)
        await service.generate_due("uid", WEDNESDAY, NOW)

        assert len(repository.tasks) == 1

    async def test_nothing_new_while_the_last_task_is_still_active(self) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(recurrence=MONDAY_AND_WEDNESDAY, next_occurrence=MONDAY))
        await service.generate_due("uid", MONDAY, NOW)

        await service.generate_due("uid", WEDNESDAY, NOW)

        # The Monday task stays, with its date: the board shows it as "pending since Monday".
        assert [task.scheduled_for for task in repository.tasks.values()] == [MONDAY]
        assert repository.schedules["s1"].next_occurrence == NEXT_MONDAY

    @pytest.mark.parametrize("outcome", ["completed", "trashed", "purged"])
    async def test_a_new_one_once_the_last_task_is_no_longer_active(self, outcome: str) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(recurrence=MONDAY_AND_WEDNESDAY, next_occurrence=MONDAY))
        await service.generate_due("uid", MONDAY, NOW)
        (last,) = repository.tasks.values()
        if outcome == "purged":
            del repository.tasks[last.id]
        else:
            last.active = False

        await service.generate_due("uid", WEDNESDAY, NOW)

        assert WEDNESDAY in [task.scheduled_for for task in repository.tasks.values()]

    async def test_a_one_off_schedule_finishes_once_generated(self) -> None:
        service, repository, _ = _service()
        one_off = Recurrence(RecurrenceKind.ONCE, date=WEDNESDAY)
        repository.add(_schedule(recurrence=one_off, next_occurrence=WEDNESDAY))

        await service.generate_due("uid", WEDNESDAY, NOW)

        schedule = repository.schedules["s1"]
        assert schedule.status is ScheduleStatus.FINISHED
        assert schedule.next_occurrence is None
        assert len(repository.tasks) == 1

    async def test_with_500_active_tasks_nothing_is_created_and_a_notice_is_left(self) -> None:
        service, repository, _ = _service(active_tasks=MAX_ACTIVE_TASKS)
        repository.add(_schedule(next_occurrence=WEDNESDAY))

        await service.generate_due("uid", WEDNESDAY, NOW)

        assert repository.tasks == {}
        assert repository.notices == [("s1", WEDNESDAY)]
        assert repository.schedules["s1"].next_occurrence == THURSDAY

    async def test_the_room_left_is_shared_by_the_schedules_due_the_same_day(self) -> None:
        service, repository, _ = _service(active_tasks=MAX_ACTIVE_TASKS - 1)
        repository.add(_schedule("s1", next_occurrence=WEDNESDAY))
        repository.add(_schedule("s2", next_occurrence=WEDNESDAY))

        await service.generate_due("uid", WEDNESDAY, NOW)

        assert len(repository.tasks) == 1
        assert len(repository.notices) == 1

    async def test_a_paused_schedule_has_no_next_occurrence_and_generates_nothing(self) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(next_occurrence=MONDAY))

        paused = await service.pause("uid", "s1")
        await service.generate_due("uid", WEDNESDAY, NOW)

        assert paused.status is ScheduleStatus.PAUSED
        assert paused.next_occurrence is None
        assert repository.tasks == {}


class TestLifecycle:
    async def test_creating_one_counts_from_today(self) -> None:
        service, _, _ = _service()

        created = await service.create("uid", _new(MONDAY_AND_WEDNESDAY))

        assert created.next_occurrence == WEDNESDAY
        assert created.status is ScheduleStatus.ACTIVE

    async def test_the_51st_is_refused(self) -> None:
        service, repository, _ = _service()
        for index in range(MAX_SCHEDULES):
            repository.add(_schedule(f"x{index}"))

        with pytest.raises(ScheduleLimitError):
            await service.create("uid", _new(DAILY))

    async def test_a_one_off_in_the_past_is_refused(self) -> None:
        service, _, _ = _service()

        with pytest.raises(InvalidRecurrenceError):
            await service.create("uid", _new(Recurrence(RecurrenceKind.ONCE, date=MONDAY)))

    async def test_editing_the_repetition_recalculates_from_today(self) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(recurrence=DAILY, next_occurrence=THURSDAY))

        updated = await service.update(
            "uid", "s1", ScheduleChanges(recurrence=MONDAY_AND_WEDNESDAY)
        )

        # Today is Wednesday and nothing was generated today: it counts.
        assert updated.next_occurrence == WEDNESDAY

    async def test_resuming_counts_from_today(self) -> None:
        service, repository, _ = _service()
        repository.add(
            _schedule(
                recurrence=MONDAY_AND_WEDNESDAY,
                next_occurrence=None,
                status=ScheduleStatus.PAUSED,
            )
        )

        resumed = await service.resume("uid", "s1")

        assert resumed.status is ScheduleStatus.ACTIVE
        assert resumed.next_occurrence == WEDNESDAY

    async def test_pause_and_resume_are_idempotent(self) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(next_occurrence=WEDNESDAY))

        await service.pause("uid", "s1")
        paused = await service.pause("uid", "s1")
        await service.resume("uid", "s1")
        resumed = await service.resume("uid", "s1")

        assert paused.status is ScheduleStatus.PAUSED
        assert resumed.status is ScheduleStatus.ACTIVE

    @pytest.mark.parametrize("action", ["update", "pause", "resume"])
    async def test_a_finished_schedule_cannot_change(self, action: str) -> None:
        service, repository, _ = _service()
        repository.add(_schedule(next_occurrence=None, status=ScheduleStatus.FINISHED))

        with pytest.raises(ScheduleFinishedError):
            if action == "update":
                await service.update("uid", "s1", ScheduleChanges(title="Otro"))
            elif action == "pause":
                await service.pause("uid", "s1")
            else:
                await service.resume("uid", "s1")

    async def test_resuming_a_one_off_whose_date_went_by_is_refused(self) -> None:
        service, repository, _ = _service()
        one_off = Recurrence(RecurrenceKind.ONCE, date=MONDAY)
        repository.add(
            _schedule(recurrence=one_off, next_occurrence=None, status=ScheduleStatus.PAUSED)
        )

        with pytest.raises(ScheduleFinishedError):
            await service.resume("uid", "s1")

    async def test_a_missing_schedule_is_not_found(self) -> None:
        service, _, _ = _service()

        with pytest.raises(ScheduleNotFoundError):
            await service.pause("uid", "nope")
        with pytest.raises(ScheduleNotFoundError):
            await service.delete("uid", "nope")


class TestGenerationFailures:
    """The catch-up runs inside `GET /me/progress` (research R1): a schedule that cannot be
    generated must not take the scoreboard, the closing of past days or the other schedules down
    with it (FR-034; security-review-fase-6, MED-001)."""

    async def test_one_schedule_failing_does_not_stop_the_others(self) -> None:
        service, repository, _ = _service()
        repository.add(_schedule("s1", next_occurrence=WEDNESDAY))
        repository.add(_schedule("s2", next_occurrence=WEDNESDAY))
        generate = repository.generate

        async def flaky(uid: str, schedule_id: str, *args: object, **kwargs: bool) -> object:
            if schedule_id == "s1":
                message = "Failed to commit transaction in 5 attempts"
                raise RuntimeError(message)
            return await generate(uid, schedule_id, *args, **kwargs)  # type: ignore[arg-type]

        repository.generate = flaky  # type: ignore[method-assign,assignment]

        await service.generate_due("uid", WEDNESDAY, NOW)

        assert [task.schedule_id for task in repository.tasks.values()] == ["s2"]

    async def test_a_failing_query_of_the_due_schedules_is_not_raised(self) -> None:
        service, repository, _ = _service()

        async def broken(uid: str, today: date) -> list[Schedule]:
            message = "index missing"
            raise RuntimeError(message)

        repository.list_due = broken  # type: ignore[method-assign]

        await service.generate_due("uid", WEDNESDAY, NOW)

        assert repository.tasks == {}

    async def test_a_failing_count_of_active_tasks_is_not_raised_and_creates_nothing(self) -> None:
        service, repository, tasks = _service()
        repository.add(_schedule("s1", next_occurrence=WEDNESDAY))

        async def broken(uid: str) -> int:
            message = "timeout"
            raise RuntimeError(message)

        tasks.count_active = broken  # type: ignore[method-assign]

        await service.generate_due("uid", WEDNESDAY, NOW)

        # Without knowing the room, nothing is created (it could overshoot the 500 limit); the
        # schedule stays due and the next read tries again.
        assert repository.tasks == {}
        assert repository.schedules["s1"].next_occurrence == WEDNESDAY
