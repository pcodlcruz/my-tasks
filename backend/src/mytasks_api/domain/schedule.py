"""Scheduled tasks (feature 007, US4): the schedule, its states and the rules of its life cycle
and of the generation of its tasks (research R7, data-model §5). Pure: the repository applies
them inside its transactions."""

from dataclasses import dataclass, replace
from datetime import date, datetime
from enum import StrEnum

from mytasks_api.domain.recurrence import (
    Recurrence,
    RecurrenceKind,
    latest_due,
    next_occurrence,
    starting_occurrence,
)
from mytasks_api.domain.task import Quadrant, Scope, quadrant_for

# Per person, finished ones included: bounds the cost of the daily catch-up.
MAX_SCHEDULES = 50


class ScheduleStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    FINISHED = "finished"


class ScheduleNotFoundError(Exception):
    pass


class ScheduleLimitError(Exception):
    pass


class ScheduleFinishedError(Exception):
    pass


@dataclass(frozen=True)
class Schedule:
    id: str
    title: str
    description: str
    urgent: bool
    important: bool
    scope: Scope
    recurrence: Recurrence
    status: ScheduleStatus
    # The progress day it is next due; None while paused or once finished, so "due" is a single
    # `next_occurrence <= today` query.
    next_occurrence: date | None
    last_task_id: str | None
    last_generated_for: date | None
    created_at: datetime
    updated_at: datetime

    @property
    def quadrant(self) -> Quadrant:
        return quadrant_for(urgent=self.urgent, important=self.important)


@dataclass(frozen=True)
class NewSchedule:
    title: str
    description: str
    urgent: bool
    important: bool
    scope: Scope
    recurrence: Recurrence
    next_occurrence: date | None


@dataclass(frozen=True)
class ScheduleChanges:
    """A partial edit: only the fields given change."""

    title: str | None = None
    description: str | None = None
    urgent: bool | None = None
    important: bool | None = None
    scope: Scope | None = None
    recurrence: Recurrence | None = None


def _ensure_not_finished(schedule: Schedule) -> None:
    if schedule.status is ScheduleStatus.FINISHED:
        raise ScheduleFinishedError(schedule.id)


def edit(schedule: Schedule, changes: ScheduleChanges, today: date) -> Schedule:
    """Only the next occurrences change: the tasks already generated stay as they are. A new
    repetition counts from today, today included if nothing was generated for it yet."""
    _ensure_not_finished(schedule)
    recurrence = changes.recurrence or schedule.recurrence
    next_day = schedule.next_occurrence
    if changes.recurrence is not None and schedule.status is ScheduleStatus.ACTIVE:
        next_day = starting_occurrence(
            recurrence, today, last_generated_for=schedule.last_generated_for
        )
    return replace(
        schedule,
        title=changes.title if changes.title is not None else schedule.title,
        description=(
            changes.description if changes.description is not None else schedule.description
        ),
        urgent=changes.urgent if changes.urgent is not None else schedule.urgent,
        important=changes.important if changes.important is not None else schedule.important,
        scope=changes.scope if changes.scope is not None else schedule.scope,
        recurrence=recurrence,
        next_occurrence=next_day,
    )


def pause(schedule: Schedule) -> Schedule:
    _ensure_not_finished(schedule)
    return replace(schedule, status=ScheduleStatus.PAUSED, next_occurrence=None)


def resume(schedule: Schedule, today: date) -> Schedule:
    """Counts from today: the days that went by while paused are not made up for. A one-off
    whose date went by can no longer happen."""
    _ensure_not_finished(schedule)
    if schedule.status is ScheduleStatus.ACTIVE:
        return schedule
    next_day = starting_occurrence(
        schedule.recurrence, today, last_generated_for=schedule.last_generated_for
    )
    if next_day is None:
        raise ScheduleFinishedError(schedule.id)
    return replace(schedule, status=ScheduleStatus.ACTIVE, next_occurrence=next_day)


@dataclass(frozen=True)
class GenerationPlan:
    """What one due schedule does today."""

    # The occurrence it is due for: the most recent one up to today.
    due: date
    # The day of the task to create, or None (the previous one is still active, or no room).
    create_for: date | None
    # No task because the 500 active tasks are reached: a notice tells the person.
    skipped_limit: bool
    status: ScheduleStatus
    next_occurrence: date | None


def plan_generation(
    schedule: Schedule, today: date, *, last_task_active: bool, has_room: bool
) -> GenerationPlan | None:
    """None if it is not due (paused, finished, or already done today by another request).
    Otherwise a single task for the latest occurrence, unless the previous one is still active
    (it keeps its day, shown as "pending since") or there is no room. Either way it moves on to
    the first occurrence after today; a one-off finishes."""
    if (
        schedule.status is not ScheduleStatus.ACTIVE
        or schedule.next_occurrence is None
        or schedule.next_occurrence > today
    ):
        return None
    due = latest_due(schedule.recurrence, today) or schedule.next_occurrence
    finished = schedule.recurrence.kind is RecurrenceKind.ONCE
    status = ScheduleStatus.FINISHED if finished else ScheduleStatus.ACTIVE
    following = None if finished else next_occurrence(schedule.recurrence, today)
    if last_task_active:
        return GenerationPlan(due, None, False, status, following)
    if not has_room:
        return GenerationPlan(due, None, True, status, following)
    return GenerationPlan(due, due, False, status, following)
