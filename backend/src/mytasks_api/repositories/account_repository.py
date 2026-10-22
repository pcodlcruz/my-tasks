import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from fastapi import Depends
from google.api_core import exceptions as google_exceptions
from google.cloud import firestore

from mytasks_api.domain.account import (
    Account,
    AccountStatus,
    InvitationStatus,
    Role,
)
from mytasks_api.repositories.task_repository import get_firestore_client

USERS_COLLECTION = "users"
INVITATIONS_COLLECTION = "invitations"

# Firestore aborts a transaction that loses a lock race (e.g. the same person opening two
# tabs on their first sign-in); the client library does not retry a read that aborts.
_MAX_ATTEMPTS = 4
_RETRY_DELAY_SECONDS = 0.05


async def _retry_on_abort[T](operation: Callable[[], Awaitable[T]]) -> T:
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return await operation()
        except google_exceptions.Aborted:
            if attempt == _MAX_ATTEMPTS:
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


@firestore.async_transactional
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


@firestore.async_transactional
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


def get_account_repository(
    client: firestore.AsyncClient = Depends(get_firestore_client),
) -> AccountRepository:
    return AccountRepository(client)
