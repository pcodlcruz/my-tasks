from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    field_validator,
    model_validator,
)

from mytasks_api.domain.recurrence import Recurrence, RecurrenceKind
from mytasks_api.domain.schedule import Schedule, ScheduleChanges, ScheduleStatus
from mytasks_api.domain.task import Quadrant, Scope

# Strict: a weekday or a day of the month is a plain integer, never "3" nor `true`.
Weekday = Annotated[StrictInt, Field(ge=1, le=7)]
MonthDay = Annotated[StrictInt, Field(ge=1, le=31)]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OnceIn(_Closed):
    kind: Literal["once"]
    date: date

    def to_recurrence(self) -> Recurrence:
        return Recurrence(RecurrenceKind.ONCE, date=self.date)


class DailyIn(_Closed):
    kind: Literal["daily"]

    def to_recurrence(self) -> Recurrence:
        return Recurrence(RecurrenceKind.DAILY)


class WeeklyIn(_Closed):
    kind: Literal["weekly"]
    weekdays: list[Weekday] = Field(min_length=1, max_length=7)

    @field_validator("weekdays")
    @classmethod
    def _no_repeated_days(cls, value: list[int]) -> list[int]:
        if len(set(value)) != len(value):
            message = "Los días de la semana no pueden repetirse."
            raise ValueError(message)
        return sorted(value)

    def to_recurrence(self) -> Recurrence:
        return Recurrence(RecurrenceKind.WEEKLY, weekdays=tuple(self.weekdays))


class MonthlyIn(_Closed):
    kind: Literal["monthly"]
    month_day: MonthDay

    def to_recurrence(self) -> Recurrence:
        return Recurrence(RecurrenceKind.MONTHLY, month_day=self.month_day)


# A closed list of shapes told apart by `kind`: anything else is a 422.
RecurrenceIn = Annotated[OnceIn | DailyIn | WeeklyIn | MonthlyIn, Field(discriminator="kind")]


class ScheduleIn(_Closed):
    """Same text rules as `TaskCreate` (only spaces is empty). A one-off date of today or later
    is checked by the service, which knows the person's time zone."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    urgent: StrictBool
    important: StrictBool
    scope: Scope
    recurrence: RecurrenceIn

    @field_validator("title", "description", mode="before")
    @classmethod
    def _strip_whitespace(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ScheduleUpdateIn(_Closed):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    urgent: StrictBool | None = None
    important: StrictBool | None = None
    scope: Scope | None = None
    recurrence: RecurrenceIn | None = None

    @field_validator("title", "description", mode="before")
    @classmethod
    def _strip_whitespace(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _require_a_change_and_no_nulls(self) -> Self:
        if not self.model_fields_set:
            message = "Debes indicar al menos un campo a actualizar."
            raise ValueError(message)
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                message = f"El campo {name} no admite null."
                raise ValueError(message)
        return self

    def to_changes(self) -> ScheduleChanges:
        return ScheduleChanges(
            title=self.title,
            description=self.description,
            urgent=self.urgent,
            important=self.important,
            scope=self.scope,
            recurrence=self.recurrence.to_recurrence() if self.recurrence is not None else None,
        )


def _recurrence_out(rule: Recurrence) -> OnceIn | DailyIn | WeeklyIn | MonthlyIn:
    if rule.kind is RecurrenceKind.ONCE and rule.date is not None:
        return OnceIn(kind="once", date=rule.date)
    if rule.kind is RecurrenceKind.WEEKLY:
        return WeeklyIn(kind="weekly", weekdays=list(rule.weekdays))
    if rule.kind is RecurrenceKind.MONTHLY and rule.month_day is not None:
        return MonthlyIn(kind="monthly", month_day=rule.month_day)
    return DailyIn(kind="daily")


class ScheduleOut(BaseModel):
    id: str
    title: str
    description: str
    urgent: bool
    important: bool
    scope: Scope
    quadrant: Quadrant
    recurrence: RecurrenceIn
    status: ScheduleStatus
    next_occurrence: date | None
    last_generated_for: date | None
    created_at: datetime

    @classmethod
    def from_schedule(cls, schedule: Schedule) -> "ScheduleOut":
        return cls(
            id=schedule.id,
            title=schedule.title,
            description=schedule.description,
            urgent=schedule.urgent,
            important=schedule.important,
            scope=schedule.scope,
            quadrant=schedule.quadrant,
            recurrence=_recurrence_out(schedule.recurrence),
            status=schedule.status,
            next_occurrence=schedule.next_occurrence,
            last_generated_for=schedule.last_generated_for,
            created_at=schedule.created_at,
        )


class SchedulePage(BaseModel):
    items: list[ScheduleOut]
