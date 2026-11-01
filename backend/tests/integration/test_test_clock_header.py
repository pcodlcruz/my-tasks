from __future__ import annotations

import logging
from collections.abc import Iterator
from typing import TYPE_CHECKING

import httpx
import pytest

from mytasks_api.config import get_settings

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory

pytestmark = pytest.mark.integration

PROGRESS_URL = "/api/v1/me/progress"
FAR_FUTURE = "2030-06-15T10:00:00+02:00"


@pytest.fixture
def as_staging() -> Iterator[None]:
    """The app as if it ran in staging, keeping the emulators this test talks to."""
    from mytasks_api.main import app

    base = get_settings()
    app.dependency_overrides[get_settings] = lambda: base.model_copy(update={"app_env": "staging"})
    yield
    app.dependency_overrides.pop(get_settings, None)


async def test_the_test_clock_moves_today_in_local(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")

    response = await client.get(
        PROGRESS_URL, headers={"Authorization": f"Bearer {user.id_token}", "X-Test-Now": FAR_FUTURE}
    )

    assert response.status_code == 200
    assert response.json()["today"] == "2030-06-15"


async def test_the_test_clock_has_no_effect_outside_local_and_is_logged(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    as_staging: None,
    caplog: pytest.LogCaptureFixture,
) -> None:
    user = await google_user("ana@example.com")

    with caplog.at_level(logging.WARNING, logger="mytasks_api.clock"):
        response = await client.get(
            PROGRESS_URL,
            headers={"Authorization": f"Bearer {user.id_token}", "X-Test-Now": FAR_FUTURE},
        )

    assert response.status_code == 200
    assert not response.json()["today"].startswith("2030")
    assert any(record.getMessage() == "test_clock_ignored" for record in caplog.records)
