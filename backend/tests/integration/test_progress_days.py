from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

from tests.integration.progress_helpers import (
    PROGRESS_URL,
    TUESDAY,
    TUESDAY_MORNING,
    WEDNESDAY_MORNING,
    complete,
    get_progress,
    headers,
)

if TYPE_CHECKING:
    from google.cloud import firestore

    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration

DAYS_URL = f"{PROGRESS_URL}/days"
STATS_URL = f"{PROGRESS_URL}/stats"
# Thursday 5 November 2026, two days after the first activity.
THURSDAY_MORNING = "2026-11-05T10:00:00+01:00"


async def _days(
    client: httpx.AsyncClient, token: str, start: str, end: str, now: str = THURSDAY_MORNING
) -> httpx.Response:
    return await client.get(
        DAYS_URL, params={"from": start, "to": end}, headers=headers(token, now)
    )


async def test_days_come_back_in_ascending_order(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    await complete(client, user.id_token, await seed_task(user.uid, urgent=False))
    await complete(
        client, user.id_token, await seed_task(user.uid, urgent=False), WEDNESDAY_MORNING
    )
    await get_progress(client, user.id_token, THURSDAY_MORNING)  # closes the days left behind

    response = await _days(client, user.id_token, "2026-11-01", "2026-11-05")

    assert response.status_code == 200
    dates = [item["date"] for item in response.json()["items"]]
    assert dates == sorted(dates)
    assert {"2026-11-03", "2026-11-04"} <= set(dates)
    first = next(item for item in response.json()["items"] if item["date"] == TUESDAY)
    assert first["completed_count"] == 1
    assert first["closed"] is True


@pytest.mark.parametrize(
    ("start", "end"),
    [
        ("2026-11-05", "2026-11-01"),  # from > to
        ("2026-01-01", "2026-11-05"),  # more than 84 days
        ("no-es-una-fecha", "2026-11-05"),
        ("2026-11-01", "2026-13-45"),
        ("", ""),
    ],
)
async def test_days_rejects_an_invalid_range_with_422(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, start: str, end: str
) -> None:
    user = await google_user("ana@example.com")

    response = await _days(client, user.id_token, start, end)

    assert response.status_code == 422, response.text


async def test_days_accepts_exactly_84_days(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")

    response = await _days(client, user.id_token, "2026-08-14", "2026-11-05")

    assert response.status_code == 200
    assert response.json() == {"items": []}


async def test_days_requires_both_dates(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")

    response = await client.get(DAYS_URL, params={"from": TUESDAY}, headers=headers(user.id_token))

    assert response.status_code == 422


async def test_day_detail_lists_the_tasks_without_the_trashed_or_the_purged(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    kept = await seed_task(user.uid, urgent=False, title="Se queda")
    trashed = await seed_task(user.uid, urgent=False, title="A la papelera")
    deleted = await seed_task(user.uid, urgent=False, title="Borrada")
    for task_id in (kept, trashed, deleted):
        assert (await complete(client, user.id_token, task_id)).status_code == 200
    await client.post(f"/api/v1/tasks/{trashed}/trash", headers=headers(user.id_token))
    await (
        firestore_client.collection("users")
        .document(user.uid)
        .collection("tasks")
        .document(deleted)
        .delete()
    )

    response = await client.get(f"{DAYS_URL}/{TUESDAY}", headers=headers(user.id_token))

    assert response.status_code == 200
    body = response.json()
    assert [task["id"] for task in body["tasks"]] == [kept]
    assert body["date"] == TUESDAY
    assert body["completed_count"] == 3  # the day keeps its count; only the list is filtered


@pytest.mark.parametrize("day", ["2026-11-20", "2026-13-45", "ayer", "__x__", "2026-1-1"])
async def test_day_detail_answers_404_for_a_missing_day_or_a_bad_shape(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, day: str
) -> None:
    user = await google_user("ana@example.com")

    response = await client.get(f"{DAYS_URL}/{day}", headers=headers(user.id_token))

    assert response.status_code == 404


async def test_stats_return_the_full_catalog_with_the_unlocked_ones(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    await complete(client, user.id_token, await seed_task(user.uid, urgent=False))
    # The best day is settled when the day closes, which the next day's catch-up does.
    await get_progress(client, user.id_token, WEDNESDAY_MORNING)

    response = await client.get(STATS_URL, headers=headers(user.id_token, WEDNESDAY_MORNING))

    assert response.status_code == 200
    body = response.json()
    assert body["best_day_count"] == 1
    assert body["best_day_date"] == TUESDAY
    assert body["tasks_scored"] == 1
    achievements = body["arcade"]["achievements"]
    assert len(achievements) == 12
    unlocked = {item["id"] for item in achievements if item["unlocked_at"] is not None}
    assert "first_coin" in unlocked
    assert "tasks_500" not in unlocked
    assert {"id", "name", "condition", "unlocked_at"} == set(achievements[0])
    assert body["arcade"]["level"] >= 1


async def test_stats_hide_the_arcade_block_when_the_mode_is_off(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    await complete(client, user.id_token, await seed_task(user.uid, urgent=False))
    await client.patch(
        "/api/v1/me/profile", json={"arcade_mode": False}, headers=headers(user.id_token)
    )

    response = await client.get(STATS_URL, headers=headers(user.id_token))

    assert response.status_code == 200
    body = response.json()
    assert body["arcade"] is None
    assert body["tasks_scored"] == 1


async def test_changing_the_goal_does_not_change_the_past_days(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    user = await google_user("ana@example.com")
    await complete(client, user.id_token, await seed_task(user.uid, urgent=False))
    await get_progress(client, user.id_token, WEDNESDAY_MORNING)  # closes Tuesday
    before = await _days(client, user.id_token, TUESDAY, TUESDAY, WEDNESDAY_MORNING)

    await client.patch("/api/v1/me/profile", json={"daily_goal": 9}, headers=headers(user.id_token))
    after = await _days(client, user.id_token, TUESDAY, TUESDAY, WEDNESDAY_MORNING)

    assert before.json()["items"][0]["goal"] != 9
    assert after.json() == before.json()


async def test_each_account_only_reads_its_own_days_and_stats(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    ana = await google_user("ana@example.com")
    luis = await google_user("luis@example.com")
    task = await seed_task(ana.uid, urgent=False, title="Privada de Ana")
    await complete(client, ana.id_token, task)

    luis_days = await _days(client, luis.id_token, "2026-11-01", "2026-11-05")
    luis_detail = await client.get(f"{DAYS_URL}/{TUESDAY}", headers=headers(luis.id_token))
    luis_stats = await client.get(STATS_URL, headers=headers(luis.id_token))

    assert luis_days.json() == {"items": []}
    assert luis_detail.status_code == 404
    assert (
        luis_detail.json()
        == (await client.get(f"{DAYS_URL}/2026-11-20", headers=headers(luis.id_token))).json()
    )
    assert luis_stats.json()["tasks_scored"] == 0
    assert "Privada de Ana" not in luis_days.text + luis_stats.text


@pytest.mark.parametrize("url", [DAYS_URL, f"{DAYS_URL}/{TUESDAY}", STATS_URL])
async def test_the_three_routes_require_an_active_account(
    client: httpx.AsyncClient, google_user_without_account: GoogleUserFactory, url: str
) -> None:
    anonymous = await client.get(url, params={"from": TUESDAY, "to": TUESDAY})
    stranger = await google_user_without_account("nadie@example.com")
    forbidden = await client.get(
        url,
        params={"from": TUESDAY, "to": TUESDAY},
        headers={"Authorization": f"Bearer {stranger.id_token}", "X-Test-Now": TUESDAY_MORNING},
    )

    assert anonymous.status_code == 401
    assert forbidden.status_code == 403
