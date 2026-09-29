from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_reopen_task_returns_200_active_with_original_quadrant(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(
        user.uid,
        urgent=False,
        important=True,
        status="completed",
        completed_at=datetime.now(UTC),
    )

    response = await client.post(
        f"/api/v1/tasks/{task_id}/reopen",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active"
    assert body["completed_at"] is None
    assert body["quadrant"] == "schedule"


async def test_reopen_task_returns_409_if_active(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid)

    response = await client.post(
        f"/api/v1/tasks/{task_id}/reopen",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 409


async def test_reopen_task_returns_409_if_in_trash(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(
        user.uid, status="completed", completed_at=datetime.now(UTC), in_trash=True
    )

    response = await client.post(
        f"/api/v1/tasks/{task_id}/reopen",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 409


async def test_reopen_task_of_another_user_returns_404(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    owner = await google_user("owner@example.com")
    intruder = await google_user("intruder@example.com")
    task_id = await seed_task(owner.uid, status="completed", completed_at=datetime.now(UTC))

    response = await client.post(
        f"/api/v1/tasks/{task_id}/reopen",
        headers={"Authorization": f"Bearer {intruder.id_token}"},
    )

    assert response.status_code == 404
