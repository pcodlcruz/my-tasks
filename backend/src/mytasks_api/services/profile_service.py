import asyncio
import logging
from datetime import UTC, datetime

from fastapi import Depends

from mytasks_api.domain.avatar_image import process_avatar
from mytasks_api.domain.profile import RESETTABLE_FIELDS, AvatarNotFoundError, Profile
from mytasks_api.logging_config import log_event
from mytasks_api.repositories.profile_repository import (
    ProfileRepository,
    get_profile_repository,
)
from mytasks_api.schemas.profile import ProfileUpdateIn

logger = logging.getLogger(__name__)


def _field_names(names: set[str] | tuple[str, ...]) -> str:
    # Only names, never values: the display name is personal data and stays out of the log.
    return ",".join(sorted(names))


class ProfileService:
    def __init__(self, repository: ProfileRepository) -> None:
        self._repository = repository

    async def get_profile(self, uid: str) -> Profile:
        return await self._repository.get(uid)

    async def update_profile(self, uid: str, data: ProfileUpdateIn) -> Profile:
        fields = data.stored_fields()
        avatar = data.avatar_choice()
        profile = await self._repository.update(uid, fields, avatar)
        changed = set(fields) | ({"avatar"} if avatar is not None else set())
        log_event(logger, logging.INFO, "profile_updated", uid=uid, fields=_field_names(changed))
        return profile

    async def upload_avatar(self, uid: str, data: bytes) -> Profile:
        # Decoding can take a moment for a large picture: off the event loop. A file that is
        # rejected never reaches the database, so it neither counts for the limit nor touches
        # the current avatar.
        image = await asyncio.to_thread(process_avatar, data)
        profile = await self._repository.upload_avatar(uid, image, datetime.now(UTC))
        # The final size only: never the content, the file name or its metadata.
        log_event(logger, logging.INFO, "avatar_uploaded", uid=uid, size=str(len(image)))
        return profile

    async def get_avatar(self, uid: str) -> bytes:
        image = await self._repository.get_avatar(uid)
        if image is None:
            raise AvatarNotFoundError(uid)
        return image

    async def remove_avatar(self, uid: str) -> Profile:
        profile = await self._repository.remove_avatar(uid)
        log_event(logger, logging.INFO, "avatar_removed", uid=uid)
        return profile

    async def reset_profile(self, uid: str) -> Profile:
        profile = await self._repository.reset(uid)
        log_event(
            logger, logging.INFO, "profile_reset", uid=uid, fields=_field_names(RESETTABLE_FIELDS)
        )
        return profile


def get_profile_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> ProfileService:
    return ProfileService(repository)
