from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
import pytest

from mytasks_api.logging_config import email_fingerprint

if TYPE_CHECKING:
    from tests.conftest import (
        AdminUserFactory,
        GoogleUserFactory,
        SeedAccountFactory,
    )

pytestmark = pytest.mark.integration

ADDRESS = "ana@example.com"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _records(caplog: pytest.LogCaptureFixture, message: str) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.getMessage() == message]


def _assert_no_address_or_token_is_logged(caplog: pytest.LogCaptureFixture, *tokens: str) -> None:
    for record in caplog.records:
        haystack = " ".join(str(value) for value in vars(record).values())
        assert ADDRESS not in haystack.lower()
        for token in tokens:
            assert token not in haystack


async def test_inviting_is_audited_with_the_actor_and_a_fingerprint_of_the_address(
    client: httpx.AsyncClient, admin_user: AdminUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    admin = await admin_user()

    await client.post(
        "/api/v1/admin/invitations", json={"email": ADDRESS}, headers=_auth(admin.id_token)
    )

    (record,) = _records(caplog, "invitation_created")
    assert record.actor_uid == admin.uid  # type: ignore[attr-defined]
    assert record.target == email_fingerprint(ADDRESS)  # type: ignore[attr-defined]
    _assert_no_address_or_token_is_logged(caplog, admin.id_token)


async def test_inviting_the_same_address_again_is_not_audited_twice(
    client: httpx.AsyncClient, admin_user: AdminUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    admin = await admin_user()
    for _ in range(2):
        await client.post(
            "/api/v1/admin/invitations", json={"email": ADDRESS}, headers=_auth(admin.id_token)
        )

    assert len(_records(caplog, "invitation_created")) == 1


async def test_accepting_an_invitation_is_audited(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user_without_account: GoogleUserFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    admin = await admin_user()
    await client.post(
        "/api/v1/admin/invitations", json={"email": ADDRESS}, headers=_auth(admin.id_token)
    )
    ana = await google_user_without_account(ADDRESS)

    await client.get("/api/v1/me", headers=_auth(ana.id_token))

    (record,) = _records(caplog, "invitation_accepted")
    assert record.uid == ana.uid  # type: ignore[attr-defined]
    assert record.target == email_fingerprint(ADDRESS)  # type: ignore[attr-defined]
    _assert_no_address_or_token_is_logged(caplog, admin.id_token, ana.id_token)


async def test_revoking_an_invitation_is_audited(
    client: httpx.AsyncClient, admin_user: AdminUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    admin = await admin_user()
    await client.post(
        "/api/v1/admin/invitations", json={"email": ADDRESS}, headers=_auth(admin.id_token)
    )

    await client.delete(f"/api/v1/admin/invitations/{ADDRESS}", headers=_auth(admin.id_token))

    (record,) = _records(caplog, "invitation_revoked")
    assert record.actor_uid == admin.uid  # type: ignore[attr-defined]
    assert record.target == email_fingerprint(ADDRESS)  # type: ignore[attr-defined]
    _assert_no_address_or_token_is_logged(caplog, admin.id_token)


async def test_revoking_and_reactivating_an_account_are_audited(
    client: httpx.AsyncClient,
    admin_user: AdminUserFactory,
    google_user: GoogleUserFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    admin = await admin_user()
    ana = await google_user(ADDRESS)

    await client.delete(f"/api/v1/admin/users/{ana.uid}", headers=_auth(admin.id_token))
    await client.delete(f"/api/v1/admin/users/{ana.uid}", headers=_auth(admin.id_token))
    await client.post(
        "/api/v1/admin/invitations", json={"email": ADDRESS}, headers=_auth(admin.id_token)
    )

    (revoked,) = _records(caplog, "access_revoked")
    assert revoked.actor_uid == admin.uid  # type: ignore[attr-defined]
    assert revoked.uid == ana.uid  # type: ignore[attr-defined]
    (reactivated,) = _records(caplog, "access_reactivated")
    assert reactivated.actor_uid == admin.uid  # type: ignore[attr-defined]
    assert reactivated.uid == ana.uid  # type: ignore[attr-defined]
    _assert_no_address_or_token_is_logged(caplog, admin.id_token, ana.id_token)


async def test_a_denied_request_is_audited_with_the_cause_and_no_address(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    google_user_without_account: GoogleUserFactory,
    seed_account: SeedAccountFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    user = await google_user("user@example.com")
    stranger = await google_user_without_account(ADDRESS)
    revoked = await google_user_without_account("revoked@example.com")
    await seed_account(revoked.uid, "revoked@example.com", status="revoked")

    await client.get("/api/v1/admin/access", headers=_auth(user.id_token))
    await client.get("/api/v1/tasks", params={"view": "board"}, headers=_auth(stranger.id_token))
    await client.get("/api/v1/tasks", params={"view": "board"}, headers=_auth(revoked.id_token))

    reasons = {
        (record.uid, record.reason)  # type: ignore[attr-defined]
        for record in _records(caplog, "access_denied")
    }
    assert reasons == {
        (user.uid, "not_admin"),
        (stranger.uid, "no_account"),
        (revoked.uid, "revoked"),
    }
    _assert_no_address_or_token_is_logged(
        caplog, user.id_token, stranger.id_token, revoked.id_token
    )
