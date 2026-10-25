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


async def _seed_history_by_age(user_uid: str, seed_task: SeedTaskFactory) -> None:
    now = datetime.now(UTC)
    for title, days in [
        ("today", 0),
        ("d20", 20),
        ("d29", 29),
        ("d45", 45),
        ("d89", 89),
        ("d120", 120),
    ]:
        await seed_task(
            user_uid,
            title=title,
            status="completed",
            completed_at=now - timedelta(days=days, hours=1) if days else now,
        )


async def _history_titles(client: httpx.AsyncClient, token: str, **params: object) -> list[str]:
    response = await client.get(
        "/api/v1/tasks",
        params={"view": "history", **params},  # type: ignore[arg-type]
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return [item["title"] for item in response.json()["items"]]


async def test_list_history_within_30_days_excludes_older_tasks(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    await _seed_history_by_age(user.uid, seed_task)

    assert await _history_titles(client, user.id_token, within_days=30) == [
        "today",
        "d20",
        "d29",
    ]


async def test_list_history_within_90_days_excludes_older_tasks(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    await _seed_history_by_age(user.uid, seed_task)

    assert await _history_titles(client, user.id_token, within_days=90) == [
        "today",
        "d20",
        "d29",
        "d45",
        "d89",
    ]


async def test_list_history_without_within_days_returns_everything(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    await _seed_history_by_age(user.uid, seed_task)

    assert len(await _history_titles(client, user.id_token)) == 6


async def test_list_history_cursor_pagination_keeps_working_with_within_days(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    for index in range(5):
        await seed_task(
            user.uid,
            title=f"recent-{index}",
            status="completed",
            completed_at=now - timedelta(days=index),
        )
    await seed_task(
        user.uid, title="old", status="completed", completed_at=now - timedelta(days=40)
    )
    headers = {"Authorization": f"Bearer {user.id_token}"}

    pages: list[list[str]] = []
    cursor: str | None = None
    while True:
        params: dict[str, object] = {"view": "history", "within_days": 30, "limit": 2}
        if cursor:
            params["cursor"] = cursor
        response = await client.get("/api/v1/tasks", params=params, headers=headers)  # type: ignore[arg-type]
        assert response.status_code == 200
        pages.append([item["title"] for item in response.json()["items"]])
        cursor = response.json()["next_cursor"]
        if cursor is None:
            break

    assert pages == [["recent-0", "recent-1"], ["recent-2", "recent-3"], ["recent-4"]]


@pytest.mark.parametrize("within_days", ["", "0", "7", "31", "91", "-30", "abc", "30.5"])
async def test_list_history_returns_422_for_an_invalid_within_days(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, within_days: str
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "history", "within_days": within_days},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_within_days_is_ignored_with_a_view_other_than_history(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="board-task", created_at=now - timedelta(days=200))
    headers = {"Authorization": f"Bearer {user.id_token}"}

    response = await client.get(
        "/api/v1/tasks", params={"view": "board", "within_days": 30}, headers=headers
    )

    assert response.status_code == 200
    assert [item["title"] for item in response.json()["items"]] == ["board-task"]


def test_the_history_query_is_covered_by_the_existing_firestore_index() -> None:
    # The emulator does not enforce indexes, so this guards what production would require:
    # `within_days` adds a range on `completed_at`, the field the existing index already orders.
    import json
    from pathlib import Path

    indexes = json.loads(
        (Path(__file__).resolve().parents[3] / "firestore.indexes.json").read_text(encoding="utf-8")
    )["indexes"]

    assert any(
        [field["fieldPath"] for field in index["fields"]][:3]
        == ["status", "in_trash", "completed_at"]
        for index in indexes
    )
