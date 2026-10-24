from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_list_board_returns_only_active_tasks_of_the_authenticated_user(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    owner = await google_user("owner@example.com")
    other = await google_user("other@example.com")
    await seed_task(owner.uid, title="Activa propia")
    await seed_task(owner.uid, title="Completada propia", status="completed")
    await seed_task(owner.uid, title="En papelera propia", in_trash=True)
    await seed_task(other.uid, title="Activa de otro usuario")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board"},
        headers={"Authorization": f"Bearer {owner.id_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [task["title"] for task in body["items"]] == ["Activa propia"]
    assert body["next_cursor"] is None


async def test_list_board_requires_view_query_param(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422


async def test_list_board_orders_pinned_first_then_created_at_ascending(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="Antigua sin fijar", created_at=now - timedelta(minutes=10))
    await seed_task(user.uid, title="Reciente sin fijar", created_at=now)
    await seed_task(
        user.uid, title="Fijada más reciente", pinned=True, created_at=now - timedelta(minutes=1)
    )
    await seed_task(
        user.uid, title="Fijada más antigua", pinned=True, created_at=now - timedelta(minutes=20)
    )

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    titles = [task["title"] for task in response.json()["items"]]
    assert titles == [
        "Fijada más antigua",
        "Fijada más reciente",
        "Antigua sin fijar",
        "Reciente sin fijar",
    ]


async def _board_titles(client: httpx.AsyncClient, token: str, **params: str) -> list[str]:
    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board", **params},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return [task["title"] for task in response.json()["items"]]


async def _seed_ordered_board(user_uid: str, seed_task: SeedTaskFactory) -> None:
    now = datetime.now(UTC)
    await seed_task(user_uid, title="old", created_at=now - timedelta(days=3))
    await seed_task(user_uid, title="mid", created_at=now - timedelta(days=2))
    await seed_task(user_uid, title="new", created_at=now - timedelta(days=1))
    await seed_task(user_uid, title="old-pinned", pinned=True, created_at=now - timedelta(days=5))
    await seed_task(user_uid, title="new-pinned", pinned=True, created_at=now - timedelta(days=4))


async def test_list_board_order_newest_reverses_the_order_and_keeps_pinned_first(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    await _seed_ordered_board(user.uid, seed_task)

    titles = await _board_titles(client, user.id_token, order="newest")

    assert titles == ["new-pinned", "old-pinned", "new", "mid", "old"]


async def test_list_board_order_oldest_matches_the_current_behavior(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    await _seed_ordered_board(user.uid, seed_task)

    explicit = await _board_titles(client, user.id_token, order="oldest")
    default = await _board_titles(client, user.id_token)

    assert explicit == default == ["old-pinned", "new-pinned", "old", "mid", "new"]


async def test_list_board_order_combines_with_the_scope_filter(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    await seed_task(user.uid, title="work-old", scope="work", created_at=now - timedelta(days=2))
    await seed_task(user.uid, title="work-new", scope="work", created_at=now - timedelta(days=1))
    await seed_task(user.uid, title="personal", scope="personal", created_at=now)

    titles = await _board_titles(client, user.id_token, order="newest", scope="work")

    assert titles == ["work-new", "work-old"]


@pytest.mark.parametrize("order", ["", "random", "NEWEST", "asc", "1"])
async def test_list_board_returns_422_for_an_invalid_order(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, order: str
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board", "order": order},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.parametrize("view", ["history", "trash"])
async def test_order_is_ignored_with_a_view_other_than_board(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory, view: str
) -> None:
    user = await google_user("owner@example.com")
    now = datetime.now(UTC)
    for index, title in enumerate(["first", "second"]):
        if view == "history":
            await seed_task(
                user.uid,
                title=title,
                status="completed",
                completed_at=now - timedelta(hours=index),
            )
        else:
            await seed_task(
                user.uid,
                title=title,
                in_trash=True,
                trashed_at=now,
                purge_at=now + timedelta(days=30 - index),
            )
    headers = {"Authorization": f"Bearer {user.id_token}"}

    plain = await client.get("/api/v1/tasks", params={"view": view}, headers=headers)
    with_order = await client.get(
        "/api/v1/tasks", params={"view": view, "order": "newest"}, headers=headers
    )

    assert with_order.status_code == 200
    assert with_order.json() == plain.json()
