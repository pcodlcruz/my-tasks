from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

from tests.integration.progress_helpers import (
    PROGRESS_URL,
    complete,
    get_progress,
    headers,
    state_document,
)

if TYPE_CHECKING:
    from google.cloud import firestore

    from tests.conftest import GoogleUserFactory, SeedAccountFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_each_account_only_sees_and_changes_its_own_progress(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    ana = await google_user("ana@example.com")
    luis = await google_user("luis@example.com")
    await complete(client, ana.id_token, await seed_task(ana.uid, urgent=False))
    luis_task = await seed_task(luis.uid)

    ana_progress = await get_progress(client, ana.id_token)
    luis_progress = await get_progress(client, luis.id_token)
    foreign_complete = await complete(client, ana.id_token, luis_task)
    foreign_mission = await client.put(
        f"{PROGRESS_URL}/today/mission",
        json={"task_ids": [luis_task]},
        headers=headers(ana.id_token),
    )
    foreign_ack = await client.post(
        f"{PROGRESS_URL}/ack",
        json={"announcement_ids": [item["id"] for item in ana_progress["announcements"]]},
        headers=headers(luis.id_token),
    )

    assert ana_progress["completed_count"] == 1
    assert luis_progress["completed_count"] == 0
    assert luis_progress["arcade"]["score"] == 0
    assert foreign_complete.status_code == 404
    assert foreign_mission.status_code == 422
    assert foreign_ack.status_code == 204
    assert (await get_progress(client, ana.id_token))["announcements"] == ana_progress[
        "announcements"
    ]


@pytest.mark.parametrize(
    ("method", "url", "body"),
    [
        ("PUT", f"{PROGRESS_URL}/today/mission", {"task_ids": [], "score": 9999}),
        ("PUT", f"{PROGRESS_URL}/today/mission", {"task_ids": [], "uid": "someone"}),
        ("POST", f"{PROGRESS_URL}/ack", {"announcement_ids": [], "streak": 99}),
        ("PATCH", "/api/v1/me/profile", {"level": 10}),
        ("PATCH", "/api/v1/me/profile", {"achievements": ["streak_30"]}),
    ],
)
async def test_no_endpoint_accepts_game_values_or_another_uid(
    method: str,
    url: str,
    body: dict[str, object],
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
) -> None:
    user = await google_user("ana@example.com")

    response = await client.request(method, url, json=body, headers=headers(user.id_token))

    assert response.status_code == 422


async def test_a_revoked_account_keeps_its_progress_for_when_it_comes_back(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_account: SeedAccountFactory,
    seed_task: SeedTaskFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    await complete(client, user.id_token, await seed_task(user.uid, urgent=False))

    await seed_account(user.uid, user.email, status="revoked")
    denied = await client.get(PROGRESS_URL, headers=headers(user.id_token))
    await seed_account(user.uid, user.email, status="active")
    back = await get_progress(client, user.id_token)

    assert denied.status_code == 403
    assert (await state_document(firestore_client, user.uid))["score"] == 100
    assert back["completed_count"] == 1
