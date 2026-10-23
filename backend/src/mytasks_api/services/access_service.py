import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends

from mytasks_api.config import Settings, get_settings
from mytasks_api.domain.account import (
    AccessDeniedError,
    Account,
    AccountAlreadyActiveError,
    AccountNotFoundError,
    AccountStatus,
    InvalidEmailError,
    Invitation,
    InvitationNotFoundError,
    InviteOutcome,
    normalize_email,
)
from mytasks_api.logging_config import email_fingerprint, log_event
from mytasks_api.repositories.account_repository import AccountRepository, get_account_repository

logger = logging.getLogger(__name__)

# The management screen shows the latest of each list; there is no paging in this version.
ACCESS_LIST_LIMIT = 100

# Bounds the invitations waiting at once. It does not by itself keep them in the list above:
# that one mixes every status, so older pending ones can still fall out of its newest 100.
MAX_PENDING_INVITATIONS = 50


@dataclass(frozen=True)
class InviteResult:
    outcome: InviteOutcome
    email: str


class AccessService:
    def __init__(
        self, repository: AccountRepository, bootstrap_admin_email: str | None = None
    ) -> None:
        self._repository = repository
        self._bootstrap_admin_email = bootstrap_admin_email

    def _deny(self, uid: str, reason: str) -> AccessDeniedError:
        # The reason goes to the log only; the client always gets the same answer, so
        # nobody can learn from it whether an address is invited or was revoked.
        log_event(logger, logging.WARNING, "access_denied", uid=uid, reason=reason)
        return AccessDeniedError(reason)

    async def require_active(self, uid: str) -> Account:
        """The account behind a verified token, or a denial. Never creates anything."""
        account = await self._repository.get_account(uid)
        if account is None:
            raise self._deny(uid, "no_account")
        if account.status is not AccountStatus.ACTIVE:
            raise self._deny(uid, "revoked")
        return account

    async def resolve_session(self, uid: str, email: str | None, email_verified: bool) -> Account:
        """Entry point after sign-in: an existing account, or one created by an invitation
        (or by the bootstrap address). The only place where accounts are born."""
        existing = await self._repository.get_account(uid)
        if existing is not None:
            if existing.status is not AccountStatus.ACTIVE:
                raise self._deny(uid, "revoked")
            return existing

        # Google must have verified the address: otherwise anyone could register an
        # unverified account under an invited (or the bootstrap) address.
        if not email or not email_verified:
            raise self._deny(uid, "email_not_verified")
        try:
            normalized = normalize_email(email)
        except InvalidEmailError as error:
            raise self._deny(uid, "invalid_email") from error

        now = datetime.now(UTC)
        accepted = await self._repository.accept_invitation(uid, normalized, now)
        if accepted is not None:
            account, created_now = accepted
            if account.status is not AccountStatus.ACTIVE:
                raise self._deny(uid, "revoked")
            # Only the call that really created the account is audited as the acceptance.
            if created_now:
                log_event(
                    logger,
                    logging.INFO,
                    "invitation_accepted",
                    uid=uid,
                    target=email_fingerprint(normalized),
                )
            return account

        if self._bootstrap_admin_email and normalized == self._bootstrap_admin_email:
            admin, created_now = await self._repository.create_bootstrap_admin(uid, normalized, now)
            if admin.status is not AccountStatus.ACTIVE:
                raise self._deny(uid, "revoked")
            if created_now:
                log_event(logger, logging.INFO, "bootstrap_admin_created", uid=uid)
            return admin

        raise self._deny(uid, "no_invitation")

    async def invite(self, admin_uid: str, raw_email: str) -> InviteResult:
        """Let `raw_email` in. An address whose access was withdrawn is reactivated (its tasks
        were never touched); one already invited is left as it was."""
        email = normalize_email(raw_email)
        target = email_fingerprint(email)

        account = await self._repository.find_account_by_email(email)
        if account is not None:
            if account.status is AccountStatus.ACTIVE:
                raise AccountAlreadyActiveError
            await self._repository.reactivate_account(account.uid)
            log_event(
                logger,
                logging.INFO,
                "access_reactivated",
                actor_uid=admin_uid,
                uid=account.uid,
                target=target,
            )
            return InviteResult(InviteOutcome.REACTIVATED, email)

        _, created_now = await self._repository.upsert_pending_invitation(
            email, admin_uid, datetime.now(UTC), MAX_PENDING_INVITATIONS
        )
        if not created_now:
            return InviteResult(InviteOutcome.ALREADY_PENDING, email)
        log_event(logger, logging.INFO, "invitation_created", actor_uid=admin_uid, target=target)
        return InviteResult(InviteOutcome.INVITED, email)

    async def list_access(self) -> tuple[list[Invitation], list[Account]]:
        invitations = await self._repository.list_invitations(ACCESS_LIST_LIMIT)
        accounts = await self._repository.list_accounts(ACCESS_LIST_LIMIT)
        return invitations, accounts

    async def revoke_invitation(self, admin_uid: str, raw_email: str) -> None:
        email = normalize_email(raw_email)
        if not await self._repository.revoke_pending_invitation(email):
            raise InvitationNotFoundError
        log_event(
            logger,
            logging.INFO,
            "invitation_revoked",
            actor_uid=admin_uid,
            target=email_fingerprint(email),
        )

    async def revoke_account(self, admin_uid: str, uid: str) -> None:
        """Withdraw access (not delete): the tasks stay and come back if the address is
        invited again. Administrators cannot be revoked."""
        result = await self._repository.revoke_account(uid, datetime.now(UTC))
        if result is None:
            raise AccountNotFoundError(uid)
        _, changed = result
        if changed:
            log_event(logger, logging.INFO, "access_revoked", actor_uid=admin_uid, uid=uid)


def get_access_service(
    repository: AccountRepository = Depends(get_account_repository),
    settings: Settings = Depends(get_settings),
) -> AccessService:
    return AccessService(repository, settings.bootstrap_admin_email)
