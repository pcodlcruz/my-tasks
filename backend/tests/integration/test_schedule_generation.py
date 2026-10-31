from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

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

    from tests.conftest import GoogleUserFactory, SeedAccountFactory, SeedManyFactory

pytestmark = pytest.mark.integration

SCHEDULES_URL = "/api/v1/schedules"

# 10:00 in Madrid (UTC+1 in November) on each day of the week of 2 November 2026.
MONDAY = "2026-11-02T10:00:00+01:00"
WEDNESDAY = "2026-11-04T10:00:00+01:00"
FRIDAY = "2026-11-06T10:00:00+01:00"


async def create_schedule(
    client: httpx.AsyncClient, token: str, recurrence: dict[str, Any], now: str = MONDAY
) -> str:
    response = await client.post(
        SCHEDULES_URL,
        json={
            "title": "Regar las plantas",
            "description": "Las del balcón",
            "urgent": True,
            "important": True,
            "scope": "personal",
            "recurrence": recurrence,
        },
        headers=headers(token, now),
    )
    assert response.status_code == 201, response.text
    schedule_id: str = response.json()["id"]
    return schedule_id


async def board(client: httpx.AsyncClient, token: str, now: str) -> list[dict[str, Any]]:
    response = await client.get("/api/v1/tasks?view=board", headers=headers(token, now))
    assert response.status_code == 200, response.text
    items: list[dict[str, Any]] = response.json()["items"]
    return items


def generated(tasks: list[dict[str, Any]], schedule_id: str) -> list[dict[str, Any]]:
    return [task for task in tasks if task["schedule_id"] == schedule_id]


async def test_reading_the_progress_generates_the_task_of_the_day(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await create_schedule(client, user.id_token, {"kind": "daily"})

    await get_progress(client, user.id_token, MONDAY)

    tasks = await board(client, user.id_token, MONDAY)
    assert len(tasks) == 1
    task = tasks[0]
    assert task["schedule_id"] == schedule_id
    assert task["scheduled_for"] == "2026-11-02"
    assert task["title"] == "Regar las plantas"
    assert task["quadrant"] == "do_now"
    schedules = await client.get(SCHEDULES_URL, headers=headers(user.id_token, MONDAY))
    assert schedules.json()["items"][0]["next_occurrence"] == "2026-11-03"
    assert schedules.json()["items"][0]["last_generated_for"] == "2026-11-02"


async def test_a_task_not_generated_by_a_schedule_has_both_fields_null(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    created = await client.post(
        "/api/v1/tasks",
        json={
            "title": "Normal",
            "description": "Sin programar",
            "urgent": False,
            "important": False,
            "scope": "work",
        },
        headers=headers(user.id_token, MONDAY),
    )

    assert created.json()["schedule_id"] is None
    assert created.json()["scheduled_for"] is None


async def test_no_duplicate_while_the_previous_one_is_still_active(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await create_schedule(
        client, user.id_token, {"kind": "weekly", "weekdays": [1, 3]}
    )
    await get_progress(client, user.id_token, MONDAY)

    await get_progress(client, user.id_token, WEDNESDAY)

    tasks = generated(await board(client, user.id_token, WEDNESDAY), schedule_id)
    assert [task["scheduled_for"] for task in tasks] == ["2026-11-02"]


async def test_several_days_away_give_a_single_task_for_the_latest_day(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await create_schedule(client, user.id_token, {"kind": "daily"})
    await get_progress(client, user.id_token, MONDAY)
    (monday_task,) = await board(client, user.id_token, MONDAY)
    assert (await complete(client, user.id_token, monday_task["id"], MONDAY)).status_code == 200

    await get_progress(client, user.id_token, FRIDAY)

    tasks = generated(await board(client, user.id_token, FRIDAY), schedule_id)
    assert [task["scheduled_for"] for task in tasks] == ["2026-11-06"]


async def test_two_simultaneous_reads_generate_a_single_task(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    await create_schedule(client, user.id_token, {"kind": "daily"})

    responses = await asyncio.gather(
        *(client.get(PROGRESS_URL, headers=headers(user.id_token, MONDAY)) for _ in range(3))
    )

    assert [response.status_code for response in responses] == [200, 200, 200]
    assert len(await board(client, user.id_token, MONDAY)) == 1


async def test_with_500_active_tasks_a_notice_is_shown_until_confirmed(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_many_tasks: SeedManyFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await create_schedule(client, user.id_token, {"kind": "daily"})
    await seed_many_tasks(user.uid, 500)

    progress = await get_progress(client, user.id_token, MONDAY)

    assert generated(await board(client, user.id_token, MONDAY), schedule_id) == []
    (notice,) = progress["notices"]
    assert notice["kind"] == "schedule_skipped_limit"
    assert notice["schedule_id"] == schedule_id
    assert notice["schedule_title"] == "Regar las plantas"
    assert notice["day"] == "2026-11-02"
    ack = await client.post(
        f"{PROGRESS_URL}/ack",
        json={"notice_ids": [notice["id"]]},
        headers=headers(user.id_token, MONDAY),
    )
    assert ack.status_code == 204
    assert (await get_progress(client, user.id_token, MONDAY))["notices"] == []


async def test_deleting_a_schedule_keeps_the_task_it_generated(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await create_schedule(client, user.id_token, {"kind": "daily"})
    await get_progress(client, user.id_token, MONDAY)

    response = await client.delete(
        f"{SCHEDULES_URL}/{schedule_id}", headers=headers(user.id_token, MONDAY)
    )

    assert response.status_code == 204
    assert len(generated(await board(client, user.id_token, MONDAY), schedule_id)) == 1


async def test_a_revoked_account_generates_nothing_and_on_return_only_the_latest_day(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_account: SeedAccountFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await create_schedule(client, user.id_token, {"kind": "daily"})
    await get_progress(client, user.id_token, MONDAY)
    (monday_task,) = await board(client, user.id_token, MONDAY)
    await complete(client, user.id_token, monday_task["id"], MONDAY)

    await seed_account(user.uid, user.email, status="revoked")
    denied = await client.get(PROGRESS_URL, headers=headers(user.id_token, WEDNESDAY))
    assert denied.status_code == 403
    all_tasks = firestore_client.collection("users").document(user.uid).collection("tasks")
    assert len([snapshot async for snapshot in all_tasks.stream()]) == 1

    await seed_account(user.uid, user.email, status="active")
    await get_progress(client, user.id_token, FRIDAY)

    tasks = generated(await board(client, user.id_token, FRIDAY), schedule_id)
    assert [task["scheduled_for"] for task in tasks] == ["2026-11-06"]
    assert len([snapshot async for snapshot in all_tasks.stream()]) == 2


async def test_completing_a_generated_task_unlocks_the_punctual_achievement(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    await create_schedule(client, user.id_token, {"kind": "daily"})
    await get_progress(client, user.id_token, MONDAY)
    (task,) = await board(client, user.id_token, MONDAY)

    response = await complete(client, user.id_token, task["id"], MONDAY)

    assert response.status_code == 200
    state = await state_document(firestore_client, user.uid)
    assert "scheduled_done" in state["achievements"]
