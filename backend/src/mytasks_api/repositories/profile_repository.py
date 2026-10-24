from datetime import UTC, datetime
from enum import Enum
from typing import Any

from fastapi import Depends
from google.cloud import firestore

from mytasks_api.domain.profile import (
    RESETTABLE_FIELDS,
    AvatarChoice,
    Profile,
    choose_avatar,
    default_profile,
    profile_from_document,
)
from mytasks_api.repositories.account_repository import _retry_on_abort, _transactional
from mytasks_api.repositories.task_repository import get_firestore_client

USERS_COLLECTION = "users"
SETTINGS_COLLECTION = "settings"
PROFILE_DOCUMENT = "profile"
AVATAR_DOCUMENT = "avatar"


def _reset_document() -> dict[str, Any]:
    defaults = default_profile()
    values: dict[str, Any] = {}
    for name in RESETTABLE_FIELDS:
        value = getattr(defaults, name)
        values[name] = value.value if isinstance(value, Enum) else value
    return values


@_transactional
async def _apply_avatar_choice(
    transaction: firestore.AsyncTransaction,
    profile_ref: firestore.AsyncDocumentReference,
    avatar_ref: firestore.AsyncDocumentReference,
    fields: dict[str, Any],
    choice: AvatarChoice,
) -> Profile:
    snapshot = await profile_ref.get(transaction=transaction)
    current = profile_from_document(snapshot.to_dict() or {})
    avatar = choose_avatar(current.avatar, choice)
    document = {
        **fields,
        "avatar_kind": avatar.kind.value,
        "avatar_preset": avatar.preset,
        "avatar_version": avatar.version,
        "updated_at": datetime.now(UTC),
    }
    transaction.set(profile_ref, document, merge=True)
    if current.avatar.has_uploaded_image:
        # An image nobody uses must not be kept (FR-020).
        transaction.delete(avatar_ref)
    return profile_from_document({**(snapshot.to_dict() or {}), **document})


class ProfileRepository:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _settings(self, uid: str) -> firestore.AsyncCollectionReference:
        collection: firestore.AsyncCollectionReference = (
            self._client.collection(USERS_COLLECTION).document(uid).collection(SETTINGS_COLLECTION)
        )
        return collection

    def _profile_ref(self, uid: str) -> firestore.AsyncDocumentReference:
        return self._settings(uid).document(PROFILE_DOCUMENT)

    async def get(self, uid: str) -> Profile:
        snapshot = await self._profile_ref(uid).get()
        return profile_from_document(snapshot.to_dict() or {})

    async def update(
        self, uid: str, fields: dict[str, Any], avatar: AvatarChoice | None
    ) -> Profile:
        profile_ref = self._profile_ref(uid)
        if avatar is not None:
            avatar_ref = self._settings(uid).document(AVATAR_DOCUMENT)
            # Two tabs choosing an avatar at once lose a lock race: retry, as the accounts do.
            return await _retry_on_abort(
                lambda: _apply_avatar_choice(
                    self._client.transaction(), profile_ref, avatar_ref, fields, avatar
                )
            )
        # One write for every field sent: they are all applied or none is.
        await profile_ref.set({**fields, "updated_at": datetime.now(UTC)}, merge=True)
        return await self.get(uid)

    async def reset(self, uid: str) -> Profile:
        await self._profile_ref(uid).set(
            {**_reset_document(), "updated_at": datetime.now(UTC)}, merge=True
        )
        return await self.get(uid)


def get_profile_repository(
    client: firestore.AsyncClient = Depends(get_firestore_client),
) -> ProfileRepository:
    return ProfileRepository(client)
