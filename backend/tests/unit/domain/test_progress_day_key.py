from datetime import UTC, datetime

import pytest

from mytasks_api.domain.progress import day_key, is_active

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        # Madrid is UTC+1 in November: 03:59 local is still the previous progress day.
        (datetime(2026, 11, 3, 2, 59, tzinfo=UTC), "2026-11-02"),
        (datetime(2026, 11, 3, 3, 0, tzinfo=UTC), "2026-11-03"),
        # 00:30 local belongs to the day that started at 04:00 the day before.
        (datetime(2026, 11, 2, 23, 30, tzinfo=UTC), "2026-11-02"),
        (datetime(2026, 11, 3, 12, 0, tzinfo=UTC), "2026-11-03"),
    ],
)
def test_day_key_cuts_at_four_in_the_morning_local_time(moment: datetime, expected: str) -> None:
    assert day_key(moment, "Europe/Madrid") == expected


def test_day_key_depends_on_the_time_zone() -> None:
    moment = datetime(2026, 11, 3, 10, 0, tzinfo=UTC)

    assert day_key(moment, "Europe/Madrid") == "2026-11-03"  # 11:00
    assert day_key(moment, "America/New_York") == "2026-11-03"  # 05:00
    assert day_key(moment, "Pacific/Auckland") == "2026-11-03"  # 23:00
    assert day_key(datetime(2026, 11, 3, 8, 0, tzinfo=UTC), "America/New_York") == "2026-11-02"


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        # Spring forward in Madrid (29 March 2026, 02:00 → 03:00): the cut at 04:00 still holds.
        (datetime(2026, 3, 29, 1, 59, tzinfo=UTC), "2026-03-28"),  # 03:59 CEST
        (datetime(2026, 3, 29, 2, 0, tzinfo=UTC), "2026-03-29"),  # 04:00 CEST
        # Fall back (25 October 2026, 03:00 → 02:00).
        (datetime(2026, 10, 25, 2, 59, tzinfo=UTC), "2026-10-24"),  # 03:59 CET
        (datetime(2026, 10, 25, 3, 0, tzinfo=UTC), "2026-10-25"),  # 04:00 CET
    ],
)
def test_day_key_survives_the_daylight_saving_nights(moment: datetime, expected: str) -> None:
    assert day_key(moment, "Europe/Madrid") == expected


def test_is_active_uses_iso_weekdays_with_monday_as_one() -> None:
    assert is_active("2026-11-02", (1,))  # Monday
    assert not is_active("2026-11-08", (1, 2, 3, 4, 5, 6))  # Sunday
    assert is_active("2026-11-08", (7,))
