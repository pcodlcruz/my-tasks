from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_trash_active_task_sets_dates_and_keeps_status(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid)

    response = await client.post(
        f"/api/v1/tasks/{task_id}/trash",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["in_trash"] is True
    assert body["status"] == "active"
    trashed_at = datetime.fromisoformat(body["trashed_at"])
    purge_at = datetime.fromisoformat(body["purge_at"])
    assert purge_at - trashed_at == timedelta(days=30)


async def test_trash_completed_task_keeps_completed_status(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, status="completed", completed_at=datetime.now(UTC))

    response = await client.post(
        f"/api/v1/tasks/{task_id}/trash",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["completed_at"] is not None
    assert body["in_trash"] is True


async def test_trash_task_returns_409_if_already_in_trash(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(
        user.uid, in_trash=True, trashed_at=now, purge_at=now + timedelta(days=30)
    )

    response = await client.post(
        f"/api/v1/tasks/{task_id}/trash",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 409


async def test_trash_task_of_another_user_returns_404(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    owner = await google_user("owner@example.com")
    intruder = await google_user("intruder@example.com")
    task_id = await seed_task(owner.uid)

    response = await client.post(
        f"/api/v1/tasks/{task_id}/trash",
        headers={"Authorization": f"Bearer {intruder.id_token}"},
    )

    assert response.status_code == 404
