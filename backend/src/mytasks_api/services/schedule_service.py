import logging
from collections.abc import Callable
from dataclasses import replace
from datetime import date, datetime

from fastapi import Depends

from mytasks_api.clock import Clock, get_clock
from mytasks_api.domain.progress import day_key
from mytasks_api.domain.recurrence import check_once_date, starting_occurrence
from mytasks_api.domain.schedule import (
    MAX_SCHEDULES,
    NewSchedule,
    Schedule,
    ScheduleChanges,
    ScheduleLimitError,
    ScheduleNotFoundError,
    edit,
    pause,
    resume,
)
from mytasks_api.domain.task import MAX_ACTIVE_TASKS
from mytasks_api.logging_config import log_event
from mytasks_api.repositories.profile_repository import ProfileRepository, get_profile_repository
from mytasks_api.repositories.schedule_repository import (
    ScheduleRepository,
    get_schedule_repository,
)
from mytasks_api.repositories.task_repository import TaskRepository, get_task_repository

logger = logging.getLogger(__name__)


class ScheduleService:
    """Scheduled tasks (US4). The logs carry ids and days only, never a title (FR-031)."""

    def __init__(
        self,
        repository: ScheduleRepository,
        tasks: TaskRepository,
        profiles: ProfileRepository,
        clock: Clock,
    ) -> None:
        self._repository = repository
        self._tasks = tasks
        self._profiles = profiles
        self._clock = clock

    async def _today(self, uid: str) -> date:
        profile = await self._profiles.get(uid)
        return date.fromisoformat(day_key(self._clock.now(), profile.effective_timezone))

    def _log(self, message: str, uid: str, schedule_id: str, level: int = logging.INFO) -> None:
        log_event(logger, level, message, uid=uid, schedule_id=schedule_id)

    async def list_all(self, uid: str) -> list[Schedule]:
        return await self._repository.list_all(uid)

    async def create(self, uid: str, data: NewSchedule) -> Schedule:
        today = await self._today(uid)
        check_once_date(data.recurrence, today)
        # "Soft" cap like the 500 active tasks: count and write are not atomic, so two
        # simultaneous creations could overshoot by one. Enough to bound the catch-up.
        if await self._repository.count(uid) >= MAX_SCHEDULES:
            log_event(logger, logging.WARNING, "schedule_limit_reached", uid=uid)
            raise ScheduleLimitError(uid)
        start = starting_occurrence(data.recurrence, today, last_generated_for=None)
        schedule = await self._repository.create(
            uid, replace(data, next_occurrence=start), self._clock.now()
        )
        self._log("schedule_created", uid, schedule.id)
        return schedule

    async def update(self, uid: str, schedule_id: str, changes: ScheduleChanges) -> Schedule:
        today = await self._today(uid)
        if changes.recurrence is not None:
            check_once_date(changes.recurrence, today)
        schedule = await self._modify(
            uid, schedule_id, lambda current: edit(current, changes, today)
        )
        self._log("schedule_updated", uid, schedule_id)
        return schedule

    async def pause(self, uid: str, schedule_id: str) -> Schedule:
        schedule = await self._modify(uid, schedule_id, pause)
        self._log("schedule_updated", uid, schedule_id)
        return schedule

    async def resume(self, uid: str, schedule_id: str) -> Schedule:
        today = await self._today(uid)
        schedule = await self._modify(uid, schedule_id, lambda current: resume(current, today))
        self._log("schedule_updated", uid, schedule_id)
        return schedule

    async def delete(self, uid: str, schedule_id: str) -> None:
        try:
            await self._repository.delete(uid, schedule_id)
        except ScheduleNotFoundError:
            self._log("schedule_not_found", uid, schedule_id, logging.WARNING)
            raise
        self._log("schedule_deleted", uid, schedule_id)

    async def _modify(
        self, uid: str, schedule_id: str, change: Callable[[Schedule], Schedule]
    ) -> Schedule:
        try:
            return await self._repository.modify(uid, schedule_id, change, self._clock.now())
        except ScheduleNotFoundError:
            # A foreign schedule and a missing one give the same 404; the log shows probing.
            self._log("schedule_not_found", uid, schedule_id, logging.WARNING)
            raise

    async def notice_titles(self, uid: str, schedule_ids: list[str]) -> dict[str, str]:
        if not schedule_ids:
            return {}
        return await self._repository.get_titles(uid, schedule_ids)

    async def generate_due(self, uid: str, today: date, now: datetime) -> None:
        """Part of the lazy catch-up of `GET /me/progress` (research R1, R7): creates today's
        tasks of the schedules that are due. Idempotent, and safe with two requests at once:
        each schedule is generated in its own transaction."""
        due = await self._repository.list_due(uid, today)
        if not due:
            return
        active = await self._tasks.count_active(uid)
        for schedule in due:
            plan = await self._repository.generate(
                uid, schedule.id, today, now, has_room=active < MAX_ACTIVE_TASKS
            )
            if plan is None:
                continue
            if plan.create_for is not None:
                active += 1
                log_event(
                    logger,
                    logging.INFO,
                    "schedule_generated",
                    uid=uid,
                    schedule_id=schedule.id,
                    day=plan.create_for.isoformat(),
                )
            elif plan.skipped_limit:
                log_event(
                    logger,
                    logging.WARNING,
                    "schedule_skipped_limit",
                    uid=uid,
                    schedule_id=schedule.id,
                    day=plan.due.isoformat(),
                )


def get_schedule_service(
    repository: ScheduleRepository = Depends(get_schedule_repository),
    tasks: TaskRepository = Depends(get_task_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    clock: Clock = Depends(get_clock),
) -> ScheduleService:
    return ScheduleService(repository, tasks, profiles, clock)
