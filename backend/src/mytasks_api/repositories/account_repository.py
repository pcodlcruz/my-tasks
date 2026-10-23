import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any, Concatenate, cast

from fastapi import Depends
from google.api_core import exceptions as google_exceptions
from google.cloud import firestore
from google.cloud.firestore_v1.async_aggregation import AsyncAggregationQuery
from google.cloud.firestore_v1.base_query import FieldFilter

from mytasks_api.domain.account import (
    Account,
    AccountNotFoundError,
    AccountStatus,
    Invitation,
    InvitationStatus,
    PendingInvitationLimitError,
    Role,
    reactivate_account,
    reinvite,
    revoke_account,
    revoke_invitation,
)
from mytasks_api.repositories.task_repository import get_firestore_client

USERS_COLLECTION = "users"
INVITATIONS_COLLECTION = "invitations"


def _transactional[**P, T](
    function: Callable[Concatenate[firestore.AsyncTransaction, P], Awaitable[T]],
) -> Callable[Concatenate[firestore.AsyncTransaction, P], Awaitable[T]]:
    """`firestore.async_transactional`, but with a new wrapper for every call.

    The library's wrapper keeps the ids of the running transaction on itself. One shared by
    concurrent requests (a module-level decorator is exactly that) hands the retry of one
    the id of another's transaction, which then waits on its locks until they time out.
    """

    async def run(
        transaction: firestore.AsyncTransaction, /, *args: P.args, **kwargs: P.kwargs
    ) -> T:
        return await firestore.async_transactional(function)(transaction, *args, **kwargs)

    return run


# Firestore aborts a transaction that loses a lock race (e.g. the same person opening two
# tabs on their first sign-in); the client library does not retry a read that aborts.
_MAX_ATTEMPTS = 4
_RETRY_DELAY_SECONDS = 0.05


def _lost_the_lock_race(error: Exception) -> bool:
    # The client retries a failed commit itself and, when its own attempts run out, raises a
    # ValueError wrapping the last Aborted: that is the same contention, not a bad request.
    if isinstance(error, google_exceptions.Aborted):
        return True
    return isinstance(error, ValueError) and isinstance(error.__cause__, google_exceptions.Aborted)


async def _retry_on_abort[T](operation: Callable[[], Awaitable[T]]) -> T:
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return await operation()
        except (google_exceptions.Aborted, ValueError) as error:
            if not _lost_the_lock_race(error) or attempt == _MAX_ATTEMPTS:
                raise
            await asyncio.sleep(_RETRY_DELAY_SECONDS * attempt)
    raise AssertionError  # unreachable: the last attempt returns or raises


def _document_to_account(uid: str, data: dict[str, Any]) -> Account:
    return Account(
        uid=uid,
        email=data["email"],
        role=Role(data["role"]),
        status=AccountStatus(data["status"]),
        created_at=data["created_at"],
        revoked_at=data.get("revoked_at"),
    )


def _account_to_document(account: Account) -> dict[str, Any]:
    return {
        "email": account.email,
        "role": account.role.value,
        "status": account.status.value,
        "created_at": account.created_at,
        "revoked_at": account.revoked_at,
    }


def _document_to_invitation(data: dict[str, Any]) -> Invitation:
    return Invitation(
        email=data["email"],
        status=InvitationStatus(data["status"]),
        invited_by=data["invited_by"],
        created_at=data["created_at"],
        accepted_at=data.get("accepted_at"),
        accepted_uid=data.get("accepted_uid"),
    )


def _invitation_to_document(invitation: Invitation) -> dict[str, Any]:
    return {
        "email": invitation.email,
        "status": invitation.status.value,
        "invited_by": invitation.invited_by,
        "created_at": invitation.created_at,
        "accepted_at": invitation.accepted_at,
        "accepted_uid": invitation.accepted_uid,
    }


@_transactional
async def _accept_invitation(
    transaction: firestore.AsyncTransaction,
    user_ref: firestore.AsyncDocumentReference,
    invitation_ref: firestore.AsyncDocumentReference,
    uid: str,
    email: str,
    now: datetime,
) -> tuple[Account, bool] | None:
    # Reads first, writes after: both documents are decided on the same snapshot, so an
    # invitation can only be accepted once even if two requests arrive together.
    user_snapshot = await user_ref.get(transaction=transaction)
    if user_snapshot.exists:
        return _document_to_account(uid, user_snapshot.to_dict() or {}), False

    invitation_snapshot = await invitation_ref.get(transaction=transaction)
    invitation = invitation_snapshot.to_dict() if invitation_snapshot.exists else None
    if invitation is None or invitation.get("status") != InvitationStatus.PENDING.value:
        return None

    account = Account(
        uid=uid,
        email=email,
        role=Role.USER,
        status=AccountStatus.ACTIVE,
        created_at=now,
        revoked_at=None,
    )
    transaction.update(
        invitation_ref,
        {
            "status": InvitationStatus.ACCEPTED.value,
            "accepted_at": now,
            "accepted_uid": uid,
        },
    )
    transaction.set(user_ref, _account_to_document(account))
    return account, True


@_transactional
async def _create_bootstrap_admin(
    transaction: firestore.AsyncTransaction,
    user_ref: firestore.AsyncDocumentReference,
    uid: str,
    email: str,
    now: datetime,
) -> tuple[Account, bool]:
    snapshot = await user_ref.get(transaction=transaction)
    if snapshot.exists:
        # Never replaces an account that already exists, whatever its role.
        return _document_to_account(uid, snapshot.to_dict() or {}), False

    account = Account(
        uid=uid,
        email=email,
        role=Role.ADMIN,
        status=AccountStatus.ACTIVE,
        created_at=now,
        revoked_at=None,
    )
    transaction.set(user_ref, _account_to_document(account))
    return account, True


@_transactional
async def _upsert_pending_invitation(
    transaction: firestore.AsyncTransaction,
    invitation_ref: firestore.AsyncDocumentReference,
    pending_count: AsyncAggregationQuery,
    email: str,
    invited_by: str,
    now: datetime,
    max_pending: int,
) -> tuple[Invitation, bool]:
    snapshot = await invitation_ref.get(transaction=transaction)
    data = snapshot.to_dict() if snapshot.exists else None
    if data is not None and data.get("status") == InvitationStatus.PENDING.value:
        # Already waiting: nothing changes, so the original date and author are kept.
        return _document_to_invitation(data), False

    # Counted inside the transaction, which locks the pending range: two invitations racing
    # for the last slot cannot both get it.
    counts = await pending_count.get(transaction=transaction)
    if counts[0][0].value >= max_pending:
        raise PendingInvitationLimitError

    if data is not None and data.get("status") == InvitationStatus.REVOKED.value:
        invitation = reinvite(_document_to_invitation(data), invited_by, now)
    else:
        # New address, or an accepted invitation whose account no longer exists.
        invitation = Invitation(
            email=email,
            status=InvitationStatus.PENDING,
            invited_by=invited_by,
            created_at=now,
            accepted_at=None,
            accepted_uid=None,
        )
    transaction.set(invitation_ref, _invitation_to_document(invitation))
    return invitation, True


@_transactional
async def _revoke_pending_invitation(
    transaction: firestore.AsyncTransaction,
    invitation_ref: firestore.AsyncDocumentReference,
) -> bool:
    snapshot = await invitation_ref.get(transaction=transaction)
    data = snapshot.to_dict() if snapshot.exists else None
    if data is None or data.get("status") != InvitationStatus.PENDING.value:
        return False
    revoked = revoke_invitation(_document_to_invitation(data))
    transaction.update(invitation_ref, {"status": revoked.status.value})
    return True


@_transactional
async def _revoke_account(
    transaction: firestore.AsyncTransaction,
    user_ref: firestore.AsyncDocumentReference,
    uid: str,
    now: datetime,
) -> tuple[Account, bool] | None:
    snapshot = await user_ref.get(transaction=transaction)
    data = snapshot.to_dict() if snapshot.exists else None
    if data is None:
        return None
    account = _document_to_account(uid, data)
    if account.status is AccountStatus.REVOKED:
        return account, False
    # Raises for an admin: the check lives in the domain, not in the endpoint.
    revoked = revoke_account(account, now)
    transaction.update(user_ref, {"status": revoked.status.value, "revoked_at": revoked.revoked_at})
    return revoked, True


@_transactional
async def _reactivate_account(
    transaction: firestore.AsyncTransaction,
    user_ref: firestore.AsyncDocumentReference,
    uid: str,
) -> Account:
    snapshot = await user_ref.get(transaction=transaction)
    data = snapshot.to_dict() if snapshot.exists else None
    if data is None:
        raise AccountNotFoundError(uid)
    restored = reactivate_account(_document_to_account(uid, data))
    transaction.update(user_ref, {"status": restored.status.value, "revoked_at": None})
    return restored


class AccountRepository:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _user_ref(self, uid: str) -> firestore.AsyncDocumentReference:
        ref: firestore.AsyncDocumentReference = self._client.collection(USERS_COLLECTION).document(
            uid
        )
        return ref

    def _invitation_ref(self, email: str) -> firestore.AsyncDocumentReference:
        ref: firestore.AsyncDocumentReference = self._client.collection(
            INVITATIONS_COLLECTION
        ).document(email)
        return ref

    async def get_account(self, uid: str) -> Account | None:
        snapshot = await self._user_ref(uid).get()
        data = snapshot.to_dict() if snapshot.exists else None
        if data is None:
            return None
        return _document_to_account(uid, data)

    async def accept_invitation(
        self, uid: str, email: str, now: datetime
    ) -> tuple[Account, bool] | None:
        """Turn a pending invitation into the account of `uid`.

        Returns the account and whether this call created it (False when a concurrent call
        already had), or None when there is nothing to accept.
        """
        return await _retry_on_abort(
            lambda: _accept_invitation(
                self._client.transaction(),
                self._user_ref(uid),
                self._invitation_ref(email),
                uid,
                email,
                now,
            )
        )

    async def create_bootstrap_admin(
        self, uid: str, email: str, now: datetime
    ) -> tuple[Account, bool]:
        return await _retry_on_abort(
            lambda: _create_bootstrap_admin(
                self._client.transaction(), self._user_ref(uid), uid, email, now
            )
        )

    async def find_account_by_email(self, email: str) -> Account | None:
        query = (
            self._client.collection(USERS_COLLECTION)
            .where(filter=FieldFilter("email", "==", email))
            .limit(1)
        )
        async for snapshot in query.stream():
            return _document_to_account(snapshot.id, snapshot.to_dict() or {})
        return None

    async def upsert_pending_invitation(
        self, email: str, invited_by: str, now: datetime, max_pending: int
    ) -> tuple[Invitation, bool]:
        """Leave a pending invitation for `email`. The flag says whether this call made it
        (False when one was already waiting, which is left untouched). Raises
        `PendingInvitationLimitError` when `max_pending` invitations are already waiting."""
        # The library's stubs declare the class itself as the return type of `count`.
        pending_count = cast(
            "AsyncAggregationQuery",
            self._client.collection(INVITATIONS_COLLECTION)
            .where(filter=FieldFilter("status", "==", InvitationStatus.PENDING.value))
            .count(alias="pending"),
        )
        return await _retry_on_abort(
            lambda: _upsert_pending_invitation(
                self._client.transaction(),
                self._invitation_ref(email),
                pending_count,
                email,
                invited_by,
                now,
                max_pending,
            )
        )

    async def revoke_pending_invitation(self, email: str) -> bool:
        return await _retry_on_abort(
            lambda: _revoke_pending_invitation(
                self._client.transaction(), self._invitation_ref(email)
            )
        )

    async def revoke_account(self, uid: str, now: datetime) -> tuple[Account, bool] | None:
        """Withdraw access, keeping the tasks. None if there is no such account; the flag
        says whether this call changed anything (revoking twice is a no-op)."""
        return await _retry_on_abort(
            lambda: _revoke_account(self._client.transaction(), self._user_ref(uid), uid, now)
        )

    async def reactivate_account(self, uid: str) -> Account:
        return await _retry_on_abort(
            lambda: _reactivate_account(self._client.transaction(), self._user_ref(uid), uid)
        )

    async def list_invitations(self, limit: int) -> list[Invitation]:
        query = (
            self._client.collection(INVITATIONS_COLLECTION)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        return [_document_to_invitation(s.to_dict() or {}) async for s in query.stream()]

    async def list_accounts(self, limit: int) -> list[Account]:
        query = (
            self._client.collection(USERS_COLLECTION)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        return [_document_to_account(s.id, s.to_dict() or {}) async for s in query.stream()]


def get_account_repository(
    client: firestore.AsyncClient = Depends(get_firestore_client),
) -> AccountRepository:
    return AccountRepository(client)
