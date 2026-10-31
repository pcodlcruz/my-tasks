from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import httpx
import pytest

from tests.integration.progress_helpers import TUESDAY_MORNING, headers

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedAccountFactory

pytestmark = pytest.mark.integration

SCHEDULES_URL = "/api/v1/schedules"

# Tuesday 3 November 2026 in Madrid: Monday the 2nd is in the past, Wednesday the 4th is next.
VALID: dict[str, Any] = {
    "title": "Regar las plantas",
    "description": "Las del balcón",
    "urgent": False,
    "important": True,
    "scope": "personal",
    "recurrence": {"kind": "weekly", "weekdays": [1, 3]},
}


def body(**overrides: Any) -> dict[str, Any]:
    return {**VALID, **overrides}


async def create(
    client: httpx.AsyncClient, token: str, payload: dict[str, Any] | None = None
) -> httpx.Response:
    return await client.post(SCHEDULES_URL, json=payload or VALID, headers=headers(token))


async def created_id(
    client: httpx.AsyncClient, token: str, now: str = TUESDAY_MORNING, **overrides: Any
) -> str:
    response = await client.post(SCHEDULES_URL, json=body(**overrides), headers=headers(token, now))
    assert response.status_code == 201, response.text
    schedule_id: str = response.json()["id"]
    return schedule_id


ENDPOINTS = (
    ("GET", SCHEDULES_URL, None),
    ("POST", SCHEDULES_URL, VALID),
    ("PATCH", f"{SCHEDULES_URL}/abc", {"title": "x"}),
    ("DELETE", f"{SCHEDULES_URL}/abc", None),
    ("POST", f"{SCHEDULES_URL}/abc/pause", None),
    ("POST", f"{SCHEDULES_URL}/abc/resume", None),
)


async def test_schedule_endpoints_require_a_token(client: httpx.AsyncClient) -> None:
    for method, url, payload in ENDPOINTS:
        response = await client.request(method, url, json=payload)

        assert response.status_code == 401, (method, url)


async def test_schedule_endpoints_deny_a_person_without_an_account(
    client: httpx.AsyncClient, google_user_without_account: GoogleUserFactory
) -> None:
    stranger = await google_user_without_account("stranger@example.com")

    for method, url, payload in ENDPOINTS:
        response = await client.request(
            method, url, json=payload, headers=headers(stranger.id_token)
        )

        assert response.status_code == 403, (method, url)
        assert response.json()["code"] == "access_denied"


async def test_schedule_endpoints_deny_a_revoked_account(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_account: SeedAccountFactory
) -> None:
    user = await google_user("revoked@example.com")
    await seed_account(user.uid, user.email, status="revoked")

    for method, url, payload in ENDPOINTS:
        response = await client.request(method, url, json=payload, headers=headers(user.id_token))

        assert response.status_code == 403, (method, url)


@pytest.mark.parametrize(
    ("recurrence", "next_occurrence"),
    [
        ({"kind": "once", "date": "2026-11-05"}, "2026-11-05"),
        ({"kind": "once", "date": "2026-11-03"}, "2026-11-03"),
        ({"kind": "daily"}, "2026-11-03"),
        ({"kind": "weekly", "weekdays": [1, 3]}, "2026-11-04"),
        ({"kind": "monthly", "month_day": 31}, "2026-11-30"),
    ],
)
async def test_create_returns_201_with_each_kind_of_repetition(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    recurrence: dict[str, Any],
    next_occurrence: str,
) -> None:
    user = await google_user("ana@example.com")

    response = await create(client, user.id_token, body(recurrence=recurrence))

    assert response.status_code == 201, response.text
    out = response.json()
    assert out["recurrence"] == recurrence
    assert out["status"] == "active"
    assert out["next_occurrence"] == next_occurrence
    assert out["quadrant"] == "schedule"
    assert out["last_generated_for"] is None
    assert set(out) == {
        "id",
        "title",
        "description",
        "urgent",
        "important",
        "scope",
        "quadrant",
        "recurrence",
        "status",
        "next_occurrence",
        "last_generated_for",
        "created_at",
    }


@pytest.mark.parametrize(
    "overrides",
    [
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"description": " "},
        {"description": "x" * 2001},
        {"scope": "otro"},
        {"urgent": "sí"},
        {"recurrence": {"kind": "yearly"}},
        {"recurrence": {"kind": "weekly", "weekdays": []}},
        {"recurrence": {"kind": "weekly", "weekdays": [1, 1]}},
        {"recurrence": {"kind": "weekly", "weekdays": [0]}},
        {"recurrence": {"kind": "weekly", "weekdays": [8]}},
        {"recurrence": {"kind": "monthly", "month_day": 0}},
        {"recurrence": {"kind": "monthly", "month_day": 32}},
        {"recurrence": {"kind": "monthly", "month_day": "5"}},
        {"recurrence": {"kind": "once", "date": "2026-11-02"}},
        {"recurrence": {"kind": "once", "date": "no es una fecha"}},
        {"recurrence": {"kind": "once"}},
        {"recurrence": {"kind": "daily", "weekdays": [1]}},
        {"pinned": True},
    ],
)
async def test_create_rejects_invalid_input_with_422(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, overrides: dict[str, Any]
) -> None:
    user = await google_user("ana@example.com")

    response = await create(client, user.id_token, body(**overrides))

    assert response.status_code == 422, (overrides, response.text)
    assert response.json()["code"] == "validation_error"


async def test_the_51st_schedule_is_refused_with_409(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    for index in range(50):
        await created_id(client, user.id_token, title=f"Programada {index}")

    response = await create(client, user.id_token)

    assert response.status_code == 409
    assert response.json()["code"] == "schedule_limit"
    listed = await client.get(SCHEDULES_URL, headers=headers(user.id_token))
    assert len(listed.json()["items"]) == 50


async def test_parallel_creations_never_walk_past_the_limit(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    for index in range(48):
        await created_id(client, user.id_token, title=f"Programada {index}")

    responses = await asyncio.gather(*(create(client, user.id_token) for _ in range(6)))

    assert sorted(response.status_code for response in responses).count(201) == 2
    listed = await client.get(SCHEDULES_URL, headers=headers(user.id_token))
    assert len(listed.json()["items"]) == 50


async def test_list_returns_the_schedules_in_creation_order(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    # The clock is fixed by the header, so two creations at one instant would tie.
    first = await created_id(client, user.id_token, "2026-11-03T10:00:00+01:00", title="Primera")
    second = await created_id(client, user.id_token, "2026-11-03T10:05:00+01:00", title="Segunda")

    response = await client.get(SCHEDULES_URL, headers=headers(user.id_token))

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [first, second]


async def test_patch_changes_the_data_and_recalculates_the_next_occurrence(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await created_id(client, user.id_token)

    response = await client.patch(
        f"{SCHEDULES_URL}/{schedule_id}",
        json={"title": "  Regar  ", "recurrence": {"kind": "daily"}},
        headers=headers(user.id_token),
    )

    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Regar"
    assert response.json()["next_occurrence"] == "2026-11-03"


@pytest.mark.parametrize(
    "payload",
    [{}, {"title": None}, {"recurrence": None}, {"status": "paused"}, {"next_occurrence": "x"}],
)
async def test_patch_rejects_an_empty_or_invalid_change(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, payload: dict[str, Any]
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await created_id(client, user.id_token)

    response = await client.patch(
        f"{SCHEDULES_URL}/{schedule_id}", json=payload, headers=headers(user.id_token)
    )

    assert response.status_code == 422, payload


async def test_pause_and_resume_are_idempotent(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await created_id(client, user.id_token)
    url = f"{SCHEDULES_URL}/{schedule_id}"

    for _ in range(2):
        paused = await client.post(f"{url}/pause", headers=headers(user.id_token))
        assert paused.status_code == 200
        assert paused.json()["status"] == "paused"
        assert paused.json()["next_occurrence"] is None
    for _ in range(2):
        resumed = await client.post(f"{url}/resume", headers=headers(user.id_token))
        assert resumed.status_code == 200
        assert resumed.json()["status"] == "active"
        assert resumed.json()["next_occurrence"] == "2026-11-04"


async def test_delete_removes_it(client: httpx.AsyncClient, google_user: GoogleUserFactory) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await created_id(client, user.id_token)

    response = await client.delete(f"{SCHEDULES_URL}/{schedule_id}", headers=headers(user.id_token))
    again = await client.delete(f"{SCHEDULES_URL}/{schedule_id}", headers=headers(user.id_token))

    assert response.status_code == 204
    assert again.status_code == 404
    listed = await client.get(SCHEDULES_URL, headers=headers(user.id_token))
    assert listed.json()["items"] == []


async def test_a_finished_schedule_cannot_be_edited_paused_or_resumed(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await created_id(
        client, user.id_token, recurrence={"kind": "once", "date": "2026-11-03"}
    )
    # Generating today's one-off task finishes it.
    progress = await client.get("/api/v1/me/progress", headers=headers(user.id_token))
    assert progress.status_code == 200
    url = f"{SCHEDULES_URL}/{schedule_id}"

    for method, path, payload in (
        ("PATCH", url, {"title": "Otra"}),
        ("POST", f"{url}/pause", None),
        ("POST", f"{url}/resume", None),
    ):
        response = await client.request(method, path, json=payload, headers=headers(user.id_token))

        assert response.status_code == 409, (method, path)
        assert response.json()["code"] == "schedule_finished"


async def test_resuming_a_one_off_whose_date_went_by_is_refused(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    schedule_id = await created_id(
        client, user.id_token, recurrence={"kind": "once", "date": "2026-11-04"}
    )
    url = f"{SCHEDULES_URL}/{schedule_id}"
    await client.post(f"{url}/pause", headers=headers(user.id_token))

    response = await client.post(
        f"{url}/resume", headers=headers(user.id_token, "2026-11-06T10:00:00+01:00")
    )

    assert response.status_code == 409
    assert response.json()["code"] == "schedule_finished"


@pytest.mark.parametrize("schedule_id", ["__name__", "id con espacios", "ñandú"])
async def test_an_id_of_an_impossible_shape_is_not_found(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, schedule_id: str
) -> None:
    user = await google_user("ana@example.com")

    response = await client.post(
        f"{SCHEDULES_URL}/{schedule_id}/pause", headers=headers(user.id_token)
    )

    assert response.status_code == 404
