from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import httpx
import pytest

from tests.integration.progress_helpers import (
    TUESDAY,
    WEDNESDAY_MORNING,
    complete,
    day_document,
    get_progress,
    headers,
    reopen,
    state_document,
)

if TYPE_CHECKING:
    from google.cloud import firestore

    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration

TASK_FIELDS = {
    "id",
    "title",
    "description",
    "urgent",
    "important",
    "quadrant",
    "scope",
    "pinned",
    "status",
    "in_trash",
    "created_at",
    "updated_at",
    "completed_at",
    "trashed_at",
    "purge_at",
    # Added by the scheduled tasks of feature 007: always present, null on a normal task.
    "schedule_id",
    "scheduled_for",
}


async def test_completing_three_tasks_meets_the_goal_and_scores(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    ids = [await seed_task(user.uid, urgent=False) for _ in range(3)]

    responses = [await complete(client, user.id_token, task_id) for task_id in ids]
    progress = await get_progress(client, user.id_token)

    assert all(response.status_code == 200 for response in responses)
    # The task response only grows by the two schedule fields (contracts/progress.yaml).
    assert set(responses[0].json()) == TASK_FIELDS
    assert progress["completed_count"] == 3
    assert progress["goal_met"] is True
    assert progress["arcade"]["score"] == 3 * 100 + 500
    kinds = [item["kind"] for item in progress["announcements"]]
    assert "phase_clear" in kinds
    assert {
        item["value"] for item in progress["announcements"] if item["kind"] == "achievement"
    } >= {
        "first_coin",
        "stage_clear",
    }


async def test_reopening_the_same_day_undoes_the_completion(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    ids = [await seed_task(user.uid, urgent=False) for _ in range(3)]
    for task_id in ids:
        await complete(client, user.id_token, task_id)

    response = await reopen(client, user.id_token, ids[0])
    progress = await get_progress(client, user.id_token)

    assert response.status_code == 200
    assert progress["completed_count"] == 2
    assert progress["goal_met"] is False
    assert progress["arcade"]["score"] == 200
    assert "phase_clear" not in [item["kind"] for item in progress["announcements"]]


async def test_completing_and_reopening_ten_times_nets_one_completion(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    task_id = await seed_task(user.uid, urgent=False)

    for _ in range(10):
        await complete(client, user.id_token, task_id)
        await reopen(client, user.id_token, task_id)
    await complete(client, user.id_token, task_id)
    progress = await get_progress(client, user.id_token)

    assert progress["completed_count"] == 1
    assert progress["arcade"]["score"] == 100


async def test_reopening_on_a_later_day_keeps_the_closed_day_and_scores_no_twice(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    task_id = await seed_task(user.uid, urgent=False)
    await complete(client, user.id_token, task_id)

    await reopen(client, user.id_token, task_id, WEDNESDAY_MORNING)
    await complete(client, user.id_token, task_id, WEDNESDAY_MORNING)
    wednesday = await get_progress(client, user.id_token, WEDNESDAY_MORNING)

    tuesday = await day_document(firestore_client, user.uid, TUESDAY)
    assert tuesday["completed_count"] == 1
    assert tuesday["closed"] is True
    assert wednesday["completed_count"] == 1
    assert wednesday["arcade"]["score"] == 100


async def test_two_simultaneous_completions_of_the_same_task_count_once(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    task_id = await seed_task(user.uid, urgent=False)

    results = await asyncio.gather(
        complete(client, user.id_token, task_id), complete(client, user.id_token, task_id)
    )

    assert sorted(response.status_code for response in results) == [200, 409]
    state = await state_document(firestore_client, user.uid)
    assert state["score"] == 100
    assert state["tasks_scored"] == 1


async def test_a_task_completed_before_the_feature_reopens_without_subtracting(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
) -> None:
    user = await google_user("ana@example.com")
    task_id = await seed_task(user.uid, status="completed")

    response = await reopen(client, user.id_token, task_id)
    progress = await get_progress(client, user.id_token)

    assert response.status_code == 200
    assert progress["completed_count"] == 0
    assert progress["arcade"]["score"] == 0


async def test_trashing_and_restoring_a_completed_task_changes_no_progress(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    task_id = await seed_task(user.uid, urgent=False)
    await complete(client, user.id_token, task_id)

    trashed = await client.post(f"/api/v1/tasks/{task_id}/trash", headers=headers(user.id_token))
    restored = await client.post(f"/api/v1/tasks/{task_id}/restore", headers=headers(user.id_token))
    progress = await get_progress(client, user.id_token)

    assert trashed.status_code == 200
    assert restored.status_code == 200
    assert progress["completed_count"] == 1
    assert progress["arcade"]["score"] == 100


async def test_emptying_do_now_unlocks_its_achievement(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    task_id = await seed_task(user.uid, urgent=True, important=True)

    await complete(client, user.id_token, task_id)
    progress = await get_progress(client, user.id_token)

    achievements = {
        item["value"] for item in progress["announcements"] if item["kind"] == "achievement"
    }
    assert "do_now_clear" in achievements
