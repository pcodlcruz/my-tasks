from datetime import UTC, datetime

import pytest

from mytasks_api.domain.account import (
    Account,
    AccountStatus,
    AdminAccountProtectedError,
    InvalidEmailError,
    Invitation,
    InvitationNotPendingError,
    InvitationStatus,
    Role,
    accept_invitation,
    normalize_email,
    reactivate_account,
    reinvite,
    revoke_account,
    revoke_invitation,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 10, 22, 12, 0, tzinfo=UTC)


def _account(role: Role = Role.USER, status: AccountStatus = AccountStatus.ACTIVE) -> Account:
    return Account(
        uid="uid-1",
        email="ana@example.com",
        role=role,
        status=status,
        created_at=NOW,
        revoked_at=NOW if status is AccountStatus.REVOKED else None,
    )


def _invitation(status: InvitationStatus = InvitationStatus.PENDING) -> Invitation:
    return Invitation(
        email="ana@example.com",
        status=status,
        invited_by="admin-1",
        created_at=NOW,
        accepted_at=None,
        accepted_uid=None,
    )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Ana@Example.COM", "ana@example.com"),
        ("  ana@example.com  ", "ana@example.com"),
        ("a.b+tag@sub.example.org", "a.b+tag@sub.example.org"),
    ],
)
def test_normalize_email_lowercases_and_trims(raw: str, expected: str) -> None:
    assert normalize_email(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "no-at-sign",
        "two@@example.com",
        "@example.com",
        "ana@",
        "ana@nodot",
        "a b@example.com",
        "ana/x@example.com",
        "ana@exa/mple.com",
        "a" * 250 + "@example.com",
    ],
)
def test_normalize_email_rejects_invalid_values(raw: str) -> None:
    with pytest.raises(InvalidEmailError):
        normalize_email(raw)


def test_accept_invitation_marks_it_accepted_with_the_uid_and_moment() -> None:
    accepted = accept_invitation(_invitation(), "uid-9", NOW)

    assert accepted.status is InvitationStatus.ACCEPTED
    assert accepted.accepted_uid == "uid-9"
    assert accepted.accepted_at == NOW


@pytest.mark.parametrize("status", [InvitationStatus.ACCEPTED, InvitationStatus.REVOKED])
def test_accept_invitation_rejects_a_non_pending_invitation(status: InvitationStatus) -> None:
    with pytest.raises(InvitationNotPendingError):
        accept_invitation(_invitation(status), "uid-9", NOW)


def test_revoke_invitation_only_applies_to_pending_ones() -> None:
    assert revoke_invitation(_invitation()).status is InvitationStatus.REVOKED
    with pytest.raises(InvitationNotPendingError):
        revoke_invitation(_invitation(InvitationStatus.ACCEPTED))


def test_reinvite_turns_a_revoked_invitation_back_into_pending() -> None:
    again = reinvite(_invitation(InvitationStatus.REVOKED), "admin-2", NOW)

    assert again.status is InvitationStatus.PENDING
    assert again.invited_by == "admin-2"
    assert again.created_at == NOW


def test_revoke_account_marks_a_user_as_revoked_with_the_moment() -> None:
    revoked = revoke_account(_account(), NOW)

    assert revoked.status is AccountStatus.REVOKED
    assert revoked.revoked_at == NOW


def test_revoke_account_refuses_to_revoke_an_admin() -> None:
    with pytest.raises(AdminAccountProtectedError):
        revoke_account(_account(role=Role.ADMIN), NOW)


def test_reactivate_account_restores_access_and_clears_the_revocation() -> None:
    restored = reactivate_account(_account(status=AccountStatus.REVOKED))

    assert restored.status is AccountStatus.ACTIVE
    assert restored.revoked_at is None
    assert restored.role is Role.USER
