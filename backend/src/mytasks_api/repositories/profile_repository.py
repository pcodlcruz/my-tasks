import asyncio
import weakref
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from fastapi import Depends
from google.cloud import firestore

from mytasks_api.domain.profile import (
    RESETTABLE_FIELDS,
    AvatarChoice,
    AvatarKind,
    Profile,
    UploadWindow,
    choose_avatar,
    default_profile,
    profile_from_document,
    register_upload,
)
from mytasks_api.repositories.account_repository import _retry_on_abort, _transactional
from mytasks_api.repositories.task_repository import get_firestore_client

USERS_COLLECTION = "users"
SETTINGS_COLLECTION = "settings"
PROFILE_DOCUMENT = "profile"
AVATAR_DOCUMENT = "avatar"


# One lock per person, held while that person's avatar changes. Two tabs (or a double click) on
# the same instance would otherwise race for the same document inside Firestore transactions,
# and the loser only learns it lost after a lock timeout. Serialized here, the second change
# simply runs after the first. Weak references: a person's lock disappears once nobody holds it.
# Other instances can still contend, which the transaction retry already handles.
_PERSON_LOCKS: weakref.WeakValueDictionary[str, asyncio.Lock] = weakref.WeakValueDictionary()


def _person_lock(uid: str) -> asyncio.Lock:
    lock = _PERSON_LOCKS.get(uid)
    if lock is None:
        lock = asyncio.Lock()
        _PERSON_LOCKS[uid] = lock
    return lock


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


def _window_from_document(raw: object) -> UploadWindow | None:
    if not isinstance(raw, dict):
        return None
    start, count = raw.get("window_start"), raw.get("count")
    if not isinstance(start, datetime) or not isinstance(count, int):
        return None
    return UploadWindow(window_start=start, count=count)


@_transactional
async def _apply_avatar_upload(
    transaction: firestore.AsyncTransaction,
    profile_ref: firestore.AsyncDocumentReference,
    avatar_ref: firestore.AsyncDocumentReference,
    image: bytes,
    now: datetime,
) -> Profile:
    snapshot = await profile_ref.get(transaction=transaction)
    data = snapshot.to_dict() or {}
    current = profile_from_document(data)
    # Raises when the hour's limit is used up, before anything is written.
    window = register_upload(_window_from_document(data.get("avatar_uploads")), now)
    document = {
        "avatar_kind": AvatarKind.UPLOAD.value,
        "avatar_preset": None,
        "avatar_version": current.avatar.version + 1,
        "avatar_uploads": {"window_start": window.window_start, "count": window.count},
        "updated_at": now,
    }
    # The profile, the counter and the image change together or not at all; replacing the whole
    # avatar document (no merge) is what keeps a single image per person.
    transaction.set(profile_ref, document, merge=True)
    transaction.set(
        avatar_ref,
        {"data": image, "content_type": "image/webp", "size": len(image), "updated_at": now},
    )
    return profile_from_document({**data, **document})


@_transactional
async def _apply_avatar_removal(
    transaction: firestore.AsyncTransaction,
    profile_ref: firestore.AsyncDocumentReference,
    avatar_ref: firestore.AsyncDocumentReference,
) -> Profile:
    snapshot = await profile_ref.get(transaction=transaction)
    avatar_snapshot = await avatar_ref.get(transaction=transaction)
    data = snapshot.to_dict() or {}
    current = profile_from_document(data)
    if current.avatar.kind is AvatarKind.INITIALS and not avatar_snapshot.exists:
        return current  # nothing to remove: the call is idempotent and changes no version
    document = {
        "avatar_kind": AvatarKind.INITIALS.value,
        "avatar_preset": None,
        "avatar_version": current.avatar.version + 1,
        "updated_at": datetime.now(UTC),
    }
    transaction.set(profile_ref, document, merge=True)
    if avatar_snapshot.exists:
        transaction.delete(avatar_ref)
    return profile_from_document({**data, **document})


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
            # Changes of the same person queue up here; a lost lock race against another
            # instance is retried, as the accounts do.
            async with _person_lock(uid):
                return await _retry_on_abort(
                    lambda: _apply_avatar_choice(
                        self._client.transaction(), profile_ref, avatar_ref, fields, avatar
                    )
                )
        # One write for every field sent: they are all applied or none is.
        await profile_ref.set({**fields, "updated_at": datetime.now(UTC)}, merge=True)
        return await self.get(uid)

    async def upload_avatar(self, uid: str, image: bytes, now: datetime) -> Profile:
        profile_ref = self._profile_ref(uid)
        avatar_ref = self._settings(uid).document(AVATAR_DOCUMENT)
        async with _person_lock(uid):
            return await _retry_on_abort(
                lambda: _apply_avatar_upload(
                    self._client.transaction(), profile_ref, avatar_ref, image, now
                )
            )

    async def get_avatar(self, uid: str) -> bytes | None:
        snapshot = await self._settings(uid).document(AVATAR_DOCUMENT).get()
        data = snapshot.to_dict() if snapshot.exists else None
        image = data.get("data") if data else None
        return bytes(image) if image is not None else None

    async def remove_avatar(self, uid: str) -> Profile:
        profile_ref = self._profile_ref(uid)
        avatar_ref = self._settings(uid).document(AVATAR_DOCUMENT)
        async with _person_lock(uid):
            return await _retry_on_abort(
                lambda: _apply_avatar_removal(self._client.transaction(), profile_ref, avatar_ref)
            )

    async def reset(self, uid: str) -> Profile:
        await self._profile_ref(uid).set(
            {**_reset_document(), "updated_at": datetime.now(UTC)}, merge=True
        )
        return await self.get(uid)


def get_profile_repository(
    client: firestore.AsyncClient = Depends(get_firestore_client),
) -> ProfileRepository:
    return ProfileRepository(client)
