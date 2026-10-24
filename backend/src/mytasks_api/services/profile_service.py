import logging

from fastapi import Depends

from mytasks_api.domain.profile import RESETTABLE_FIELDS, Profile
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
