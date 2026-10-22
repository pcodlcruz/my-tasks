import logging
from datetime import UTC, datetime

from fastapi import Depends

from mytasks_api.config import Settings, get_settings
from mytasks_api.domain.account import (
    AccessDeniedError,
    Account,
    AccountStatus,
    InvalidEmailError,
    normalize_email,
)
from mytasks_api.logging_config import email_fingerprint, log_event
from mytasks_api.repositories.account_repository import AccountRepository, get_account_repository

logger = logging.getLogger(__name__)


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


def get_access_service(
    repository: AccountRepository = Depends(get_account_repository),
    settings: Settings = Depends(get_settings),
) -> AccessService:
    return AccessService(repository, settings.bootstrap_admin_email)
