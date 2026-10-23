from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import httpx
import pytest
from google.cloud import firestore

if TYPE_CHECKING:
    from tests.conftest import (
        AdminUserFactory,
        GoogleUserFactory,
        SeedAccountFactory,
        SeedInvitationFactory,
        SeedTaskFactory,
    )

pytestmark = pytest.mark.integration

URL = "/api/v1/admin/invitations"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _invitation(client: firestore.AsyncClient, email: str) -> dict[str, object]:
    snapshot = await client.collection("invitations").document(email).get()
    return snapshot.to_dict() or {}


async def test_invite_creates_a_pending_invitation_and_reports_it(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
) -> None:
    admin = await admin_user()

    response = await client.post(
        URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 201
    assert response.json() == {"outcome": "invited", "email": "ana@example.com"}
    stored = await _invitation(firestore_client, "ana@example.com")
    assert stored["status"] == "pending"
    assert stored["invited_by"] == admin.uid


async def test_invite_normalizes_case_and_spaces(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
) -> None:
    admin = await admin_user()

    response = await client.post(
        URL, json={"email": "  Ana@Example.COM "}, headers=_auth(admin.id_token)
    )

    assert response.json()["email"] == "ana@example.com"
    assert (await _invitation(firestore_client, "ana@example.com"))["status"] == "pending"


async def test_invite_twice_returns_200_and_keeps_a_single_invitation(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
) -> None:
    admin = await admin_user()
    first = await client.post(URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token))
    created_at = (await _invitation(firestore_client, "ana@example.com"))["created_at"]

    second = await client.post(
        URL, json={"email": "ANA@example.com"}, headers=_auth(admin.id_token)
    )

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json() == {"outcome": "already_pending", "email": "ana@example.com"}
    assert (await _invitation(firestore_client, "ana@example.com"))["created_at"] == created_at


async def test_invite_the_same_address_twice_at_once_creates_it_once(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
) -> None:
    # A double click or two administrators inviting the same address together. Firestore
    # transactions lock what they read, so more simultaneous ones than that only measure the
    # emulator's lock timeout, not the behavior.
    admin = await admin_user()

    responses = await asyncio.gather(
        client.post(URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token)),
        client.post(URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token)),
    )

    assert sorted(response.status_code for response in responses) == [200, 201]
    documents = [doc async for doc in firestore_client.collection("invitations").stream()]
    assert len(documents) == 1


async def test_invite_an_address_that_already_has_an_active_account_returns_409(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user: GoogleUserFactory,
) -> None:
    admin = await admin_user()
    await google_user("ana@example.com")

    response = await client.post(
        URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 409
    assert response.json()["code"] == "already_active"


async def test_invite_a_revoked_account_reactivates_it_and_keeps_its_tasks(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    google_user_without_account: GoogleUserFactory,
    seed_account: SeedAccountFactory,
    seed_task: SeedTaskFactory,
) -> None:
    admin = await admin_user()
    ana = await google_user_without_account("ana@example.com")
    await seed_account(ana.uid, "ana@example.com", status="revoked")
    task_id = await seed_task(ana.uid, title="Sigue aquí")

    response = await client.post(
        URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token)
    )
    tasks = await client.get("/api/v1/tasks", params={"view": "board"}, headers=_auth(ana.id_token))

    assert response.status_code == 201
    assert response.json() == {"outcome": "reactivated", "email": "ana@example.com"}
    assert [item["id"] for item in tasks.json()["items"]] == [task_id]
    account = (await firestore_client.collection("users").document(ana.uid).get()).to_dict() or {}
    assert account["status"] == "active"
    assert account["role"] == "user"
    assert account["revoked_at"] is None
    assert (await _invitation(firestore_client, "ana@example.com")) == {}


async def test_invite_again_after_the_invitation_was_revoked_makes_it_pending(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await seed_invitation("ana@example.com", status="revoked", invited_by="someone-else")

    response = await client.post(
        URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 201
    stored = await _invitation(firestore_client, "ana@example.com")
    assert stored["status"] == "pending"
    assert stored["invited_by"] == admin.uid


async def test_an_invited_person_can_then_sign_in_and_gets_the_user_role(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user_without_account: GoogleUserFactory,
) -> None:
    admin = await admin_user()
    await client.post(URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token))
    ana = await google_user_without_account("ana@example.com")

    me = await client.get("/api/v1/me", headers=_auth(ana.id_token))

    assert me.status_code == 200
    assert me.json()["role"] == "user"


async def _pending_count(firestore_client: firestore.AsyncClient) -> int:
    documents = firestore_client.collection("invitations").stream()
    return len([d async for d in documents if (d.to_dict() or {})["status"] == "pending"])


async def _seed_pending(seed_invitation: SeedInvitationFactory, count: int) -> None:
    for index in range(count):
        await seed_invitation(f"seed{index}@example.com")


async def test_invite_beyond_50_pending_returns_409_and_creates_nothing(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await _seed_pending(seed_invitation, 50)

    response = await client.post(
        URL, json={"email": "extra@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 409
    assert response.json()["code"] == "invitation_limit_reached"
    assert await _invitation(firestore_client, "extra@example.com") == {}
    assert await _pending_count(firestore_client) == 50


async def test_the_50th_pending_invitation_is_accepted(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await _seed_pending(seed_invitation, 49)

    response = await client.post(
        URL, json={"email": "last@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 201
    assert await _pending_count(firestore_client) == 50


async def test_inviting_an_already_pending_address_at_the_limit_returns_200(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await _seed_pending(seed_invitation, 50)

    response = await client.post(
        URL, json={"email": "seed0@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 200
    assert response.json()["outcome"] == "already_pending"


async def test_only_pending_invitations_count_towards_the_limit(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await _seed_pending(seed_invitation, 49)
    for index in range(10):
        await seed_invitation(f"done{index}@example.com", status="accepted")
        await seed_invitation(f"gone{index}@example.com", status="revoked")

    response = await client.post(
        URL, json={"email": "new@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 201


async def test_revoking_an_invitation_at_the_limit_frees_a_slot(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await _seed_pending(seed_invitation, 50)
    revoked = await client.delete(f"{URL}/seed0@example.com", headers=_auth(admin.id_token))

    response = await client.post(
        URL, json={"email": "new@example.com"}, headers=_auth(admin.id_token)
    )

    assert revoked.status_code == 204
    assert response.status_code == 201


async def test_reactivating_an_account_at_the_limit_is_not_refused(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user_without_account: GoogleUserFactory,
    seed_account: SeedAccountFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    ana = await google_user_without_account("ana@example.com")
    await seed_account(ana.uid, "ana@example.com", status="revoked")
    await _seed_pending(seed_invitation, 50)

    response = await client.post(
        URL, json={"email": "ana@example.com"}, headers=_auth(admin.id_token)
    )

    assert response.status_code == 201
    assert response.json()["outcome"] == "reactivated"


async def test_two_invitations_at_once_with_one_slot_left_create_only_one(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await _seed_pending(seed_invitation, 49)

    responses = await asyncio.gather(
        client.post(URL, json={"email": "a@example.com"}, headers=_auth(admin.id_token)),
        client.post(URL, json={"email": "b@example.com"}, headers=_auth(admin.id_token)),
    )

    assert sorted(response.status_code for response in responses) == [201, 409]
    assert await _pending_count(firestore_client) == 50


@pytest.mark.parametrize(
    "email",
    ["", "   ", "no-at-sign", "a@b", "two@@example.com", "a b@example.com", "x/y@example.com"],
)
async def test_invite_rejects_an_invalid_address_with_422(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    email: str,
) -> None:
    admin = await admin_user()

    response = await client.post(URL, json={"email": email}, headers=_auth(admin.id_token))

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert len([d async for d in firestore_client.collection("invitations").stream()]) == 0


@pytest.mark.parametrize(
    "body",
    [
        {"email": "ana@example.com", "role": "admin"},
        {"email": "ana@example.com", "status": "accepted"},
        {},
        {"email": 42},
        {"email": "a" * 300 + "@example.com"},
    ],
)
async def test_invite_rejects_unexpected_or_malformed_bodies_with_422(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    body: dict[str, object],
) -> None:
    admin = await admin_user()

    response = await client.post(URL, json=body, headers=_auth(admin.id_token))

    assert response.status_code == 422
    assert len([d async for d in firestore_client.collection("invitations").stream()]) == 0


async def test_invite_as_a_regular_user_returns_403_and_creates_nothing(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    google_user: GoogleUserFactory,
) -> None:
    user = await google_user("ana@example.com")

    response = await client.post(
        URL, json={"email": "bob@example.com"}, headers=_auth(user.id_token)
    )

    assert response.status_code == 403
    assert response.json()["code"] == "access_denied"
    assert len([d async for d in firestore_client.collection("invitations").stream()]) == 0


async def test_invite_as_a_stranger_returns_403(
    client: httpx.AsyncClient, google_user_without_account: GoogleUserFactory
) -> None:
    stranger = await google_user_without_account("stranger@example.com")

    response = await client.post(
        URL, json={"email": "bob@example.com"}, headers=_auth(stranger.id_token)
    )

    assert response.status_code == 403


async def test_invite_without_token_returns_401(client: httpx.AsyncClient) -> None:
    response = await client.post(URL, json={"email": "bob@example.com"})

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"
