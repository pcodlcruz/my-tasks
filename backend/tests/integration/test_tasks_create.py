from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory

pytestmark = pytest.mark.integration


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "title": "Comprar leche",
        "description": "En el supermercado de la esquina",
        "urgent": True,
        "important": True,
        "scope": "personal",
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize(
    ("urgent", "important", "expected_quadrant"),
    [
        (True, True, "do_now"),
        (False, True, "schedule"),
        (True, False, "delegate"),
        (False, False, "eliminate"),
    ],
)
async def test_create_task_returns_201_with_expected_quadrant(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    urgent: bool,
    important: bool,
    expected_quadrant: str,
) -> None:
    user = await google_user("owner@example.com")

    response = await client.post(
        "/api/v1/tasks",
        json=_payload(urgent=urgent, important=important),
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 201
    assert response.json()["quadrant"] == expected_quadrant


async def test_create_task_without_token_returns_401(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/tasks", json=_payload())

    assert response.status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"title": "   "},
        {"description": "   "},
        {"title": "a" * 201},
        {"description": "a" * 2001},
        {"extra_field": "not allowed"},
    ],
)
async def test_create_task_returns_422_for_invalid_payloads(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, overrides: dict[str, object]
) -> None:
    user = await google_user("owner@example.com")

    response = await client.post(
        "/api/v1/tasks",
        json=_payload(**overrides),
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422


async def test_create_task_without_scope_returns_422(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")
    payload = _payload()
    del payload["scope"]

    response = await client.post(
        "/api/v1/tasks",
        json=payload,
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
