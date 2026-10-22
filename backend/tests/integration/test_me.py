from __future__ import annotations

import asyncio
from collections.abc import Iterator
from typing import TYPE_CHECKING

import httpx
import pytest
from google.cloud import firestore

from mytasks_api.config import get_settings

if TYPE_CHECKING:
    from tests.conftest import (
        GoogleUserFactory,
        SeedAccountFactory,
        SeedInvitationFactory,
        SeedTaskFactory,
    )

pytestmark = pytest.mark.integration

BOOTSTRAP_EMAIL = "owner@example.com"


@pytest.fixture
def bootstrap_admin() -> Iterator[None]:
    from mytasks_api.main import app

    base = get_settings()
    app.dependency_overrides[get_settings] = lambda: base.model_copy(
        update={"bootstrap_admin_email": BOOTSTRAP_EMAIL}
    )
    yield
    app.dependency_overrides.pop(get_settings, None)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _count(client: firestore.AsyncClient, collection: str) -> int:
    return len([doc async for doc in client.collection(collection).stream()])


async def test_me_without_token_returns_401(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_me_for_a_stranger_returns_403_and_creates_nothing(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    await seed_invitation("someone-else@example.com")
    stranger = await google_user_without_account("stranger@example.com")

    response = await client.get("/api/v1/me", headers=_auth(stranger.id_token))

    assert response.status_code == 403
    assert response.json()["code"] == "access_denied"
    assert await _count(firestore_client, "users") == 0
    invitation = (
        await firestore_client.collection("invitations").document("someone-else@example.com").get()
    )
    assert (invitation.to_dict() or {})["status"] == "pending"


async def test_me_accepts_a_pending_invitation_and_returns_the_user_role(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    await seed_invitation("ana@example.com")
    ana = await google_user_without_account("Ana@Example.com")

    response = await client.get("/api/v1/me", headers=_auth(ana.id_token))

    assert response.status_code == 200
    assert response.json() == {"uid": ana.uid, "email": "ana@example.com", "role": "user"}
    invitation = (
        await firestore_client.collection("invitations").document("ana@example.com").get()
    ).to_dict() or {}
    assert invitation["status"] == "accepted"
    assert invitation["accepted_uid"] == ana.uid
    account = (await firestore_client.collection("users").document(ana.uid).get()).to_dict() or {}
    assert account["role"] == "user"
    assert account["status"] == "active"


async def test_me_called_twice_does_not_create_a_second_account(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    await seed_invitation("ana@example.com")
    ana = await google_user_without_account("ana@example.com")

    first = await client.get("/api/v1/me", headers=_auth(ana.id_token))
    second = await client.get("/api/v1/me", headers=_auth(ana.id_token))

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert await _count(firestore_client, "users") == 1


async def test_me_called_concurrently_accepts_the_invitation_once(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    seed_invitation: SeedInvitationFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await seed_invitation("ana@example.com")
    ana = await google_user_without_account("ana@example.com")

    responses = await asyncio.gather(
        *(client.get("/api/v1/me", headers=_auth(ana.id_token)) for _ in range(5))
    )

    assert [response.status_code for response in responses] == [200] * 5
    assert await _count(firestore_client, "users") == 1
    accepted = [r for r in caplog.records if r.getMessage() == "invitation_accepted"]
    assert len(accepted) == 1


async def test_me_denies_an_invitation_that_was_already_accepted_by_another_account(
    client: httpx.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    await seed_invitation("ana@example.com", status="accepted")
    ana = await google_user_without_account("ana@example.com")

    response = await client.get("/api/v1/me", headers=_auth(ana.id_token))

    assert response.status_code == 403


async def test_me_for_the_bootstrap_email_creates_an_admin_and_keeps_existing_tasks(
    client: httpx.AsyncClient,
    bootstrap_admin: None,
    google_user_without_account: GoogleUserFactory,
    seed_task: SeedTaskFactory,
) -> None:
    owner = await google_user_without_account(BOOTSTRAP_EMAIL)
    task_id = await seed_task(owner.uid, title="Tarea previa")

    me = await client.get("/api/v1/me", headers=_auth(owner.id_token))
    tasks = await client.get(
        "/api/v1/tasks", params={"view": "board"}, headers=_auth(owner.id_token)
    )

    assert me.status_code == 200
    assert me.json()["role"] == "admin"
    assert [item["id"] for item in tasks.json()["items"]] == [task_id]


async def test_me_does_not_bootstrap_an_unverified_email(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    bootstrap_admin: None,
    google_user_without_account: GoogleUserFactory,
) -> None:
    impostor = await google_user_without_account(BOOTSTRAP_EMAIL, email_verified=False)

    response = await client.get("/api/v1/me", headers=_auth(impostor.id_token))

    assert response.status_code == 403
    assert await _count(firestore_client, "users") == 0


async def test_me_for_a_revoked_account_returns_the_same_403_as_for_a_stranger(
    client: httpx.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    seed_account: SeedAccountFactory,
) -> None:
    revoked = await google_user_without_account("ana@example.com")
    await seed_account(revoked.uid, "ana@example.com", status="revoked")
    stranger = await google_user_without_account("stranger@example.com")

    revoked_response = await client.get("/api/v1/me", headers=_auth(revoked.id_token))
    stranger_response = await client.get("/api/v1/me", headers=_auth(stranger.id_token))

    assert revoked_response.status_code == stranger_response.status_code == 403
    assert revoked_response.json() == stranger_response.json()


async def test_bootstrap_does_not_demote_or_replace_an_existing_account(
    client: httpx.AsyncClient,
    bootstrap_admin: None,
    google_user_without_account: GoogleUserFactory,
    seed_account: SeedAccountFactory,
) -> None:
    owner = await google_user_without_account(BOOTSTRAP_EMAIL)
    await seed_account(owner.uid, BOOTSTRAP_EMAIL, role="user")

    response = await client.get("/api/v1/me", headers=_auth(owner.id_token))

    assert response.status_code == 200
    assert response.json()["role"] == "user"
