from datetime import UTC, datetime

import pytest

from mytasks_api.domain.account import (
    AccessDeniedError,
    Account,
    AccountStatus,
    Invitation,
    InvitationStatus,
    Role,
)
from mytasks_api.services.access_service import AccessService

pytestmark = pytest.mark.unit

NOW = datetime(2026, 10, 22, 12, 0, tzinfo=UTC)


class FakeAccountRepository:
    def __init__(self) -> None:
        self.accounts: dict[str, Account] = {}
        self.invitations: dict[str, Invitation] = {}
        self.fail = False

    def _check(self) -> None:
        if self.fail:
            message = "firestore unavailable"
            raise RuntimeError(message)

    async def get_account(self, uid: str) -> Account | None:
        self._check()
        return self.accounts.get(uid)

    async def accept_invitation(
        self, uid: str, email: str, now: datetime
    ) -> tuple[Account, bool] | None:
        self._check()
        invitation = self.invitations.get(email)
        if invitation is None or invitation.status is not InvitationStatus.PENDING:
            return None
        self.invitations[email] = Invitation(
            email=email,
            status=InvitationStatus.ACCEPTED,
            invited_by=invitation.invited_by,
            created_at=invitation.created_at,
            accepted_at=now,
            accepted_uid=uid,
        )
        account = Account(uid, email, Role.USER, AccountStatus.ACTIVE, now, None)
        self.accounts[uid] = account
        return account, True

    async def create_bootstrap_admin(
        self, uid: str, email: str, now: datetime
    ) -> tuple[Account, bool]:
        self._check()
        existing = self.accounts.get(uid)
        if existing is not None:
            return existing, False
        account = Account(uid, email, Role.ADMIN, AccountStatus.ACTIVE, now, None)
        self.accounts[uid] = account
        return account, True


def _pending(email: str) -> Invitation:
    return Invitation(email, InvitationStatus.PENDING, "admin-1", NOW, None, None)


def _service(repository: FakeAccountRepository, bootstrap: str | None = None) -> AccessService:
    return AccessService(repository, bootstrap_admin_email=bootstrap)  # type: ignore[arg-type]


async def test_resolve_session_accepts_a_pending_invitation_as_user() -> None:
    repository = FakeAccountRepository()
    repository.invitations["ana@example.com"] = _pending("ana@example.com")

    account = await _service(repository).resolve_session("uid-1", "Ana@Example.com", True)

    assert account.role is Role.USER
    assert account.status is AccountStatus.ACTIVE
    assert repository.invitations["ana@example.com"].status is InvitationStatus.ACCEPTED


async def test_resolve_session_accepts_an_invitation_only_once() -> None:
    repository = FakeAccountRepository()
    repository.invitations["ana@example.com"] = _pending("ana@example.com")
    service = _service(repository)

    await service.resolve_session("uid-1", "ana@example.com", True)

    with pytest.raises(AccessDeniedError):
        await service.resolve_session("uid-2", "ana@example.com", True)


async def test_resolve_session_returns_the_existing_account_without_touching_invitations() -> None:
    repository = FakeAccountRepository()
    existing = Account("uid-1", "ana@example.com", Role.USER, AccountStatus.ACTIVE, NOW, None)
    repository.accounts["uid-1"] = existing

    assert await _service(repository).resolve_session("uid-1", "ana@example.com", True) == existing


async def test_resolve_session_denies_a_revoked_account() -> None:
    repository = FakeAccountRepository()
    repository.accounts["uid-1"] = Account(
        "uid-1", "ana@example.com", Role.USER, AccountStatus.REVOKED, NOW, NOW
    )

    with pytest.raises(AccessDeniedError):
        await _service(repository).resolve_session("uid-1", "ana@example.com", True)


async def test_resolve_session_denies_someone_without_invitation_and_creates_nothing() -> None:
    repository = FakeAccountRepository()

    with pytest.raises(AccessDeniedError):
        await _service(repository).resolve_session("uid-1", "stranger@example.com", True)

    assert repository.accounts == {}


async def test_resolve_session_denies_an_unverified_email_even_with_an_invitation() -> None:
    repository = FakeAccountRepository()
    repository.invitations["ana@example.com"] = _pending("ana@example.com")

    with pytest.raises(AccessDeniedError):
        await _service(repository).resolve_session("uid-1", "ana@example.com", False)

    assert repository.invitations["ana@example.com"].status is InvitationStatus.PENDING


async def test_resolve_session_denies_a_token_without_email() -> None:
    with pytest.raises(AccessDeniedError):
        await _service(FakeAccountRepository()).resolve_session("uid-1", None, True)


async def test_resolve_session_creates_the_bootstrap_admin_for_the_configured_verified_email() -> (
    None
):
    repository = FakeAccountRepository()

    account = await _service(repository, "owner@example.com").resolve_session(
        "uid-1", "Owner@Example.com", True
    )

    assert account.role is Role.ADMIN
    assert repository.accounts["uid-1"] == account


async def test_resolve_session_does_not_bootstrap_an_unverified_email() -> None:
    repository = FakeAccountRepository()

    with pytest.raises(AccessDeniedError):
        await _service(repository, "owner@example.com").resolve_session(
            "uid-1", "owner@example.com", False
        )

    assert repository.accounts == {}


async def test_resolve_session_does_not_bootstrap_another_email() -> None:
    with pytest.raises(AccessDeniedError):
        await _service(FakeAccountRepository(), "owner@example.com").resolve_session(
            "uid-1", "other@example.com", True
        )


async def test_resolve_session_does_not_grant_access_when_the_repository_fails() -> None:
    repository = FakeAccountRepository()
    repository.invitations["ana@example.com"] = _pending("ana@example.com")
    repository.fail = True

    with pytest.raises(RuntimeError, match="firestore unavailable"):
        await _service(repository).resolve_session("uid-1", "ana@example.com", True)

    assert repository.accounts == {}


async def test_require_active_returns_an_active_account() -> None:
    repository = FakeAccountRepository()
    account = Account("uid-1", "ana@example.com", Role.USER, AccountStatus.ACTIVE, NOW, None)
    repository.accounts["uid-1"] = account

    assert await _service(repository).require_active("uid-1") == account


async def test_require_active_denies_missing_and_revoked_accounts_alike() -> None:
    repository = FakeAccountRepository()
    repository.accounts["uid-2"] = Account(
        "uid-2", "bob@example.com", Role.USER, AccountStatus.REVOKED, NOW, NOW
    )
    service = _service(repository)

    with pytest.raises(AccessDeniedError):
        await service.require_active("uid-1")
    with pytest.raises(AccessDeniedError):
        await service.require_active("uid-2")
