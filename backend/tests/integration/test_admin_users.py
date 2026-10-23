from __future__ import annotations

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

ACCESS = "/api/v1/admin/access"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_list_access_returns_invitations_and_accounts_with_their_state(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user: GoogleUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user("admin@example.com")
    ana = await google_user("ana@example.com")
    await seed_invitation("bob@example.com")
    await seed_invitation("old@example.com", status="revoked")

    response = await client.get(ACCESS, headers=_auth(admin.id_token))

    assert response.status_code == 200
    body = response.json()
    invitations = {item["email"]: item["status"] for item in body["invitations"]}
    assert invitations == {"bob@example.com": "pending", "old@example.com": "revoked"}
    accounts = {item["email"]: item for item in body["accounts"]}
    assert accounts["ana@example.com"]["uid"] == ana.uid
    assert accounts["ana@example.com"]["role"] == "user"
    assert accounts["ana@example.com"]["status"] == "active"
    assert accounts["admin@example.com"]["role"] == "admin"


async def test_list_access_returns_at_most_one_hundred_invitations(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    admin = await admin_user()
    batch = firestore_client.batch()
    for index in range(105):
        email = f"user{index:03d}@example.com"
        batch.set(
            firestore_client.collection("invitations").document(email),
            {
                "email": email,
                "status": "pending",
                "invited_by": admin.uid,
                "created_at": firestore.SERVER_TIMESTAMP,
                "accepted_at": None,
                "accepted_uid": None,
            },
        )
    await batch.commit()

    response = await client.get(ACCESS, headers=_auth(admin.id_token))

    assert len(response.json()["invitations"]) == 100


async def test_revoke_invitation_stops_that_person_from_entering(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user_without_account: GoogleUserFactory,
    seed_invitation: SeedInvitationFactory,
) -> None:
    admin = await admin_user()
    await seed_invitation("ana@example.com")

    revoked = await client.delete(
        "/api/v1/admin/invitations/Ana@Example.com", headers=_auth(admin.id_token)
    )
    ana = await google_user_without_account("ana@example.com")
    attempt = await client.get("/api/v1/me", headers=_auth(ana.id_token))

    assert revoked.status_code == 204
    assert attempt.status_code == 403


@pytest.mark.parametrize("status", ["accepted", "revoked"])
async def test_revoke_invitation_that_is_not_pending_returns_404(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    seed_invitation: SeedInvitationFactory,
    status: str,
) -> None:
    admin = await admin_user()
    await seed_invitation("ana@example.com", status=status)

    response = await client.delete(
        "/api/v1/admin/invitations/ana@example.com", headers=_auth(admin.id_token)
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_revoke_invitation_of_an_unknown_address_returns_404(
    client: httpx.AsyncClient, admin_user: AdminUserFactory
) -> None:
    admin = await admin_user()

    response = await client.delete(
        "/api/v1/admin/invitations/nobody@example.com", headers=_auth(admin.id_token)
    )

    assert response.status_code == 404


async def test_revoke_invitation_with_an_invalid_address_returns_422(
    client: httpx.AsyncClient, admin_user: AdminUserFactory
) -> None:
    admin = await admin_user()

    response = await client.delete(
        "/api/v1/admin/invitations/not-an-email", headers=_auth(admin.id_token)
    )

    assert response.status_code == 422


async def test_revoke_account_denies_the_next_request_and_keeps_the_tasks(
    client: httpx.AsyncClient,
    firestore_client: firestore.AsyncClient,
    admin_user: AdminUserFactory,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
) -> None:
    admin = await admin_user()
    ana = await google_user("ana@example.com")
    task_id = await seed_task(ana.uid)
    before = await client.get(
        "/api/v1/tasks", params={"view": "board"}, headers=_auth(ana.id_token)
    )

    revoked = await client.delete(f"/api/v1/admin/users/{ana.uid}", headers=_auth(admin.id_token))
    after = await client.get("/api/v1/tasks", params={"view": "board"}, headers=_auth(ana.id_token))

    assert before.status_code == 200
    assert revoked.status_code == 204
    assert after.status_code == 403
    assert after.json()["code"] == "access_denied"
    task = (
        await firestore_client.collection("users")
        .document(ana.uid)
        .collection("tasks")
        .document(task_id)
        .get()
    )
    assert task.exists
    account = (await firestore_client.collection("users").document(ana.uid).get()).to_dict() or {}
    assert account["status"] == "revoked"
    assert account["revoked_at"] is not None


async def test_revoke_account_twice_is_idempotent(
    client: httpx.AsyncClient, admin_user: AdminUserFactory, google_user: GoogleUserFactory
) -> None:
    admin = await admin_user()
    ana = await google_user("ana@example.com")

    first = await client.delete(f"/api/v1/admin/users/{ana.uid}", headers=_auth(admin.id_token))
    second = await client.delete(f"/api/v1/admin/users/{ana.uid}", headers=_auth(admin.id_token))

    assert first.status_code == second.status_code == 204


async def test_revoke_an_admin_is_refused_and_the_admin_keeps_access(
    client: httpx.AsyncClient, admin_user: AdminUserFactory
) -> None:
    admin = await admin_user("admin@example.com")
    other = await admin_user("other-admin@example.com")

    refused = await client.delete(f"/api/v1/admin/users/{other.uid}", headers=_auth(admin.id_token))
    themselves = await client.delete(
        f"/api/v1/admin/users/{admin.uid}", headers=_auth(admin.id_token)
    )
    still_in = await client.get("/api/v1/me", headers=_auth(other.id_token))

    assert refused.status_code == themselves.status_code == 409
    assert refused.json()["code"] == "admin_protected"
    assert still_in.status_code == 200


@pytest.mark.parametrize("uid", ["does-not-exist", "__reserved__", "a" * 129])
async def test_revoke_account_of_an_unknown_or_malformed_uid_returns_404(
    client: httpx.AsyncClient, admin_user: AdminUserFactory, uid: str
) -> None:
    admin = await admin_user()

    response = await client.delete(f"/api/v1/admin/users/{uid}", headers=_auth(admin.id_token))

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_revoked_user_signs_in_again_and_is_still_denied(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user_without_account: GoogleUserFactory,
    seed_account: SeedAccountFactory,
) -> None:
    admin = await admin_user()
    ana = await google_user_without_account("ana@example.com")
    await seed_account(ana.uid, "ana@example.com")
    await client.delete(f"/api/v1/admin/users/{ana.uid}", headers=_auth(admin.id_token))
    again = await google_user_without_account("ana@example.com")

    response = await client.get("/api/v1/me", headers=_auth(again.id_token))

    assert response.status_code == 403


ADMIN_REQUESTS = [
    ("GET", ACCESS),
    ("DELETE", "/api/v1/admin/invitations/ana@example.com"),
    ("DELETE", "/api/v1/admin/users/some-uid"),
]


@pytest.mark.parametrize(("method", "url"), ADMIN_REQUESTS)
async def test_admin_endpoints_answer_403_to_a_regular_user(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, method: str, url: str
) -> None:
    user = await google_user("ana@example.com")

    response = await client.request(method, url, headers=_auth(user.id_token))

    assert response.status_code == 403
    assert response.json()["code"] == "access_denied"


@pytest.mark.parametrize(("method", "url"), ADMIN_REQUESTS)
async def test_admin_endpoints_answer_403_to_a_stranger(
    client: httpx.AsyncClient,
    google_user_without_account: GoogleUserFactory,
    method: str,
    url: str,
) -> None:
    stranger = await google_user_without_account("stranger@example.com")

    response = await client.request(method, url, headers=_auth(stranger.id_token))

    assert response.status_code == 403


@pytest.mark.parametrize(("method", "url"), ADMIN_REQUESTS)
async def test_admin_endpoints_answer_401_without_token(
    client: httpx.AsyncClient, method: str, url: str
) -> None:
    response = await client.request(method, url)

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_every_admin_route_is_covered_by_the_authorization_cases(
    client: httpx.AsyncClient,
) -> None:
    from mytasks_api.main import app

    covered = {
        ("GET", ACCESS),
        ("POST", "/api/v1/admin/invitations"),
        ("DELETE", "/api/v1/admin/invitations/{email}"),
        ("DELETE", "/api/v1/admin/users/{uid}"),
    }
    routes = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/v1/admin")
        for method in operations
    }

    assert routes == covered
