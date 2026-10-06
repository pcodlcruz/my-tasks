from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_healthz_returns_ok_without_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_get_task_returns_own_task_with_quadrant(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, urgent=True, important=False)

    response = await client.get(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == task_id
    assert body["quadrant"] == "delegate"


async def test_get_task_returns_404_when_task_does_not_exist(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks/does-not-exist",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 404


async def test_get_task_returns_404_when_purge_at_has_passed(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    past = datetime.now(UTC) - timedelta(days=1)
    task_id = await seed_task(user.uid, in_trash=True, purge_at=past)

    response = await client.get(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 404
