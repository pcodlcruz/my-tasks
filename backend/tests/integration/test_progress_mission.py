from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

from tests.integration.progress_helpers import (
    PROGRESS_URL,
    complete,
    get_progress,
    headers,
)

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration

MISSION_URL = f"{PROGRESS_URL}/today/mission"
REVIEW_URL = f"{PROGRESS_URL}/review"
SUNDAY_MORNING = "2026-11-08T10:00:00+01:00"


async def test_a_mission_of_active_tasks_is_saved_and_scores_when_cleared(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    ids = [await seed_task(user.uid, urgent=False) for _ in range(2)]

    response = await client.put(MISSION_URL, json={"task_ids": ids}, headers=headers(user.id_token))
    for task_id in ids:
        await complete(client, user.id_token, task_id)
    progress = await get_progress(client, user.id_token)

    assert response.status_code == 200
    assert response.json()["mission"]["task_ids"] == ids
    assert progress["mission"]["cleared"] is True
    assert progress["arcade"]["score"] == 2 * (100 + 50) + 300
    assert "mission_clear" in [item["kind"] for item in progress["announcements"]]


async def test_an_empty_mission_is_accepted(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")

    response = await client.put(MISSION_URL, json={"task_ids": []}, headers=headers(user.id_token))

    assert response.status_code == 200
    assert response.json()["mission"] == {"task_ids": [], "completed_ids": [], "cleared": False}


async def test_six_tasks_or_repeated_ids_are_rejected(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    ids = [await seed_task(user.uid) for _ in range(6)]

    too_many = await client.put(MISSION_URL, json={"task_ids": ids}, headers=headers(user.id_token))
    repeated = await client.put(
        MISSION_URL, json={"task_ids": [ids[0], ids[0]]}, headers=headers(user.id_token)
    )

    assert too_many.status_code == 422
    assert repeated.status_code == 422


@pytest.mark.parametrize("kind", ["completed", "trashed", "missing", "foreign"])
async def test_a_task_that_is_not_active_or_not_mine_is_rejected_and_nothing_is_saved(
    kind: str,
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
) -> None:
    user = await google_user("ana@example.com")
    other = await google_user("luis@example.com")
    good = await seed_task(user.uid)
    bad = {
        "completed": lambda: seed_task(user.uid, status="completed"),
        "trashed": lambda: seed_task(user.uid, in_trash=True),
        "foreign": lambda: seed_task(other.uid),
    }
    bad_id = "doesNotExist" if kind == "missing" else await bad[kind]()

    response = await client.put(
        MISSION_URL, json={"task_ids": [good, bad_id]}, headers=headers(user.id_token)
    )
    progress = await get_progress(client, user.id_token)

    assert response.status_code == 422
    assert response.json()["code"] == "mission_invalid_task"
    assert progress["mission"]["task_ids"] == []


async def test_the_review_is_marked_seen_once_and_for_every_device(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")

    first = await client.post(REVIEW_URL, headers=headers(user.id_token))
    second = await client.post(REVIEW_URL, headers=headers(user.id_token))
    progress = await get_progress(client, user.id_token)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["show_review"] is False
    assert progress["show_review"] is False


async def test_no_review_on_a_day_that_is_not_active(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    weekdays = await client.patch(
        "/api/v1/me/profile",
        json={"active_weekdays": [1, 2, 3, 4, 5]},
        headers=headers(user.id_token),
    )

    progress = await get_progress(client, user.id_token, SUNDAY_MORNING)

    assert weekdays.status_code == 200
    assert progress["is_active_day"] is False
    assert progress["show_review"] is False


async def test_no_review_when_it_is_turned_off(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    await client.patch(
        "/api/v1/me/profile", json={"morning_review": False}, headers=headers(user.id_token)
    )

    progress = await get_progress(client, user.id_token)

    assert progress["show_review"] is False
