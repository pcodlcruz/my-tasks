from datetime import datetime

from pydantic import BaseModel, ConfigDict

from mytasks_api.domain.task import Quadrant, Scope, Status, Task


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    urgent: bool
    important: bool
    quadrant: Quadrant
    scope: Scope
    pinned: bool
    status: Status
    in_trash: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    trashed_at: datetime | None
    purge_at: datetime | None

    @classmethod
    def from_task(cls, task: Task) -> "TaskOut":
        return cls(
            id=task.id,
            title=task.title,
            description=task.description,
            urgent=task.urgent,
            important=task.important,
            quadrant=task.quadrant,
            scope=task.scope,
            pinned=task.pinned,
            status=task.status,
            in_trash=task.in_trash,
            created_at=task.created_at,
            updated_at=task.updated_at,
            completed_at=task.completed_at,
            trashed_at=task.trashed_at,
            purge_at=task.purge_at,
        )


class TaskPage(BaseModel):
    items: list[TaskOut]
    next_cursor: str | None


class ErrorOut(BaseModel):
    code: str
    message: str
    details: list[dict[str, object]] | None = None
