from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_delete_task_in_trash_returns_204_and_removes_document(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(
        user.uid, in_trash=True, trashed_at=now, purge_at=now + timedelta(days=30)
    )
    headers = {"Authorization": f"Bearer {user.id_token}"}

    response = await client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    follow_up = await client.get(f"/api/v1/tasks/{task_id}", headers=headers)

    assert response.status_code == 204
    assert response.content == b""
    assert follow_up.status_code == 404


async def test_delete_task_returns_409_if_not_in_trash(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid)
    headers = {"Authorization": f"Bearer {user.id_token}"}

    response = await client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    follow_up = await client.get(f"/api/v1/tasks/{task_id}", headers=headers)

    assert response.status_code == 409
    assert follow_up.status_code == 200


async def test_delete_task_of_another_user_returns_404(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    owner = await google_user("owner@example.com")
    intruder = await google_user("intruder@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(
        owner.uid, in_trash=True, trashed_at=now, purge_at=now + timedelta(days=30)
    )

    response = await client.delete(
        f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {intruder.id_token}"}
    )
    owner_view = await client.get(
        f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {owner.id_token}"}
    )

    assert response.status_code == 404
    assert owner_view.status_code == 200


async def test_delete_task_returns_404_if_purge_date_has_passed(
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

    response = await client.delete(
        f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {user.id_token}"}
    )

    assert response.status_code == 404
