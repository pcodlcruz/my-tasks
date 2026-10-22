from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedAccountFactory

pytestmark = pytest.mark.integration

TASK_ID = "some-task-id"
ENDPOINTS = [
    ("GET", "/api/v1/tasks"),
    ("POST", "/api/v1/tasks"),
    ("GET", "/api/v1/tasks/{task_id}"),
    ("PATCH", "/api/v1/tasks/{task_id}"),
    ("DELETE", "/api/v1/tasks/{task_id}"),
    ("POST", "/api/v1/tasks/{task_id}/complete"),
    ("POST", "/api/v1/tasks/{task_id}/reopen"),
    ("POST", "/api/v1/tasks/{task_id}/trash"),
    ("POST", "/api/v1/tasks/{task_id}/restore"),
]


async def _request(
    client: httpx.AsyncClient, method: str, template: str, token: str | None
) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return await client.request(
        method,
        template.format(task_id=TASK_ID),
        params={"view": "board"},
        json={"title": "x"} if method in {"POST", "PATCH"} else None,
        headers=headers,
    )


async def test_every_task_route_is_covered_by_the_enforcement_cases(
    client: httpx.AsyncClient,
) -> None:
    from mytasks_api.main import app

    # The OpenAPI schema lists every operation, however the routers were included.
    routes = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/v1/tasks")
        for method in operations
    }

    assert routes == set(ENDPOINTS)


@pytest.mark.parametrize(("method", "template"), ENDPOINTS)
async def test_task_endpoint_without_token_returns_401(
    client: httpx.AsyncClient, method: str, template: str
) -> None:
    response = await _request(client, method, template, None)

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


@pytest.mark.parametrize(("method", "template"), ENDPOINTS)
async def test_task_endpoint_without_account_returns_403(
    client: httpx.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    method: str,
    template: str,
) -> None:
    stranger = await google_user_without_account("stranger@example.com")

    response = await _request(client, method, template, stranger.id_token)

    assert response.status_code == 403
    assert response.json()["code"] == "access_denied"


@pytest.mark.parametrize(("method", "template"), ENDPOINTS)
async def test_task_endpoint_with_revoked_account_returns_the_same_403(
    client: httpx.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    seed_account: SeedAccountFactory,
    method: str,
    template: str,
) -> None:
    revoked = await google_user_without_account("ana@example.com")
    await seed_account(revoked.uid, "ana@example.com", status="revoked")
    stranger = await google_user_without_account("stranger@example.com")

    revoked_response = await _request(client, method, template, revoked.id_token)
    stranger_response = await _request(client, method, template, stranger.id_token)

    assert revoked_response.status_code == 403
    assert revoked_response.json() == stranger_response.json()


async def test_task_endpoint_answers_401_before_403_for_an_invalid_token(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get(
        "/api/v1/tasks/some-id", headers={"Authorization": "Bearer not-a-real-token"}
    )

    assert response.status_code == 401
