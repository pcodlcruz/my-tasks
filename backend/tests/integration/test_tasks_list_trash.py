from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


def _trashed(trashed_at: datetime) -> dict[str, object]:
    return {
        "in_trash": True,
        "trashed_at": trashed_at,
        "purge_at": trashed_at + timedelta(days=30),
    }


async def test_list_trash_returns_trashed_tasks_newest_first(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="old", **_trashed(now - timedelta(days=5)))
    await seed_task(user.uid, title="new", **_trashed(now))
    await seed_task(user.uid, title="mid", **_trashed(now - timedelta(days=2)))

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "trash"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["title"] for item in body["items"]] == ["new", "mid", "old"]
    assert body["next_cursor"] is None


async def test_list_trash_includes_completed_and_excludes_tasks_outside_trash(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    other = await google_user("other@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="active-outside")
    await seed_task(
        user.uid,
        title="completed-in-trash",
        status="completed",
        completed_at=now,
        **_trashed(now),
    )
    await seed_task(other.uid, title="other-user", **_trashed(now))

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "trash"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    items = response.json()["items"]
    assert [item["title"] for item in items] == ["completed-in-trash"]
    assert items[0]["status"] == "completed"


async def test_list_trash_hides_tasks_whose_purge_date_has_passed(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="expired", **_trashed(now - timedelta(days=31)))
    await seed_task(user.uid, title="alive", **_trashed(now - timedelta(days=29)))

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "trash"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert [item["title"] for item in response.json()["items"]] == ["alive"]


async def test_operations_on_expired_task_return_404(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    task_id = await seed_task(user.uid, **_trashed(now - timedelta(days=31)))
    headers = {"Authorization": f"Bearer {user.id_token}"}

    get_response = await client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    restore_response = await client.post(f"/api/v1/tasks/{task_id}/restore", headers=headers)
    delete_response = await client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    complete_response = await client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers)

    assert get_response.status_code == 404
    assert restore_response.status_code == 404
    assert delete_response.status_code == 404
    assert complete_response.status_code == 404


async def test_list_trash_paginates_with_cursor_and_limit(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    for index in range(3):
        await seed_task(user.uid, title=f"task-{index}", **_trashed(now - timedelta(days=index)))
    headers = {"Authorization": f"Bearer {user.id_token}"}

    first = await client.get("/api/v1/tasks", params={"view": "trash", "limit": 2}, headers=headers)
    second = await client.get(
        "/api/v1/tasks",
        params={"view": "trash", "limit": 2, "cursor": first.json()["next_cursor"]},
        headers=headers,
    )

    assert [item["title"] for item in first.json()["items"]] == ["task-0", "task-1"]
    assert first.json()["next_cursor"] is not None
    assert [item["title"] for item in second.json()["items"]] == ["task-2"]
    assert second.json()["next_cursor"] is None


async def test_list_trash_returns_422_for_limit_out_of_range(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "trash", "limit": 101},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
