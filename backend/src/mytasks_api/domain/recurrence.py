"""When a schedule falls (feature 007, research R7). Pure date arithmetic on progress days: it
knows nothing about the active days (Clarification Q3) nor about time zones, which the callers
have already applied to get "today"."""

import calendar
import datetime as dt
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

# Enough to find any occurrence of a weekly (7 days) or monthly (one month plus the shorter
# month that follows) rule; a daily one is the next day.
_SEARCH_DAYS = 62


class RecurrenceKind(StrEnum):
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class InvalidRecurrenceError(ValueError):
    pass


@dataclass(frozen=True)
class Recurrence:
    kind: RecurrenceKind
    # Only with `once`. (`dt.date`: the field's name would hide the type here.)
    date: dt.date | None = None
    # Only with `weekly`: ISO weekdays, 1 = Monday … 7 = Sunday.
    weekdays: tuple[int, ...] = ()
    # Only with `monthly`: 1–31; in a shorter month, its last day.
    month_day: int | None = None


def occurs_on(rule: Recurrence, day: date) -> bool:
    if rule.kind is RecurrenceKind.ONCE:
        return day == rule.date
    if rule.kind is RecurrenceKind.DAILY:
        return True
    if rule.kind is RecurrenceKind.WEEKLY:
        return day.isoweekday() in rule.weekdays
    last_day = calendar.monthrange(day.year, day.month)[1]
    return day.day == min(rule.month_day or 1, last_day)


def next_occurrence(rule: Recurrence, after: date) -> date | None:
    """The first occurrence strictly after `after`, or None if there is none (a past one-off)."""
    if rule.kind is RecurrenceKind.ONCE:
        return rule.date if rule.date is not None and rule.date > after else None
    for offset in range(1, _SEARCH_DAYS + 1):
        day = after + timedelta(days=offset)
        if occurs_on(rule, day):
            return day
    return None


def latest_due(rule: Recurrence, upto: date) -> date | None:
    """The most recent occurrence on or before `upto`: after days away, the only one that is
    generated (US4.4)."""
    if rule.kind is RecurrenceKind.ONCE:
        return rule.date if rule.date is not None and rule.date <= upto else None
    for offset in range(_SEARCH_DAYS + 1):
        day = upto - timedelta(days=offset)
        if occurs_on(rule, day):
            return day
    return None


def starting_occurrence(
    rule: Recurrence, today: date, *, last_generated_for: date | None
) -> date | None:
    """Where a new, edited or resumed schedule starts: today if it falls today and nothing has
    been generated for today yet, otherwise the next occurrence. Never a day that went by."""
    if last_generated_for != today and occurs_on(rule, today):
        return today
    return next_occurrence(rule, today)


def check_once_date(rule: Recurrence, today: date) -> None:
    """A one-off schedule is for today or later, in the person's time zone."""
    if rule.kind is RecurrenceKind.ONCE and (rule.date is None or rule.date < today):
        message = "La fecha de una programación única debe ser hoy o posterior."
        raise InvalidRecurrenceError(message)
