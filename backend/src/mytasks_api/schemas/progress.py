from datetime import datetime
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from mytasks_api.domain.progress import (
    ACHIEVEMENTS,
    MAX_ANNOUNCEMENTS,
    MAX_MISSION_TASKS,
    MAX_NOTICES,
    AnnouncementKind,
    PlayerState,
    ProgressDay,
    level_for,
    next_level_threshold,
)
from mytasks_api.schemas.task import TaskOut
from mytasks_api.services.progress_service import (
    DayDetailSnapshot,
    DaysSnapshot,
    ProgressSnapshot,
    StatsSnapshot,
)


def _not_reserved(value: str) -> str:
    # Firestore rejects ids like `__x__` with an error of its own: refused here instead.
    if value.startswith("__") and value.endswith("__"):
        message = "El identificador de tarea no es válido."
        raise ValueError(message)
    return value


# Same shape as a task id (routers/tasks.py): Firestore's alphanumeric ids, never a reserved one.
# Pydantic's regex engine has no look-ahead, hence the separate check.
TaskIdIn = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,128}$"), AfterValidator(_not_reserved)]
MessageIdIn = Annotated[str, Field(min_length=1, max_length=64)]


class MissionOut(BaseModel):
    task_ids: list[str]
    completed_ids: list[str]
    cleared: bool


class ArcadeOut(BaseModel):
    score: int = Field(ge=0)
    level: int = Field(ge=1)
    level_name: str
    next_level_at: int | None
    points_today: int


class ProgressDayOut(BaseModel):
    date: str
    active: bool
    goal: int
    completed_count: int
    goal_met: bool
    mission_cleared: bool
    points: int | None
    closed: bool

    @classmethod
    def from_day(cls, day: ProgressDay, *, arcade_mode: bool) -> "ProgressDayOut":
        return cls(
            date=day.date,
            active=day.active,
            goal=day.goal,
            completed_count=day.completed_count,
            goal_met=day.goal_met,
            mission_cleared=day.mission_cleared,
            points=day.points if arcade_mode else None,
            closed=day.closed,
        )


class ProgressDayDetailOut(ProgressDayOut):
    # Only the tasks that still exist outside the trash (FR-029).
    tasks: list[TaskOut]

    @classmethod
    def from_snapshot(cls, snapshot: DayDetailSnapshot) -> "ProgressDayDetailOut":
        base = ProgressDayOut.from_day(snapshot.day, arcade_mode=snapshot.profile.arcade_mode)
        return cls(**base.model_dump(), tasks=[TaskOut.from_task(task) for task in snapshot.tasks])


class ProgressDaysOut(BaseModel):
    items: list[ProgressDayOut]

    @classmethod
    def from_snapshot(cls, snapshot: DaysSnapshot) -> "ProgressDaysOut":
        arcade_mode = snapshot.profile.arcade_mode
        return cls(
            items=[ProgressDayOut.from_day(day, arcade_mode=arcade_mode) for day in snapshot.days]
        )


class AchievementOut(BaseModel):
    id: str
    name: str
    condition: str
    unlocked_at: datetime | None


class StatsArcadeOut(BaseModel):
    score: int
    level: int
    level_name: str
    achievements: list[AchievementOut]


class StatsOut(BaseModel):
    best_day_count: int
    best_day_date: str | None
    current_streak: int
    best_streak: int
    tasks_scored: int
    started_at: datetime | None
    arcade: StatsArcadeOut | None

    @classmethod
    def from_snapshot(cls, snapshot: StatsSnapshot) -> "StatsOut":
        state = snapshot.state
        level = level_for(state.score)
        return cls(
            best_day_count=state.best_day_count,
            best_day_date=state.best_day_date,
            current_streak=state.current_streak,
            best_streak=state.best_streak,
            tasks_scored=state.tasks_scored,
            started_at=state.started_at,
            arcade=(
                StatsArcadeOut(
                    score=state.score,
                    level=level.number,
                    level_name=level.name,
                    # The whole catalog, with the date of those already won.
                    achievements=[
                        AchievementOut(
                            id=item.id,
                            name=item.name,
                            condition=item.condition,
                            unlocked_at=state.achievements.get(item.id),
                        )
                        for item in ACHIEVEMENTS
                    ],
                )
                if snapshot.profile.arcade_mode
                else None
            ),
        )


class AnnouncementOut(BaseModel):
    id: str
    kind: AnnouncementKind
    value: str | int | None


class NoticeOut(BaseModel):
    id: str
    kind: str = "schedule_skipped_limit"
    schedule_id: str
    schedule_title: str | None = None
    day: str


class ProgressOut(BaseModel):
    today: str
    goal: int
    completed_count: int
    goal_met: bool
    is_active_day: bool
    mission: MissionOut
    show_review: bool
    streak: int
    streak_at_stake: bool
    arcade: ArcadeOut | None
    last_day: ProgressDayOut | None
    announcements: list[AnnouncementOut]
    notices: list[NoticeOut]

    @classmethod
    def from_snapshot(cls, snapshot: ProgressSnapshot) -> "ProgressOut":
        day, state = snapshot.today.day, snapshot.state
        arcade_mode = snapshot.profile.arcade_mode
        return cls(
            today=day.date,
            goal=day.goal,
            completed_count=day.completed_count,
            goal_met=day.goal_met,
            is_active_day=day.active,
            mission=MissionOut(
                task_ids=list(day.mission_task_ids),
                completed_ids=list(day.mission_completed_ids),
                cleared=day.mission_cleared,
            ),
            show_review=snapshot.today.show_review,
            streak=snapshot.today.streak,
            streak_at_stake=snapshot.today.streak_at_stake,
            arcade=_arcade(state, day) if arcade_mode else None,
            last_day=(
                ProgressDayOut.from_day(snapshot.last_day, arcade_mode=arcade_mode)
                if snapshot.last_day is not None
                else None
            ),
            # Kept while the arcade mode is off, to be shown if it comes back (FR-018).
            announcements=(
                [
                    AnnouncementOut(id=item.id, kind=item.kind, value=item.value)
                    for item in state.announcements
                ]
                if arcade_mode
                else []
            ),
            notices=[
                NoticeOut(
                    id=item.id,
                    schedule_id=item.schedule_id,
                    schedule_title=snapshot.notice_titles.get(item.schedule_id),
                    day=item.day,
                )
                for item in state.notices
            ],
        )


def _arcade(state: PlayerState, day: ProgressDay) -> ArcadeOut:
    level = level_for(state.score)
    return ArcadeOut(
        score=state.score,
        level=level.number,
        level_name=level.name,
        next_level_at=next_level_threshold(state.score),
        points_today=day.points,
    )


class MissionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_ids: list[TaskIdIn] = Field(max_length=MAX_MISSION_TASKS)


class AckIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    announcement_ids: list[MessageIdIn] = Field(default_factory=list, max_length=MAX_ANNOUNCEMENTS)
    notice_ids: list[MessageIdIn] = Field(default_factory=list, max_length=MAX_NOTICES)

    @model_validator(mode="after")
    def _require_something(self) -> Self:
        if not self.model_fields_set:
            message = "Indica al menos un anuncio o un aviso que confirmar."
            raise ValueError(message)
        return self
