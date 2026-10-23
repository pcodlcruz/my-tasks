from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from mytasks_api.domain.account import (
    MAX_EMAIL_LENGTH,
    Account,
    AccountStatus,
    Invitation,
    InvitationStatus,
    InviteOutcome,
    Role,
)


class MeOut(BaseModel):
    uid: str
    email: str
    role: Role


class InvitationIn(BaseModel):
    # Nothing but the address: the role is always `user` and the state is the server's, so
    # a body that tries to set either is rejected instead of silently ignored.
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=MAX_EMAIL_LENGTH)


class InvitationOut(BaseModel):
    email: str
    status: InvitationStatus
    created_at: datetime
    accepted_at: datetime | None

    @classmethod
    def from_invitation(cls, invitation: Invitation) -> "InvitationOut":
        return cls(
            email=invitation.email,
            status=invitation.status,
            created_at=invitation.created_at,
            accepted_at=invitation.accepted_at,
        )


class AccountOut(BaseModel):
    uid: str
    email: str
    role: Role
    status: AccountStatus
    created_at: datetime

    @classmethod
    def from_account(cls, account: Account) -> "AccountOut":
        return cls(
            uid=account.uid,
            email=account.email,
            role=account.role,
            status=account.status,
            created_at=account.created_at,
        )


class InviteResultOut(BaseModel):
    outcome: InviteOutcome
    email: str


class AccessListOut(BaseModel):
    invitations: list[InvitationOut]
    accounts: list[AccountOut]
