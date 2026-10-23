import re
from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum

MAX_EMAIL_LENGTH = 254

# Deliberately simple: the real proof of an address is that Google verified it in the ID
# token. This only rejects what can never be a mailbox, and what could not be a document id.
_EMAIL_PATTERN = re.compile(r"[^@\s/]+@[^@\s/]+\.[^@\s/]+")


class Role(StrEnum):
    USER = "user"
    ADMIN = "admin"


class AccountStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"


class AccessDeniedError(Exception):
    """The caller has no active account, or lacks the role the operation needs."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class InvalidEmailError(ValueError):
    pass


class InvitationNotPendingError(Exception):
    pass


class AdminAccountProtectedError(Exception):
    """Administrators cannot be revoked, so the last one can never be lost."""


class AccountAlreadyActiveError(Exception):
    """The address already belongs to an account with access; there is nothing to invite."""


class AccountNotFoundError(Exception):
    pass


class InvitationNotFoundError(Exception):
    """There is no pending invitation for that address (missing, accepted or revoked)."""


class InviteOutcome(StrEnum):
    INVITED = "invited"
    ALREADY_PENDING = "already_pending"
    REACTIVATED = "reactivated"


@dataclass(frozen=True)
class Account:
    uid: str
    email: str
    role: Role
    status: AccountStatus
    created_at: datetime
    revoked_at: datetime | None


@dataclass(frozen=True)
class Invitation:
    email: str
    status: InvitationStatus
    invited_by: str
    created_at: datetime
    accepted_at: datetime | None
    accepted_uid: str | None


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > MAX_EMAIL_LENGTH or _EMAIL_PATTERN.fullmatch(email) is None:
        message = "El correo no tiene un formato válido."
        raise InvalidEmailError(message)
    return email


def accept_invitation(invitation: Invitation, uid: str, now: datetime) -> Invitation:
    _ensure_pending(invitation)
    return replace(invitation, status=InvitationStatus.ACCEPTED, accepted_at=now, accepted_uid=uid)


def revoke_invitation(invitation: Invitation) -> Invitation:
    _ensure_pending(invitation)
    return replace(invitation, status=InvitationStatus.REVOKED)


def reinvite(invitation: Invitation, invited_by: str, now: datetime) -> Invitation:
    if invitation.status is not InvitationStatus.REVOKED:
        raise InvitationNotPendingError
    return replace(
        invitation,
        status=InvitationStatus.PENDING,
        invited_by=invited_by,
        created_at=now,
        accepted_at=None,
        accepted_uid=None,
    )


def revoke_account(account: Account, now: datetime) -> Account:
    if account.role is Role.ADMIN:
        raise AdminAccountProtectedError
    return replace(account, status=AccountStatus.REVOKED, revoked_at=now)


def reactivate_account(account: Account) -> Account:
    return replace(account, status=AccountStatus.ACTIVE, revoked_at=None)


def _ensure_pending(invitation: Invitation) -> None:
    if invitation.status is not InvitationStatus.PENDING:
        raise InvitationNotPendingError
