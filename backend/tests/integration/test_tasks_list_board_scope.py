from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_list_board_filters_by_scope(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    await seed_task(user.uid, title="Laboral", scope="work")
    await seed_task(user.uid, title="Personal", scope="personal")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board", "scope": "work"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    assert [task["title"] for task in response.json()["items"]] == ["Laboral"]


async def test_list_board_without_scope_returns_all(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("owner@example.com")
    await seed_task(user.uid, title="Laboral", scope="work")
    await seed_task(user.uid, title="Personal", scope="personal")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    titles = {task["title"] for task in response.json()["items"]}
    assert titles == {"Laboral", "Personal"}


async def test_list_board_returns_422_for_invalid_scope(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board", "scope": "not-a-scope"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
