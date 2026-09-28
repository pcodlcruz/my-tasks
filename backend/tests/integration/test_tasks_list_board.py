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
