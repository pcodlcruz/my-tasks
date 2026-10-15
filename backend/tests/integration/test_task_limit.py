from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedManyFactory, SeedTaskFactory

pytestmark = pytest.mark.integration

LIMIT = 500

NEW_TASK = {
    "title": "Una más",
    "description": "Detalle",
    "urgent": True,
    "important": True,
    "scope": "work",
}


async def test_create_task_succeeds_below_the_active_task_limit(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_many_tasks: SeedManyFactory
) -> None:
    user = await google_user("owner@example.com")
    await seed_many_tasks(user.uid, LIMIT - 1)

    response = await client.post(
        "/api/v1/tasks", json=NEW_TASK, headers={"Authorization": f"Bearer {user.id_token}"}
    )

    assert response.status_code == 201


async def test_create_task_returns_409_at_the_active_task_limit(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_many_tasks: SeedManyFactory
) -> None:
    user = await google_user("owner@example.com")
    await seed_many_tasks(user.uid, LIMIT)
    headers = {"Authorization": f"Bearer {user.id_token}"}

    response = await client.post("/api/v1/tasks", json=NEW_TASK, headers=headers)
    board = await client.get("/api/v1/tasks", params={"view": "board"}, headers=headers)

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "task_limit_reached"
    assert "500" in body["message"]
    assert len(board.json()["items"]) == LIMIT


async def test_completed_and_trashed_tasks_do_not_count_towards_the_limit(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_many_tasks: SeedManyFactory
) -> None:
    user = await google_user("owner@example.com")
    await seed_many_tasks(user.uid, LIMIT, status="completed")
    await seed_many_tasks(user.uid, LIMIT, in_trash=True)

    response = await client.post(
        "/api/v1/tasks", json=NEW_TASK, headers={"Authorization": f"Bearer {user.id_token}"}
    )

    assert response.status_code == 201


async def test_the_limit_is_per_user(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_many_tasks: SeedManyFactory
) -> None:
    full = await google_user("full@example.com")
    other = await google_user("other@example.com")
    await seed_many_tasks(full.uid, LIMIT)

    response = await client.post(
        "/api/v1/tasks", json=NEW_TASK, headers={"Authorization": f"Bearer {other.id_token}"}
    )

    assert response.status_code == 201


async def test_completing_a_task_frees_a_slot(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_many_tasks: SeedManyFactory
) -> None:
    user = await google_user("owner@example.com")
    task_ids = await seed_many_tasks(user.uid, LIMIT)
    headers = {"Authorization": f"Bearer {user.id_token}"}

    await client.post(f"/api/v1/tasks/{task_ids[0]}/complete", headers=headers)
    response = await client.post("/api/v1/tasks", json=NEW_TASK, headers=headers)

    assert response.status_code == 201


async def test_reopen_returns_409_at_the_limit(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_many_tasks: SeedManyFactory,
    seed_task: SeedTaskFactory,
) -> None:
    user = await google_user("owner@example.com")
    await seed_many_tasks(user.uid, LIMIT)
    completed_id = await seed_task(user.uid, status="completed", completed_at=datetime.now(UTC))

    response = await client.post(
        f"/api/v1/tasks/{completed_id}/reopen",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "task_limit_reached"


async def test_restoring_an_active_task_returns_409_at_the_limit_but_a_completed_one_does_not(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_many_tasks: SeedManyFactory,
    seed_task: SeedTaskFactory,
) -> None:
    user = await google_user("owner@example.com")
    await seed_many_tasks(user.uid, LIMIT)
    now = datetime.now(UTC)
    trashed = {"in_trash": True, "trashed_at": now, "purge_at": now.replace(year=now.year + 1)}
    active_id = await seed_task(user.uid, **trashed)
    completed_id = await seed_task(user.uid, status="completed", completed_at=now, **trashed)
    headers = {"Authorization": f"Bearer {user.id_token}"}

    active_response = await client.post(f"/api/v1/tasks/{active_id}/restore", headers=headers)
    completed_response = await client.post(f"/api/v1/tasks/{completed_id}/restore", headers=headers)

    assert active_response.status_code == 409
    assert active_response.json()["code"] == "task_limit_reached"
    assert completed_response.status_code == 200
