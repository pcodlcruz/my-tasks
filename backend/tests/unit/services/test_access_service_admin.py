from dataclasses import replace
from datetime import UTC, datetime

import pytest

from mytasks_api.domain.account import (
    Account,
    AccountAlreadyActiveError,
    AccountNotFoundError,
    AccountStatus,
    AdminAccountProtectedError,
    InvalidEmailError,
    Invitation,
    InvitationNotFoundError,
    InvitationStatus,
    InviteOutcome,
    PendingInvitationLimitError,
    Role,
    revoke_account,
)
from mytasks_api.services import access_service
from mytasks_api.services.access_service import AccessService

pytestmark = pytest.mark.unit

NOW = datetime(2026, 10, 22, 12, 0, tzinfo=UTC)


class FakeAccountRepository:
    def __init__(self) -> None:
        self.accounts: dict[str, Account] = {}
        self.invitations: dict[str, Invitation] = {}

    async def find_account_by_email(self, email: str) -> Account | None:
        return next((a for a in self.accounts.values() if a.email == email), None)

    async def upsert_pending_invitation(
        self, email: str, invited_by: str, now: datetime, max_pending: int
    ) -> tuple[Invitation, bool]:
        current = self.invitations.get(email)
        if current is not None and current.status is InvitationStatus.PENDING:
            return current, False
        pending = sum(i.status is InvitationStatus.PENDING for i in self.invitations.values())
        if pending >= max_pending:
            raise PendingInvitationLimitError
        fresh = Invitation(email, InvitationStatus.PENDING, invited_by, now, None, None)
        self.invitations[email] = fresh
        return fresh, True

    async def revoke_pending_invitation(self, email: str) -> bool:
        current = self.invitations.get(email)
        if current is None or current.status is not InvitationStatus.PENDING:
            return False
        self.invitations[email] = replace(current, status=InvitationStatus.REVOKED)
        return True

    async def revoke_account(self, uid: str, now: datetime) -> tuple[Account, bool] | None:
        account = self.accounts.get(uid)
        if account is None:
            return None
        if account.status is AccountStatus.REVOKED:
            return account, False
        revoked = revoke_account(account, now)
        self.accounts[uid] = revoked
        return revoked, True

    async def reactivate_account(self, uid: str) -> Account:
        account = replace(self.accounts[uid], status=AccountStatus.ACTIVE, revoked_at=None)
        self.accounts[uid] = account
        return account

    async def list_invitations(self, limit: int) -> list[Invitation]:
        return list(self.invitations.values())[:limit]

    async def list_accounts(self, limit: int) -> list[Account]:
        return list(self.accounts.values())[:limit]


def _service(repository: FakeAccountRepository) -> AccessService:
    return AccessService(repository)  # type: ignore[arg-type]


def _account(
    uid: str = "uid-1",
    email: str = "ana@example.com",
    role: Role = Role.USER,
    status: AccountStatus = AccountStatus.ACTIVE,
) -> Account:
    return Account(uid, email, role, status, NOW, NOW if status is AccountStatus.REVOKED else None)


async def test_invite_creates_a_pending_invitation_for_a_new_address() -> None:
    repository = FakeAccountRepository()

    result = await _service(repository).invite("admin-1", "ana@example.com")

    assert result.outcome is InviteOutcome.INVITED
    assert result.email == "ana@example.com"
    assert repository.invitations["ana@example.com"].invited_by == "admin-1"
    assert repository.invitations["ana@example.com"].status is InvitationStatus.PENDING


async def test_invite_normalizes_the_address_before_storing_it() -> None:
    repository = FakeAccountRepository()

    result = await _service(repository).invite("admin-1", "  Ana@Example.COM ")

    assert result.email == "ana@example.com"
    assert list(repository.invitations) == ["ana@example.com"]


async def test_invite_twice_reports_the_pending_invitation_and_does_not_duplicate_it() -> None:
    repository = FakeAccountRepository()
    service = _service(repository)
    await service.invite("admin-1", "ana@example.com")

    result = await service.invite("admin-2", "ANA@example.com")

    assert result.outcome is InviteOutcome.ALREADY_PENDING
    assert len(repository.invitations) == 1
    assert repository.invitations["ana@example.com"].invited_by == "admin-1"


async def test_invite_an_address_with_an_active_account_is_a_conflict() -> None:
    repository = FakeAccountRepository()
    repository.accounts["uid-1"] = _account()

    with pytest.raises(AccountAlreadyActiveError):
        await _service(repository).invite("admin-1", "ana@example.com")

    assert repository.invitations == {}


async def test_invite_an_address_with_a_revoked_account_reactivates_it_without_an_invitation() -> (
    None
):
    repository = FakeAccountRepository()
    repository.accounts["uid-1"] = _account(status=AccountStatus.REVOKED)

    result = await _service(repository).invite("admin-1", "ana@example.com")

    assert result.outcome is InviteOutcome.REACTIVATED
    assert repository.accounts["uid-1"].status is AccountStatus.ACTIVE
    assert repository.accounts["uid-1"].revoked_at is None
    assert repository.accounts["uid-1"].role is Role.USER
    assert repository.invitations == {}


async def test_invite_after_a_revoked_invitation_makes_it_pending_again() -> None:
    repository = FakeAccountRepository()
    service = _service(repository)
    await service.invite("admin-1", "ana@example.com")
    await service.revoke_invitation("admin-1", "ana@example.com")

    result = await service.invite("admin-2", "ana@example.com")

    assert result.outcome is InviteOutcome.INVITED
    assert repository.invitations["ana@example.com"].status is InvitationStatus.PENDING
    assert repository.invitations["ana@example.com"].invited_by == "admin-2"


@pytest.mark.parametrize("raw", ["", "no-at-sign", "a@b", "a b@example.com", "x/y@example.com"])
async def test_invite_rejects_an_invalid_address_and_stores_nothing(raw: str) -> None:
    repository = FakeAccountRepository()

    with pytest.raises(InvalidEmailError):
        await _service(repository).invite("admin-1", raw)

    assert repository.invitations == {}


def test_the_pending_invitation_limit_is_50() -> None:
    assert access_service.MAX_PENDING_INVITATIONS == 50


async def test_invite_beyond_the_pending_limit_fails_and_stores_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(access_service, "MAX_PENDING_INVITATIONS", 2)
    repository = FakeAccountRepository()
    service = _service(repository)
    await service.invite("admin-1", "a@example.com")
    await service.invite("admin-1", "b@example.com")

    with pytest.raises(PendingInvitationLimitError):
        await service.invite("admin-1", "c@example.com")

    assert "c@example.com" not in repository.invitations


async def test_inviting_an_already_pending_address_at_the_limit_is_not_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(access_service, "MAX_PENDING_INVITATIONS", 1)
    service = _service(FakeAccountRepository())
    await service.invite("admin-1", "a@example.com")

    result = await service.invite("admin-1", "a@example.com")

    assert result.outcome is InviteOutcome.ALREADY_PENDING


async def test_reactivating_an_account_at_the_limit_is_not_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(access_service, "MAX_PENDING_INVITATIONS", 1)
    repository = FakeAccountRepository()
    repository.accounts["uid-1"] = _account(status=AccountStatus.REVOKED)
    service = _service(repository)
    await service.invite("admin-1", "other@example.com")

    result = await service.invite("admin-1", "ana@example.com")

    assert result.outcome is InviteOutcome.REACTIVATED


async def test_revoking_an_invitation_frees_a_slot(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(access_service, "MAX_PENDING_INVITATIONS", 1)
    service = _service(FakeAccountRepository())
    await service.invite("admin-1", "a@example.com")
    await service.revoke_invitation("admin-1", "a@example.com")

    result = await service.invite("admin-1", "b@example.com")

    assert result.outcome is InviteOutcome.INVITED


async def test_revoke_invitation_revokes_a_pending_one() -> None:
    repository = FakeAccountRepository()
    service = _service(repository)
    await service.invite("admin-1", "ana@example.com")

    await service.revoke_invitation("admin-1", "Ana@Example.com")

    assert repository.invitations["ana@example.com"].status is InvitationStatus.REVOKED


async def test_revoke_invitation_of_an_unknown_or_accepted_address_is_not_found() -> None:
    repository = FakeAccountRepository()
    repository.invitations["bob@example.com"] = Invitation(
        "bob@example.com", InvitationStatus.ACCEPTED, "admin-1", NOW, NOW, "uid-2"
    )
    service = _service(repository)

    with pytest.raises(InvitationNotFoundError):
        await service.revoke_invitation("admin-1", "nobody@example.com")
    with pytest.raises(InvitationNotFoundError):
        await service.revoke_invitation("admin-1", "bob@example.com")


async def test_revoke_account_withdraws_access_from_a_user() -> None:
    repository = FakeAccountRepository()
    repository.accounts["uid-1"] = _account()

    await _service(repository).revoke_account("admin-1", "uid-1")

    assert repository.accounts["uid-1"].status is AccountStatus.REVOKED


async def test_revoke_account_refuses_an_admin() -> None:
    repository = FakeAccountRepository()
    repository.accounts["uid-9"] = _account(uid="uid-9", role=Role.ADMIN)

    with pytest.raises(AdminAccountProtectedError):
        await _service(repository).revoke_account("admin-1", "uid-9")

    assert repository.accounts["uid-9"].status is AccountStatus.ACTIVE


async def test_revoke_account_of_an_unknown_uid_is_not_found() -> None:
    with pytest.raises(AccountNotFoundError):
        await _service(FakeAccountRepository()).revoke_account("admin-1", "uid-404")


async def test_revoke_account_twice_is_idempotent() -> None:
    repository = FakeAccountRepository()
    repository.accounts["uid-1"] = _account(status=AccountStatus.REVOKED)

    await _service(repository).revoke_account("admin-1", "uid-1")

    assert repository.accounts["uid-1"].status is AccountStatus.REVOKED


async def test_list_access_returns_invitations_and_accounts() -> None:
    repository = FakeAccountRepository()
    repository.accounts["uid-1"] = _account()
    service = _service(repository)
    await service.invite("admin-1", "bob@example.com")

    invitations, accounts = await service.list_access()

    assert [i.email for i in invitations] == ["bob@example.com"]
    assert [a.uid for a in accounts] == ["uid-1"]
