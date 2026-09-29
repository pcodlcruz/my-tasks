from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from enum import StrEnum

TRASH_RETENTION = timedelta(days=30)


class Scope(StrEnum):
    WORK = "work"
    PERSONAL = "personal"


class Quadrant(StrEnum):
    DO_NOW = "do_now"
    SCHEDULE = "schedule"
    DELEGATE = "delegate"
    ELIMINATE = "eliminate"


class Status(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"


class TaskNotFoundError(Exception):
    pass


class InvalidTransitionError(Exception):
    pass


class InvalidCursorError(Exception):
    pass


def quadrant_for(*, urgent: bool, important: bool) -> Quadrant:
    if urgent and important:
        return Quadrant.DO_NOW
    if not urgent and important:
        return Quadrant.SCHEDULE
    if urgent and not important:
        return Quadrant.DELEGATE
    return Quadrant.ELIMINATE


@dataclass
class Task:
    id: str
    title: str
    description: str
    urgent: bool
    important: bool
    scope: Scope
    pinned: bool
    status: Status
    in_trash: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    trashed_at: datetime | None
    purge_at: datetime | None

    @property
    def quadrant(self) -> Quadrant:
        return quadrant_for(urgent=self.urgent, important=self.important)


def sort_board(tasks: list[Task]) -> list[Task]:
    return sorted(tasks, key=lambda task: (not task.pinned, task.created_at))


def ensure_editable(task: Task) -> None:
    if task.status != Status.ACTIVE or task.in_trash:
        raise InvalidTransitionError(task.id)


def complete(task: Task, now: datetime) -> Task:
    if task.status != Status.ACTIVE or task.in_trash:
        raise InvalidTransitionError(task.id)
    return replace(task, status=Status.COMPLETED, completed_at=now, updated_at=now)


def reopen(task: Task, now: datetime) -> Task:
    if task.status != Status.COMPLETED or task.in_trash:
        raise InvalidTransitionError(task.id)
    return replace(task, status=Status.ACTIVE, completed_at=None, updated_at=now)


def move_to_trash(task: Task, now: datetime) -> Task:
    if task.in_trash:
        raise InvalidTransitionError(task.id)
    return replace(
        task,
        in_trash=True,
        trashed_at=now,
        purge_at=now + TRASH_RETENTION,
        updated_at=now,
    )


def restore(task: Task, now: datetime) -> Task:
    if not task.in_trash:
        raise InvalidTransitionError(task.id)
    return replace(task, in_trash=False, trashed_at=None, purge_at=None, updated_at=now)


def ensure_purgeable(task: Task) -> None:
    if not task.in_trash:
        raise InvalidTransitionError(task.id)
