import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from fastapi import Depends

from mytasks_api.clock import Clock, get_clock
from mytasks_api.domain.profile import Profile
from mytasks_api.domain.progress import (
    DaySettings,
    Outcome,
    PlayerState,
    ProgressDay,
    TaskFacts,
    apply_complete,
    apply_reopen,
    apply_trash,
    day_key,
)
from mytasks_api.domain.task import (
    MAX_ACTIVE_TASKS,
    ActiveTaskLimitError,
    BoardOrder,
    HistoryDays,
    Quadrant,
    Scope,
    Status,
    Task,
    TaskNotFoundError,
    complete,
    move_to_trash,
    reopen,
    restore,
    sort_board,
)
from mytasks_api.logging_config import log_event
from mytasks_api.repositories.profile_repository import ProfileRepository, get_profile_repository
from mytasks_api.repositories.progress_repository import (
    ProgressRepository,
    ProgressRule,
    get_progress_repository,
)
from mytasks_api.repositories.task_repository import (
    TaskRepository,
    Transition,
    get_task_repository,
)
from mytasks_api.schemas.task import TaskCreate, TaskUpdate

logger = logging.getLogger(__name__)

# Builds the progress rule of one transition; async because some rules read before the
# transaction (whether "do now" will be left empty).
ProgressRuleFactory = Callable[[str, str, datetime], Awaitable[ProgressRule]]


def day_settings(profile: Profile) -> DaySettings:
    return DaySettings(goal=profile.daily_goal, active_weekdays=profile.active_weekdays)


def _facts(task: Task) -> TaskFacts:
    return TaskFacts(
        id=task.id,
        completed_day=task.completed_day,
        points_awarded_on=task.points_awarded_on,
        is_do_now=task.quadrant is Quadrant.DO_NOW,
    )


@dataclass(frozen=True)
class ProgressTracking:
    """What the task transitions need to update the daily progress (feature 007). Without it
    (unit tests of the plain task rules) a transition only changes the task."""

    repository: ProgressRepository
    profiles: ProfileRepository
    clock: Clock


class TaskService:
    def __init__(
        self, repository: TaskRepository, progress: ProgressTracking | None = None
    ) -> None:
        self._repository = repository
        self._progress = progress

    def _log_missing(self, uid: str, task_id: str, action: str) -> None:
        # A foreign task and a missing one give the client the same 404; the log makes
        # it possible to spot someone probing identifiers.
        log_event(
            logger, logging.WARNING, "task_not_found", uid=uid, task_id=task_id, action=action
        )

    async def _ensure_room_for_active_task(self, uid: str) -> None:
        # "Soft" cap: the count and the write are not atomic, so two simultaneous
        # creations could overshoot by a small margin. Enough to bound abuse.
        if await self._repository.count_active(uid) >= MAX_ACTIVE_TASKS:
            raise ActiveTaskLimitError(uid)

    async def _transition(
        self,
        uid: str,
        task_id: str,
        action: str,
        transition: Transition,
        rule: ProgressRuleFactory | None = None,
    ) -> Task:
        try:
            if self._progress is None or rule is None:
                task = await self._repository.apply_transition(uid, task_id, transition)
            else:
                task = await self._tracked_transition(uid, task_id, transition, rule)
        except TaskNotFoundError:
            self._log_missing(uid, task_id, action)
            raise
        log_event(logger, logging.INFO, "task_transition", uid=uid, task_id=task_id, action=action)
        return task

    async def _tracked_transition(
        self, uid: str, task_id: str, transition: Transition, rule: ProgressRuleFactory
    ) -> Task:
        assert self._progress is not None
        profile = await self._progress.profiles.get(uid)
        now = self._progress.clock.now()
        today = day_key(now, profile.effective_timezone)
        progress_rule = await rule(uid, task_id, now)
        return await self._progress.repository.run_task_transition(
            uid,
            task_id,
            # The repository applies it with this same `now`: the clock decides both the task's
            # dates and the progress day.
            transition,
            progress_rule,
            today,
            day_settings(profile),
            now,
        )

    async def _complete_rule(self, uid: str, task_id: str, now: datetime) -> ProgressRule:
        # Whether completing it empties "do now" (the "Sin urgencias" achievement) is known
        # before the transaction: a race with another tab can only miss or repeat the check.
        existing = await self._repository.get(uid, task_id)
        do_now_left: int | None = None
        if (
            existing is not None
            and existing.status is Status.ACTIVE
            and not existing.in_trash
            and existing.quadrant is Quadrant.DO_NOW
        ):
            do_now_left = await self._count_do_now_left(uid)

        def rule(before: Task, _: Task, day: ProgressDay, state: PlayerState) -> Outcome:
            return apply_complete(_facts(before), day, state, now, do_now_left=do_now_left)

        return rule

    async def _count_do_now_left(self, uid: str) -> int | None:
        # Only feeds a cosmetic achievement: if the count fails (a missing index, a timeout),
        # the task is still completed and the check is skipped (security-review-fase-2,
        # MED-001; FR-034).
        try:
            return max(0, await self._repository.count_active_do_now(uid) - 1)
        except Exception as error:
            log_event(
                logger,
                logging.WARNING,
                "progress_do_now_count_failed",
                uid=uid,
                reason=type(error).__name__,
            )
            return None

    async def _reopen_rule(self, _uid: str, _task_id: str, now: datetime) -> ProgressRule:
        def rule(before: Task, _: Task, day: ProgressDay, state: PlayerState) -> Outcome:
            return apply_reopen(_facts(before), day, state, now)

        return rule

    async def _trash_rule(self, _uid: str, _task_id: str, now: datetime) -> ProgressRule:
        def rule(before: Task, _: Task, day: ProgressDay, state: PlayerState) -> Outcome:
            was_active = before.status is Status.ACTIVE and not before.in_trash
            return apply_trash(_facts(before), was_active, day, state, now)

        return rule

    async def get_task(self, uid: str, task_id: str) -> Task:
        task = await self._repository.get(uid, task_id)
        if task is None:
            self._log_missing(uid, task_id, "get")
            raise TaskNotFoundError(task_id)
        return task

    async def create_task(self, uid: str, data: TaskCreate) -> Task:
        await self._ensure_room_for_active_task(uid)
        return await self._repository.create(uid, data)

    async def update_task(self, uid: str, task_id: str, data: TaskUpdate) -> Task:
        try:
            return await self._repository.update(uid, task_id, data.updated_fields())
        except TaskNotFoundError:
            self._log_missing(uid, task_id, "update")
            raise

    async def list_board(
        self, uid: str, scope: Scope | None = None, order: BoardOrder = BoardOrder.OLDEST
    ) -> list[Task]:
        tasks = await self._repository.list_board(uid, scope)
        return sort_board(tasks, order)

    async def complete_task(self, uid: str, task_id: str) -> Task:
        return await self._transition(uid, task_id, "complete", complete, self._complete_rule)

    async def reopen_task(self, uid: str, task_id: str) -> Task:
        existing = await self._repository.get(uid, task_id)
        if existing is not None and existing.status == Status.COMPLETED and not existing.in_trash:
            await self._ensure_room_for_active_task(uid)
        return await self._transition(uid, task_id, "reopen", reopen, self._reopen_rule)

    async def trash_task(self, uid: str, task_id: str) -> Task:
        return await self._transition(uid, task_id, "trash", move_to_trash, self._trash_rule)

    async def restore_task(self, uid: str, task_id: str) -> Task:
        existing = await self._repository.get(uid, task_id)
        if existing is not None and existing.in_trash and existing.status == Status.ACTIVE:
            await self._ensure_room_for_active_task(uid)
        return await self._transition(uid, task_id, "restore", restore)

    async def delete_task(self, uid: str, task_id: str) -> None:
        try:
            await self._repository.delete(uid, task_id)
        except TaskNotFoundError:
            self._log_missing(uid, task_id, "delete")
            raise
        log_event(
            logger, logging.INFO, "task_transition", uid=uid, task_id=task_id, action="delete"
        )

    async def list_history(
        self, uid: str, cursor: str | None, limit: int, within_days: HistoryDays | None = None
    ) -> tuple[list[Task], str | None]:
        return await self._repository.list_history(uid, cursor, limit, within_days)

    async def list_trash(
        self, uid: str, cursor: str | None, limit: int
    ) -> tuple[list[Task], str | None]:
        return await self._repository.list_trash(uid, cursor, limit)


def get_task_service(
    repository: TaskRepository = Depends(get_task_repository),
    progress_repository: ProgressRepository = Depends(get_progress_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    clock: Clock = Depends(get_clock),
) -> TaskService:
    return TaskService(repository, ProgressTracking(progress_repository, profiles, clock))
