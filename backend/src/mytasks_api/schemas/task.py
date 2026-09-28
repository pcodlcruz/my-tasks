from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from mytasks_api.domain.task import Quadrant, Scope, Status, Task


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    urgent: bool
    important: bool
    scope: Scope

    @field_validator("title", "description", mode="before")
    @classmethod
    def _strip_whitespace(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    urgent: bool | None = None
    important: bool | None = None
    scope: Scope | None = None
    pinned: bool | None = None

    @field_validator("title", "description", mode="before")
    @classmethod
    def _strip_whitespace(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> Self:
        if not self.model_fields_set:
            message = "Debes indicar al menos un campo a actualizar."
            raise ValueError(message)
        return self

    def updated_fields(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)


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
