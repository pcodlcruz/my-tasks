from datetime import date

import pytest

from mytasks_api.domain.recurrence import (
    InvalidRecurrenceError,
    Recurrence,
    RecurrenceKind,
    check_once_date,
    latest_due,
    next_occurrence,
    starting_occurrence,
)

pytestmark = pytest.mark.unit

MONDAY = date(2026, 11, 2)
TUESDAY = date(2026, 11, 3)
WEDNESDAY = date(2026, 11, 4)
SUNDAY = date(2026, 11, 8)
NEXT_MONDAY = date(2026, 11, 9)

DAILY = Recurrence(RecurrenceKind.DAILY)
MONDAY_AND_WEDNESDAY = Recurrence(RecurrenceKind.WEEKLY, weekdays=(1, 3))


def once(day: date) -> Recurrence:
    return Recurrence(RecurrenceKind.ONCE, date=day)


def monthly(month_day: int) -> Recurrence:
    return Recurrence(RecurrenceKind.MONTHLY, month_day=month_day)


class TestNextOccurrence:
    def test_once_is_its_date_if_later_and_nothing_after_it(self) -> None:
        assert next_occurrence(once(WEDNESDAY), MONDAY) == WEDNESDAY
        assert next_occurrence(once(WEDNESDAY), WEDNESDAY) is None

    def test_daily_is_the_next_day(self) -> None:
        assert next_occurrence(DAILY, TUESDAY) == WEDNESDAY

    def test_weekly_finds_the_next_listed_weekday(self) -> None:
        assert next_occurrence(MONDAY_AND_WEDNESDAY, MONDAY) == WEDNESDAY
        assert next_occurrence(MONDAY_AND_WEDNESDAY, TUESDAY) == WEDNESDAY

    def test_weekly_crosses_into_the_next_week(self) -> None:
        assert next_occurrence(MONDAY_AND_WEDNESDAY, WEDNESDAY) == NEXT_MONDAY
        assert next_occurrence(Recurrence(RecurrenceKind.WEEKLY, weekdays=(7,)), SUNDAY) == date(
            2026, 11, 15
        )

    def test_monthly_is_that_day_of_the_month(self) -> None:
        assert next_occurrence(monthly(15), MONDAY) == date(2026, 11, 15)
        assert next_occurrence(monthly(1), MONDAY) == date(2026, 12, 1)

    def test_day_31_falls_on_the_last_day_of_a_30_day_month(self) -> None:
        assert next_occurrence(monthly(31), date(2026, 11, 1)) == date(2026, 11, 30)
        assert next_occurrence(monthly(31), date(2026, 11, 30)) == date(2026, 12, 31)

    def test_day_29_to_31_fall_on_the_last_day_of_february(self) -> None:
        assert next_occurrence(monthly(31), date(2027, 1, 31)) == date(2027, 2, 28)
        assert next_occurrence(monthly(30), date(2028, 1, 31)) == date(2028, 2, 29)
        assert next_occurrence(monthly(29), date(2028, 2, 1)) == date(2028, 2, 29)


class TestLatestDue:
    def test_once_only_once_its_date_has_come(self) -> None:
        assert latest_due(once(WEDNESDAY), TUESDAY) is None
        assert latest_due(once(WEDNESDAY), SUNDAY) == WEDNESDAY

    def test_daily_is_today(self) -> None:
        assert latest_due(DAILY, SUNDAY) == SUNDAY

    def test_weekly_is_the_most_recent_listed_weekday(self) -> None:
        assert latest_due(MONDAY_AND_WEDNESDAY, TUESDAY) == MONDAY
        assert latest_due(MONDAY_AND_WEDNESDAY, SUNDAY) == WEDNESDAY
        assert latest_due(MONDAY_AND_WEDNESDAY, NEXT_MONDAY) == NEXT_MONDAY

    def test_monthly_31_in_february_is_its_last_day(self) -> None:
        assert latest_due(monthly(31), date(2027, 3, 10)) == date(2027, 2, 28)
        assert latest_due(monthly(31), date(2028, 3, 10)) == date(2028, 2, 29)


class TestStartingOccurrence:
    def test_includes_today_when_today_is_a_day_and_nothing_was_generated_today(self) -> None:
        assert starting_occurrence(MONDAY_AND_WEDNESDAY, MONDAY, last_generated_for=None) == MONDAY

    def test_skips_today_if_today_was_already_generated(self) -> None:
        assert (
            starting_occurrence(MONDAY_AND_WEDNESDAY, MONDAY, last_generated_for=MONDAY)
            == WEDNESDAY
        )

    def test_is_the_next_day_that_matches_otherwise(self) -> None:
        assert starting_occurrence(MONDAY_AND_WEDNESDAY, TUESDAY, last_generated_for=None) == (
            WEDNESDAY
        )

    def test_resuming_counts_from_today_not_from_the_missed_days(self) -> None:
        # Paused on Monday, resumed on Sunday: the next one is the following Monday, not the
        # Wednesday that went by while paused.
        assert starting_occurrence(MONDAY_AND_WEDNESDAY, SUNDAY, last_generated_for=MONDAY) == (
            NEXT_MONDAY
        )

    def test_once_in_the_past_has_no_occurrence(self) -> None:
        assert starting_occurrence(once(MONDAY), TUESDAY, last_generated_for=None) is None


class TestCheckOnceDate:
    def test_today_and_future_dates_are_accepted(self) -> None:
        check_once_date(once(TUESDAY), TUESDAY)
        check_once_date(once(WEDNESDAY), TUESDAY)

    def test_a_past_date_is_refused(self) -> None:
        with pytest.raises(InvalidRecurrenceError):
            check_once_date(once(MONDAY), TUESDAY)

    def test_other_kinds_have_no_date_to_check(self) -> None:
        check_once_date(DAILY, TUESDAY)


def test_the_rules_do_not_depend_on_the_active_days() -> None:
    # Clarification Q3: a daily schedule also falls on the days marked as not active; nothing in
    # the recurrence knows about them.
    assert [next_occurrence(DAILY, day) for day in (date(2026, 11, 6), date(2026, 11, 7))] == [
        date(2026, 11, 7),
        SUNDAY,
    ]
