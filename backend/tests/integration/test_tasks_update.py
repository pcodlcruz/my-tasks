from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_update_task_edits_fields_and_recalculates_quadrant(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, urgent=False, important=True)

    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"urgent": True},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["urgent"] is True
    assert body["quadrant"] == "do_now"


async def test_update_task_preserves_pinned_when_quadrant_changes(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, urgent=False, important=True, pinned=True)

    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"urgent": True},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    assert response.json()["pinned"] is True


async def test_update_task_can_pin_and_unpin(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, pinned=False)

    pin_response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"pinned": True},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )
    unpin_response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"pinned": False},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert pin_response.json()["pinned"] is True
    assert unpin_response.json()["pinned"] is False


async def test_update_task_returns_409_if_completed(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, status="completed")

    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Nuevo título"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 409


async def test_update_task_returns_409_if_in_trash(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, in_trash=True)

    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Nuevo título"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 409


async def test_update_task_of_another_user_returns_404(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    owner = await google_user("owner@example.com")
    intruder = await google_user("intruder@example.com")
    task_id = await seed_task(owner.uid)

    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Nuevo título"},
        headers={"Authorization": f"Bearer {intruder.id_token}"},
    )

    assert response.status_code == 404


async def test_update_task_returns_422_for_empty_body(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid)

    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422


async def test_update_task_returns_422_for_invalid_body(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid)

    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "   "},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
