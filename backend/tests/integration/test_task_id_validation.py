from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory

pytestmark = pytest.mark.integration

RESERVED_IDS = ["__x__", "__name__", "__a_b__"]

ROUTES: list[tuple[str, str, dict[str, object] | None]] = [
    ("GET", "", None),
    ("PATCH", "", {"title": "Nuevo"}),
    ("DELETE", "", None),
    ("POST", "/complete", None),
    ("POST", "/reopen", None),
    ("POST", "/trash", None),
    ("POST", "/restore", None),
]


@pytest.mark.parametrize("task_id", RESERVED_IDS)
@pytest.mark.parametrize(("method", "suffix", "body"), ROUTES)
async def test_reserved_firestore_ids_are_treated_as_a_missing_task(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    task_id: str,
    method: str,
    suffix: str,
    body: dict[str, object] | None,
) -> None:
    user = await google_user("owner@example.com")

    response = await client.request(
        method,
        f"/api/v1/tasks/{task_id}{suffix}",
        json=body,
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


@pytest.mark.parametrize("task_id", ["caf%C3%A9", "a b", "a$b", "tarea!"])
async def test_ids_with_characters_firestore_never_generates_are_treated_as_missing(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, task_id: str
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {user.id_token}"}
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_authentication_is_checked_before_the_task_id(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/tasks/__x__")

    assert response.status_code == 401
