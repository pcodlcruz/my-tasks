import logging
from dataclasses import dataclass

from fastapi import Depends

from mytasks_api.clock import Clock, get_clock
from mytasks_api.domain.profile import Profile
from mytasks_api.domain.progress import (
    InvalidMissionError,
    PlayerState,
    ProgressDay,
    TodayView,
    day_key,
    open_day,
    today_view,
)
from mytasks_api.logging_config import log_event
from mytasks_api.repositories.profile_repository import ProfileRepository, get_profile_repository
from mytasks_api.repositories.progress_repository import (
    ProgressRepository,
    get_progress_repository,
)
from mytasks_api.services.task_service import day_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProgressSnapshot:
    """Everything `ProgressOut` is built from (contracts/progress.yaml)."""

    profile: Profile
    today: TodayView
    state: PlayerState
    last_day: ProgressDay | None


class ProgressService:
    def __init__(
        self, repository: ProgressRepository, profiles: ProfileRepository, clock: Clock
    ) -> None:
        self._repository = repository
        self._profiles = profiles
        self._clock = clock

    async def _context(self, uid: str) -> tuple[Profile, str]:
        profile = await self._profiles.get(uid)
        return profile, day_key(self._clock.now(), profile.effective_timezone)

    async def get_progress(self, uid: str) -> ProgressSnapshot:
        """Today's scoreboard. First closes the days left behind (the lazy catch-up of research
        R1): repeating the call changes nothing."""
        profile, today = await self._context(uid)
        state = await self._repository.close_days(
            uid, day_settings(profile), today, self._clock.now()
        )
        day = await self._repository.get_day(uid, today)
        return await self._build(uid, profile, today, state, day)

    async def _build(
        self, uid: str, profile: Profile, today: str, state: PlayerState, day: ProgressDay | None
    ) -> ProgressSnapshot:
        current = open_day(day, today, day_settings(profile))
        last_day = (
            await self._repository.get_day(uid, state.last_active_closed_day)
            if state.last_active_closed_day is not None
            else None
        )
        return ProgressSnapshot(
            profile=profile,
            today=today_view(current, state, morning_review=profile.morning_review),
            state=state,
            last_day=last_day,
        )

    async def mark_review_seen(self, uid: str) -> ProgressSnapshot:
        profile, today = await self._context(uid)
        day = await self._repository.mark_review_seen(
            uid, today, day_settings(profile), self._clock.now()
        )
        state = await self._repository.get_state(uid)
        return await self._build(uid, profile, today, state, day)

    async def set_mission(self, uid: str, task_ids: list[str]) -> ProgressSnapshot:
        profile, today = await self._context(uid)
        try:
            day = await self._repository.set_mission(
                uid, task_ids, today, day_settings(profile), self._clock.now()
            )
        except InvalidMissionError:
            log_event(logger, logging.WARNING, "progress_mission_rejected", uid=uid, day=today)
            raise
        log_event(
            logger,
            logging.INFO,
            "progress_mission_set",
            uid=uid,
            day=today,
            count=str(len(task_ids)),
        )
        state = await self._repository.get_state(uid)
        return await self._build(uid, profile, today, state, day)

    async def acknowledge(
        self, uid: str, announcement_ids: list[str], notice_ids: list[str]
    ) -> None:
        await self._repository.acknowledge(uid, announcement_ids, notice_ids, self._clock.now())
        log_event(
            logger,
            logging.INFO,
            "progress_ack",
            uid=uid,
            count=str(len(announcement_ids) + len(notice_ids)),
        )


def get_progress_service(
    repository: ProgressRepository = Depends(get_progress_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    clock: Clock = Depends(get_clock),
) -> ProgressService:
    return ProgressService(repository, profiles, clock)
