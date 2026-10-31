"""Shared helpers of the progress integration tests (feature 007)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import httpx
    from google.cloud import firestore

PROGRESS_URL = "/api/v1/me/progress"

# Tuesday 3 November 2026 at 10:00 in Madrid (UTC+1): progress day "2026-11-03".
TUESDAY_MORNING = "2026-11-03T10:00:00+01:00"
WEDNESDAY_MORNING = "2026-11-04T10:00:00+01:00"
TUESDAY = "2026-11-03"


def headers(token: str, now: str = TUESDAY_MORNING) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "X-Test-Now": now}


async def get_progress(
    client: httpx.AsyncClient, token: str, now: str = TUESDAY_MORNING
) -> dict[str, Any]:
    response = await client.get(PROGRESS_URL, headers=headers(token, now))
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def complete(
    client: httpx.AsyncClient, token: str, task_id: str, now: str = TUESDAY_MORNING
) -> httpx.Response:
    return await client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers(token, now))


async def reopen(
    client: httpx.AsyncClient, token: str, task_id: str, now: str = TUESDAY_MORNING
) -> httpx.Response:
    return await client.post(f"/api/v1/tasks/{task_id}/reopen", headers=headers(token, now))


async def state_document(firestore_client: firestore.AsyncClient, uid: str) -> dict[str, Any]:
    snapshot = await (
        firestore_client.collection("users")
        .document(uid)
        .collection("progress")
        .document("state")
        .get()
    )
    return snapshot.to_dict() or {}


async def day_document(
    firestore_client: firestore.AsyncClient, uid: str, day: str
) -> dict[str, Any]:
    snapshot = await (
        firestore_client.collection("users")
        .document(uid)
        .collection("progress_days")
        .document(day)
        .get()
    )
    return snapshot.to_dict() or {}
