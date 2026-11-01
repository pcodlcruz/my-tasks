from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

from tests.integration.progress_helpers import (
    PROGRESS_URL,
    complete,
    get_progress,
    headers,
    reopen,
)

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration

ACK_URL = f"{PROGRESS_URL}/ack"


async def test_acknowledging_removes_the_given_announcements(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    await complete(client, user.id_token, await seed_task(user.uid, urgent=False))
    before = await get_progress(client, user.id_token)
    ids = [item["id"] for item in before["announcements"]]

    response = await client.post(
        ACK_URL, json={"announcement_ids": [*ids, "unknown"]}, headers=headers(user.id_token)
    )
    after = await get_progress(client, user.id_token)

    assert ids
    assert response.status_code == 204
    assert after["announcements"] == []


@pytest.mark.parametrize(
    "body",
    [{}, {"announcement_ids": [f"a{i}" for i in range(21)]}, {"announcement_ids": [""]}, {"x": 1}],
)
async def test_an_empty_oversized_or_unknown_body_is_rejected(
    body: dict[str, object], client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")

    response = await client.post(ACK_URL, json=body, headers=headers(user.id_token))

    assert response.status_code == 422


async def test_an_acknowledged_phase_clear_does_not_come_back_the_same_day(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    ids = [await seed_task(user.uid, urgent=False) for _ in range(3)]
    for task_id in ids:
        await complete(client, user.id_token, task_id)
    shown = await get_progress(client, user.id_token)
    await client.post(
        ACK_URL,
        json={"announcement_ids": [item["id"] for item in shown["announcements"]]},
        headers=headers(user.id_token),
    )

    await reopen(client, user.id_token, ids[2])
    await complete(client, user.id_token, ids[2])
    progress = await get_progress(client, user.id_token)

    kinds = [item["kind"] for item in progress["announcements"]]
    assert progress["goal_met"] is True
    assert progress["arcade"]["score"] == 3 * 100 + 500  # the bonus is won back...
    assert "phase_clear" not in kinds  # ...but, already seen, it is not celebrated again


async def test_closing_a_third_day_in_a_row_announces_the_streak_achievement(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    await client.patch("/api/v1/me/profile", json={"daily_goal": 1}, headers=headers(user.id_token))
    for day in ("2026-11-03", "2026-11-04", "2026-11-05"):
        task_id = await seed_task(user.uid, urgent=False)
        await complete(client, user.id_token, task_id, f"{day}T10:00:00+01:00")

    progress = await get_progress(client, user.id_token, "2026-11-06T10:00:00+01:00")

    assert progress["streak"] == 3
    achievements = {
        item["value"] for item in progress["announcements"] if item["kind"] == "achievement"
    }
    assert "streak_3" in achievements
