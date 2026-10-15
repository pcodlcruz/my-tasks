from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_list_history_returns_completed_tasks_newest_first(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="old", status="completed", completed_at=now - timedelta(days=2))
    await seed_task(user.uid, title="new", status="completed", completed_at=now)
    await seed_task(user.uid, title="mid", status="completed", completed_at=now - timedelta(days=1))

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "history"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["title"] for item in body["items"]] == ["new", "mid", "old"]
    assert body["next_cursor"] is None


async def test_list_history_excludes_active_trashed_and_other_users_tasks(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    other = await google_user("other@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="active")
    await seed_task(
        user.uid,
        title="completed-in-trash",
        status="completed",
        completed_at=now,
        in_trash=True,
        trashed_at=now,
        purge_at=now + timedelta(days=30),
    )
    await seed_task(other.uid, title="other-user", status="completed", completed_at=now)
    await seed_task(user.uid, title="mine", status="completed", completed_at=now)

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "history"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert [item["title"] for item in response.json()["items"]] == ["mine"]


async def test_list_history_paginates_with_cursor_and_limit(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    for index in range(5):
        await seed_task(
            user.uid,
            title=f"task-{index}",
            status="completed",
            completed_at=now - timedelta(hours=index),
        )
    headers = {"Authorization": f"Bearer {user.id_token}"}

    first = await client.get(
        "/api/v1/tasks", params={"view": "history", "limit": 2}, headers=headers
    )
    second = await client.get(
        "/api/v1/tasks",
        params={"view": "history", "limit": 2, "cursor": first.json()["next_cursor"]},
        headers=headers,
    )
    third = await client.get(
        "/api/v1/tasks",
        params={"view": "history", "limit": 2, "cursor": second.json()["next_cursor"]},
        headers=headers,
    )

    assert [item["title"] for item in first.json()["items"]] == ["task-0", "task-1"]
    assert [item["title"] for item in second.json()["items"]] == ["task-2", "task-3"]
    assert [item["title"] for item in third.json()["items"]] == ["task-4"]
    assert third.json()["next_cursor"] is None


async def test_list_history_page_that_ends_exactly_has_no_next_cursor(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    for index in range(2):
        await seed_task(
            user.uid,
            status="completed",
            completed_at=now - timedelta(hours=index),
        )

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "history", "limit": 2},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert len(response.json()["items"]) == 2
    assert response.json()["next_cursor"] is None


@pytest.mark.parametrize("limit", [0, 101, -1])
async def test_list_history_returns_422_for_limit_out_of_range(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, limit: int
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "history", "limit": limit},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422


async def test_list_history_returns_422_for_malformed_cursor(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "history", "cursor": "not-a-valid-cursor"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
