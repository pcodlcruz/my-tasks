import logging
from datetime import UTC, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from mytasks_api.clock import TEST_NOW_HEADER, FixedClock, SystemClock, get_clock
from mytasks_api.config import Settings

pytestmark = pytest.mark.unit


def _request(headers: dict[str, str] | None = None) -> Request:
    raw = [(name.lower().encode(), value.encode()) for name, value in (headers or {}).items()]
    return Request({"type": "http", "headers": raw})


def _settings(app_env: str) -> Settings:
    if app_env == "local":
        return Settings(app_env="local", google_cloud_project="demo-mytasks")
    # Built without validation: a local `.env` with emulator hosts would make a real
    # environment refuse to load, and only `app_env` matters here.
    return Settings.model_construct(app_env=app_env, google_cloud_project="pdlco-mytasks-stg")


def test_system_clock_returns_an_aware_utc_moment() -> None:
    moment = SystemClock().now()

    assert moment.tzinfo is UTC
    assert abs(moment - datetime.now(UTC)) < timedelta(seconds=5)


def test_get_clock_without_the_header_is_the_system_clock() -> None:
    clock = get_clock(_request(), _settings("local"))

    assert isinstance(clock, SystemClock)


def test_get_clock_uses_the_test_header_in_local() -> None:
    clock = get_clock(_request({TEST_NOW_HEADER: "2026-11-02T04:01:00+01:00"}), _settings("local"))

    assert isinstance(clock, FixedClock)
    assert clock.now() == datetime(2026, 11, 2, 3, 1, tzinfo=UTC)


@pytest.mark.parametrize("app_env", ["staging", "production"])
def test_get_clock_ignores_the_test_header_outside_local_and_logs_it(
    app_env: str, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="mytasks_api.clock"):
        clock = get_clock(
            _request({TEST_NOW_HEADER: "2030-01-01T00:00:00+00:00"}), _settings(app_env)
        )

    assert isinstance(clock, SystemClock)
    assert any(record.getMessage() == "test_clock_ignored" for record in caplog.records)


@pytest.mark.parametrize("raw", ["mañana", "2026-11-02T04:01:00", ""])
def test_get_clock_rejects_a_malformed_or_naive_test_header_in_local(raw: str) -> None:
    with pytest.raises(HTTPException) as error:
        get_clock(_request({TEST_NOW_HEADER: raw}), _settings("local"))

    assert error.value.status_code == 422


def test_fixed_clock_normalizes_to_utc() -> None:
    clock = FixedClock(datetime(2026, 11, 2, 4, 1, tzinfo=timezone(timedelta(hours=1))))

    assert clock.now().tzinfo is UTC
