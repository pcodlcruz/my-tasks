from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

from tests.integration.progress_helpers import (
    PROGRESS_URL,
    TUESDAY,
    WEDNESDAY_MORNING,
    complete,
    day_document,
    get_progress,
    headers,
    state_document,
)

if TYPE_CHECKING:
    from google.cloud import firestore

    from tests.conftest import GoogleUserFactory, SeedAccountFactory, SeedTaskFactory

pytestmark = pytest.mark.integration

ENDPOINTS = (
    ("GET", PROGRESS_URL, None),
    ("POST", f"{PROGRESS_URL}/review", None),
    ("PUT", f"{PROGRESS_URL}/today/mission", {"task_ids": []}),
    ("POST", f"{PROGRESS_URL}/ack", {"announcement_ids": []}),
)


async def test_progress_endpoints_require_a_token(client: httpx.AsyncClient) -> None:
    for method, url, body in ENDPOINTS:
        response = await client.request(method, url, json=body)

        assert response.status_code == 401, url


async def test_progress_endpoints_deny_a_person_without_an_account(
    client: httpx.AsyncClient, google_user_without_account: GoogleUserFactory
) -> None:
    stranger = await google_user_without_account("stranger@example.com")

    for method, url, body in ENDPOINTS:
        response = await client.request(method, url, json=body, headers=headers(stranger.id_token))

        assert response.status_code == 403, url
        assert response.json()["code"] == "access_denied"


async def test_progress_endpoints_deny_a_revoked_account(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_account: SeedAccountFactory
) -> None:
    user = await google_user("revoked@example.com")
    await seed_account(user.uid, user.email, status="revoked")

    for method, url, body in ENDPOINTS:
        response = await client.request(method, url, json=body, headers=headers(user.id_token))

        assert response.status_code == 403, url


async def test_a_new_account_starts_a_new_game(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")

    response = await client.get(PROGRESS_URL, headers=headers(user.id_token))

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    body = response.json()
    assert body["today"] == TUESDAY
    assert body["goal"] == 3
    assert body["completed_count"] == 0
    assert body["goal_met"] is False
    assert body["show_review"] is True
    assert body["streak"] == 0
    assert body["arcade"]["score"] == 0
    assert body["arcade"]["level"] == 1
    assert body["last_day"] is None
    assert body["announcements"] == []


async def test_repeating_the_call_changes_nothing(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")

    first = await get_progress(client, user.id_token)
    stored = await state_document(firestore_client, user.uid)
    second = await get_progress(client, user.id_token)

    assert first == second
    assert await state_document(firestore_client, user.uid) == stored


async def test_the_next_day_closes_the_previous_one(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    for index in range(3):
        task_id = await seed_task(user.uid, title=f"Tarea {index}")
        assert (await complete(client, user.id_token, task_id)).status_code == 200

    wednesday = await get_progress(client, user.id_token, WEDNESDAY_MORNING)

    closed = await day_document(firestore_client, user.uid, TUESDAY)
    assert closed["closed"] is True
    assert closed["completed_count"] == 3
    assert wednesday["completed_count"] == 0
    assert wednesday["streak"] == 1
    assert wednesday["last_day"]["date"] == TUESDAY
    assert wednesday["last_day"]["goal_met"] is True
