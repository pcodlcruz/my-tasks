from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory

pytestmark = pytest.mark.integration


async def test_get_task_without_authorization_header_returns_401(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/api/v1/tasks/some-id")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_get_task_with_malformed_token_returns_401(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/api/v1/tasks/some-id",
        headers={"Authorization": "Bearer not-a-real-token"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_get_task_with_tampered_token_returns_401(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")
    tampered_token = user.id_token[:-1] + ("a" if user.id_token[-1] != "a" else "b")

    response = await client.get(
        "/api/v1/tasks/some-id",
        headers={"Authorization": f"Bearer {tampered_token}"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_get_task_with_valid_token_is_not_unauthorized(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(
        "/api/v1/tasks/does-not-exist",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code != 401
