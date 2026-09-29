from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_restore_active_task_returns_it_to_active(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(
        user.uid, in_trash=True, trashed_at=now, purge_at=now + timedelta(days=30)
    )

    response = await client.post(
        f"/api/v1/tasks/{task_id}/restore",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["in_trash"] is False
    assert body["status"] == "active"
    assert body["trashed_at"] is None
    assert body["purge_at"] is None


async def test_restore_completed_task_returns_it_to_completed(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(
        user.uid,
        status="completed",
        completed_at=now - timedelta(days=1),
        in_trash=True,
        trashed_at=now,
        purge_at=now + timedelta(days=30),
    )

    response = await client.post(
        f"/api/v1/tasks/{task_id}/restore",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["in_trash"] is False
    assert body["status"] == "completed"
    assert body["completed_at"] is not None


async def test_restore_task_returns_409_if_not_in_trash(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid)

    response = await client.post(
        f"/api/v1/tasks/{task_id}/restore",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 409


async def test_restore_task_returns_404_if_purge_date_has_passed(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(
        user.uid,
        in_trash=True,
        trashed_at=now - timedelta(days=31),
        purge_at=now - timedelta(days=1),
    )

    response = await client.post(
        f"/api/v1/tasks/{task_id}/restore",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 404


async def test_restore_task_of_another_user_returns_404(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    owner = await google_user("owner@example.com")
    intruder = await google_user("intruder@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(
        owner.uid, in_trash=True, trashed_at=now, purge_at=now + timedelta(days=30)
    )

    response = await client.post(
        f"/api/v1/tasks/{task_id}/restore",
        headers={"Authorization": f"Bearer {intruder.id_token}"},
    )

    assert response.status_code == 404
