"""Daily progress and the arcade layer (feature 007).

Pure rules, no I/O: the repository reads the task, today's progress day and the player state,
calls one of these functions and writes back what they return, all in one transaction
(research R4). Days are progress days: from 04:00 to 03:59 in the person's time zone, named by
the date they start on (`YYYY-MM-DD`).
"""

import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Any
from zoneinfo import ZoneInfo

DAY_START_HOUR = 4

POINTS_PER_TASK = 100
PHASE_BONUS = 500
MISSION_TASK_POINTS = 50
MISSION_BONUS = 300

MAX_MISSION_TASKS = 5
MAX_ANNOUNCEMENTS = 20
MAX_NOTICES = 20
# The calendar shows 12 weeks: days further back than this are never created when closing.
MAX_DAYS_TO_CLOSE = 84
# The "new record" announcement shows for any record beaten; the achievement needs this many.
RECORD_ACHIEVEMENT_MIN_TASKS = 5


class AnnouncementKind(StrEnum):
    PHASE_CLEAR = "phase_clear"
    MISSION_CLEAR = "mission_clear"
    LEVEL_UP = "level_up"
    ACHIEVEMENT = "achievement"
    NEW_RECORD = "new_record"


class InvalidMissionError(ValueError):
    pass


# The calendar shows 12 weeks (FR-028); a wider range is refused so a read stays bounded.
MAX_DAYS_RANGE = 84


class InvalidDayRangeError(ValueError):
    pass


class ProgressDayNotFoundError(Exception):
    """No day with that date for this account, or not a date at all: both look the same."""


def check_day_range(start: date, end: date) -> None:
    if start > end:
        message = "La fecha inicial no puede ser posterior a la final."
        raise InvalidDayRangeError(message)
    if (end - start).days + 1 > MAX_DAYS_RANGE:
        message = f"El rango no puede superar {MAX_DAYS_RANGE} días."
        raise InvalidDayRangeError(message)


@dataclass(frozen=True)
class Level:
    number: int
    threshold: int
    name: str


LEVELS = (
    Level(1, 0, "Novato"),
    Level(2, 1_000, "Aprendiz"),
    Level(3, 3_000, "Jugador"),
    Level(4, 6_000, "Veterano"),
    Level(5, 10_000, "Experto"),
    Level(6, 16_000, "Maestro"),
    Level(7, 25_000, "Campeón"),
    Level(8, 40_000, "Leyenda"),
    Level(9, 60_000, "Mito"),
    Level(10, 90_000, "Jefe final"),
)


@dataclass(frozen=True)
class Achievement:
    id: str
    name: str
    condition: str


ACHIEVEMENTS = (
    Achievement("first_coin", "Primera moneda", "Completa tu primera tarea."),
    Achievement("stage_clear", "Fase superada", "Cumple tu meta diaria por primera vez."),
    Achievement("mission_clear", "Misión cumplida", "Completa todas las tareas de una misión."),
    Achievement("streak_3", "Racha de 3", "Cumple la meta 3 días activos seguidos."),
    Achievement("streak_7", "Racha de 7", "Cumple la meta 7 días activos seguidos."),
    Achievement("streak_30", "Racha de 30", "Cumple la meta 30 días activos seguidos."),
    Achievement("tasks_10", "10 tareas", "Completa 10 tareas distintas."),
    Achievement("tasks_100", "100 tareas", "Completa 100 tareas distintas."),
    Achievement("tasks_500", "500 tareas", "Completa 500 tareas distintas."),
    Achievement(
        "do_now_clear",
        "Sin urgencias",
        "Completa una tarea de «Hacer ahora» y deja ese cuadrante vacío.",
    ),
    Achievement("scheduled_done", "Puntual", "Completa una tarea programada."),
    Achievement(
        "new_record",
        "Nuevo récord",
        f"Supera tu mejor día con al menos {RECORD_ACHIEVEMENT_MIN_TASKS} tareas.",
    ),
)
ACHIEVEMENT_IDS = frozenset(achievement.id for achievement in ACHIEVEMENTS)

_STREAK_ACHIEVEMENTS = ((3, "streak_3"), (7, "streak_7"), (30, "streak_30"))
_TASK_COUNT_ACHIEVEMENTS = ((10, "tasks_10"), (100, "tasks_100"), (500, "tasks_500"))


def level_for(score: int) -> Level:
    current = LEVELS[0]
    for level in LEVELS:
        if score >= level.threshold:
            current = level
    return current


def next_level_threshold(score: int) -> int | None:
    number = level_for(score).number
    return LEVELS[number].threshold if number < len(LEVELS) else None


def day_key(now: datetime, timezone: str) -> str:
    """The progress day `now` belongs to. Wall-clock arithmetic on the local time, so a change
    of daylight saving time never moves the 04:00 cut."""
    local = now.astimezone(ZoneInfo(timezone))
    return (local - timedelta(hours=DAY_START_HOUR)).date().isoformat()


def is_active(day: str, weekdays: Iterable[int]) -> bool:
    return date.fromisoformat(day).isoweekday() in set(weekdays)


def _shift(day: str, days: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=days)).isoformat()


@dataclass(frozen=True)
class DaySettings:
    """What the day needs from the profile: the goal and the active weekdays in force."""

    goal: int
    active_weekdays: tuple[int, ...]


@dataclass(frozen=True)
class ProgressDay:
    date: str
    active: bool
    goal: int
    completed_task_ids: tuple[str, ...] = ()
    mission_task_ids: tuple[str, ...] = ()
    mission_completed_ids: tuple[str, ...] = ()
    phase_bonus: bool = False
    mission_bonus: bool = False
    # Whether the bonus was already celebrated today. A bonus lost by a reopen and won again is
    # only announced again if the first announcement had not been seen yet (research R9).
    phase_announced: bool = False
    mission_announced: bool = False
    points: int = 0
    review_seen: bool = False
    closed: bool = False

    @property
    def completed_count(self) -> int:
        return len(self.completed_task_ids)

    @property
    def goal_met(self) -> bool:
        return self.completed_count >= self.goal

    @property
    def mission_cleared(self) -> bool:
        return bool(self.mission_task_ids) and set(self.mission_task_ids) <= set(
            self.mission_completed_ids
        )


def new_day(day: str, settings: DaySettings) -> ProgressDay:
    return ProgressDay(
        date=day, active=is_active(day, settings.active_weekdays), goal=settings.goal
    )


def open_day(existing: ProgressDay | None, day: str, settings: DaySettings) -> ProgressDay:
    """Today's day with the settings in force: while a day is open its goal and whether it is
    active follow the profile; once closed they never change (FR-006)."""
    if existing is None:
        return new_day(day, settings)
    if existing.closed:
        return existing
    return replace(existing, goal=settings.goal, active=is_active(day, settings.active_weekdays))


@dataclass(frozen=True)
class Announcement:
    id: str
    kind: AnnouncementKind
    value: str | int | None
    day: str
    created_at: datetime


@dataclass(frozen=True)
class Notice:
    id: str
    schedule_id: str
    day: str


@dataclass(frozen=True)
class PlayerState:
    score: int = 0
    max_level_announced: int = 1
    current_streak: int = 0
    best_streak: int = 0
    best_day_count: int = 0
    best_day_date: str | None = None
    tasks_scored: int = 0
    last_closed_day: str | None = None
    last_active_closed_day: str | None = None
    record_announced_on: str | None = None
    achievements: Mapping[str, datetime] = field(default_factory=dict)
    announcements: tuple[Announcement, ...] = ()
    notices: tuple[Notice, ...] = ()
    started_at: datetime | None = None


@dataclass(frozen=True)
class TaskFacts:
    """What the rules need to know about the task that changes."""

    id: str
    completed_day: str | None
    points_awarded_on: str | None
    is_do_now: bool = False
    is_scheduled: bool = False


@dataclass(frozen=True)
class Outcome:
    day: ProgressDay
    state: PlayerState
    # The task's new `completed_day` and `points_awarded_on`.
    completed_day: str | None
    points_awarded_on: str | None


class _Tally:
    """Collects what one change adds to the state before it is frozen again."""

    def __init__(self, state: PlayerState, now: datetime, today: str) -> None:
        self.state = state
        self.now = now
        self.today = today
        self.points = 0
        self.achievements = dict(state.achievements)
        self.announcements = list(state.announcements)

    def announce(self, kind: AnnouncementKind, value: str | int | None = None) -> None:
        self.announcements.append(
            Announcement(
                id=uuid.uuid4().hex, kind=kind, value=value, day=self.today, created_at=self.now
            )
        )

    def withdraw(self, kind: AnnouncementKind) -> bool:
        """Drop a pending announcement of a bonus taken back; `True` if it was still pending
        (never seen), `False` if it had already been acknowledged."""
        kept = [
            item
            for item in self.announcements
            if not (item.kind is kind and item.day == self.today)
        ]
        removed = len(kept) != len(self.announcements)
        self.announcements = kept
        return removed

    def unlock(self, achievement_id: str) -> None:
        if achievement_id in self.achievements:
            return
        self.achievements[achievement_id] = self.now
        self.announce(AnnouncementKind.ACHIEVEMENT, achievement_id)

    def freeze(self, **changes: Any) -> PlayerState:
        score = max(0, self.state.score + self.points)
        state = replace(
            self.state,
            score=score,
            achievements=self.achievements,
            started_at=self.state.started_at or self.now,
            **changes,
        )
        level = level_for(score).number
        if level > state.max_level_announced:
            self.announce(AnnouncementKind.LEVEL_UP, level)
            state = replace(state, max_level_announced=level)
        return replace(state, announcements=tuple(self.announcements[-MAX_ANNOUNCEMENTS:]))


def _grant_bonuses(day: ProgressDay, before: ProgressDay, tally: _Tally) -> ProgressDay:
    if day.goal_met and not before.phase_bonus:
        tally.points += PHASE_BONUS
        if not day.phase_announced:
            tally.announce(AnnouncementKind.PHASE_CLEAR, PHASE_BONUS)
        tally.unlock("stage_clear")
        day = replace(day, phase_bonus=True, phase_announced=True)
    if day.mission_cleared and not before.mission_bonus:
        tally.points += MISSION_BONUS
        if not day.mission_announced:
            tally.announce(AnnouncementKind.MISSION_CLEAR, MISSION_BONUS)
        tally.unlock("mission_clear")
        day = replace(day, mission_bonus=True, mission_announced=True)
    return day


def apply_complete(
    task: TaskFacts,
    day: ProgressDay,
    state: PlayerState,
    now: datetime,
    *,
    do_now_left: int | None = None,
) -> Outcome:
    """`do_now_left`: active "do now" tasks left once this one is completed, when it is one."""
    if task.id in day.completed_task_ids:
        return Outcome(day, state, day.date, task.points_awarded_on)
    tally = _Tally(state, now, day.date)
    points_awarded_on = task.points_awarded_on
    tasks_scored = state.tasks_scored
    if points_awarded_on is None:
        tally.points += POINTS_PER_TASK
        points_awarded_on = day.date
        tasks_scored += 1
    mission_completed = day.mission_completed_ids
    if task.id in day.mission_task_ids and task.id not in mission_completed:
        tally.points += MISSION_TASK_POINTS
        mission_completed = (*mission_completed, task.id)
    updated = replace(
        day,
        completed_task_ids=(*day.completed_task_ids, task.id),
        mission_completed_ids=mission_completed,
    )
    updated = _grant_bonuses(updated, day, tally)
    updated = replace(updated, points=day.points + tally.points)

    if tasks_scored >= 1:
        tally.unlock("first_coin")
    for threshold, achievement_id in _TASK_COUNT_ACHIEVEMENTS:
        if tasks_scored >= threshold:
            tally.unlock(achievement_id)
    if task.is_do_now and do_now_left == 0:
        tally.unlock("do_now_clear")
    if task.is_scheduled:
        tally.unlock("scheduled_done")

    record_announced_on = state.record_announced_on
    # Only a record of a closed day can be beaten: the first day with activity sets it.
    if (
        state.best_day_count > 0
        and updated.completed_count > state.best_day_count
        and record_announced_on != day.date
    ):
        tally.announce(AnnouncementKind.NEW_RECORD, updated.completed_count)
        record_announced_on = day.date
    if (
        record_announced_on == day.date
        and updated.completed_count > state.best_day_count
        and updated.completed_count >= RECORD_ACHIEVEMENT_MIN_TASKS
    ):
        tally.unlock("new_record")

    new_state = tally.freeze(tasks_scored=tasks_scored, record_announced_on=record_announced_on)
    return Outcome(updated, new_state, day.date, points_awarded_on)


def _take_back_bonuses(day: ProgressDay, before: ProgressDay, tally: _Tally) -> ProgressDay:
    if before.phase_bonus and not day.goal_met:
        tally.points -= PHASE_BONUS
        unseen = tally.withdraw(AnnouncementKind.PHASE_CLEAR)
        day = replace(day, phase_bonus=False, phase_announced=day.phase_announced and not unseen)
    if before.mission_bonus and not day.mission_cleared:
        tally.points -= MISSION_BONUS
        unseen = tally.withdraw(AnnouncementKind.MISSION_CLEAR)
        day = replace(
            day, mission_bonus=False, mission_announced=day.mission_announced and not unseen
        )
    return day


def apply_reopen(task: TaskFacts, day: ProgressDay, state: PlayerState, now: datetime) -> Outcome:
    """Reopening the same day undoes that completion; reopening a later day changes nothing,
    because the day of the completion is closed (FR-005, FR-006)."""
    if task.completed_day != day.date or task.id not in day.completed_task_ids:
        return Outcome(day, state, None, task.points_awarded_on)
    tally = _Tally(state, now, day.date)
    points_awarded_on = task.points_awarded_on
    tasks_scored = state.tasks_scored
    if points_awarded_on == day.date:
        tally.points -= POINTS_PER_TASK
        points_awarded_on = None
        tasks_scored = max(0, tasks_scored - 1)
    mission_completed = day.mission_completed_ids
    if task.id in mission_completed:
        tally.points -= MISSION_TASK_POINTS
        mission_completed = tuple(item for item in mission_completed if item != task.id)
    updated = replace(
        day,
        completed_task_ids=tuple(item for item in day.completed_task_ids if item != task.id),
        mission_completed_ids=mission_completed,
    )
    updated = _take_back_bonuses(updated, day, tally)
    updated = replace(updated, points=day.points + tally.points)
    new_state = tally.freeze(tasks_scored=tasks_scored)
    return Outcome(updated, new_state, None, points_awarded_on)


def apply_trash(
    task: TaskFacts, task_was_active: bool, day: ProgressDay, state: PlayerState, now: datetime
) -> Outcome:
    """An active task of today's mission leaves it, and the mission is evaluated with the rest.
    Anything else sent to the trash changes no progress (spec, edge cases)."""
    if not task_was_active or task.id not in day.mission_task_ids:
        return Outcome(day, state, task.completed_day, task.points_awarded_on)
    tally = _Tally(state, now, day.date)
    updated = replace(
        day, mission_task_ids=tuple(item for item in day.mission_task_ids if item != task.id)
    )
    updated = _grant_bonuses(updated, day, tally)
    updated = replace(updated, points=day.points + tally.points)
    return Outcome(updated, tally.freeze(), task.completed_day, task.points_awarded_on)


def set_mission(
    task_ids: list[str],
    active_ids: set[str],
    day: ProgressDay,
    state: PlayerState,
    now: datetime,
) -> tuple[ProgressDay, PlayerState]:
    """Replace today's mission. Each id must be an active task, or one of the mission already
    completed today (so it can stay while others are added). Marking or unmarking gives and
    takes no points; only clearing the whole mission does, once a day (FR-013)."""
    if len(task_ids) > MAX_MISSION_TASKS:
        message = f"La misión admite como mucho {MAX_MISSION_TASKS} tareas."
        raise InvalidMissionError(message)
    if len(set(task_ids)) != len(task_ids):
        message = "La misión no puede repetir tareas."
        raise InvalidMissionError(message)
    allowed = active_ids | set(day.mission_completed_ids)
    if any(task_id not in allowed for task_id in task_ids):
        message = "Solo se pueden añadir a la misión tareas activas."
        raise InvalidMissionError(message)
    tally = _Tally(state, now, day.date)
    updated = replace(
        day,
        mission_task_ids=tuple(task_ids),
        mission_completed_ids=tuple(
            task_id for task_id in day.mission_completed_ids if task_id in task_ids
        ),
    )
    updated = _grant_bonuses(updated, day, tally)
    updated = replace(updated, points=day.points + tally.points)
    if tally.points == 0:
        return updated, state
    return updated, tally.freeze()


def close_days(
    state: PlayerState,
    stored: Mapping[str, ProgressDay],
    settings: DaySettings,
    today: str,
    now: datetime,
) -> tuple[PlayerState, list[ProgressDay]]:
    """Close, in order, every day before today that is not closed yet (research R6).

    `stored` holds the documents that exist for those days. A day without one had no activity:
    it is created with the settings in force, so the calendar keeps the goal each day had. A
    player who has never closed a day starts from their first stored day (a new game).
    """
    yesterday = _shift(today, -1)
    if state.last_closed_day is not None:
        start = _shift(state.last_closed_day, 1)
    else:
        open_days = [day for day in stored if day < today]
        if not open_days:
            return replace(state, last_closed_day=yesterday), []
        start = min(open_days)
    if start > yesterday:
        return state, []

    streak = state.current_streak
    earliest = _shift(yesterday, -(MAX_DAYS_TO_CLOSE - 1))
    if start < earliest:
        # Days too far back to keep: if any of them was active, the streak could not survive it.
        skipped = start
        while skipped < earliest:
            if is_active(skipped, settings.active_weekdays) and skipped not in stored:
                streak = 0
            skipped = _shift(skipped, 1)
        start = earliest

    tally = _Tally(state, now, today)
    best_streak = state.best_streak
    best_day_count, best_day_date = state.best_day_count, state.best_day_date
    last_active = state.last_active_closed_day
    closed: list[ProgressDay] = []
    current = start
    while current <= yesterday:
        day = stored.get(current) or new_day(current, settings)
        if not day.closed:
            if day.active:
                streak = streak + 1 if day.goal_met else 0
                last_active = current
            best_streak = max(best_streak, streak)
            if day.completed_count > best_day_count:
                best_day_count, best_day_date = day.completed_count, current
            for threshold, achievement_id in _STREAK_ACHIEVEMENTS:
                if streak >= threshold:
                    tally.unlock(achievement_id)
            closed.append(replace(day, closed=True))
        current = _shift(current, 1)

    new_state = tally.freeze(
        current_streak=streak,
        best_streak=best_streak,
        best_day_count=best_day_count,
        best_day_date=best_day_date,
        last_closed_day=yesterday,
        last_active_closed_day=last_active,
    )
    return new_state, closed


def acknowledge(
    state: PlayerState, announcement_ids: Iterable[str], notice_ids: Iterable[str]
) -> PlayerState:
    seen_announcements, seen_notices = set(announcement_ids), set(notice_ids)
    return replace(
        state,
        announcements=tuple(a for a in state.announcements if a.id not in seen_announcements),
        notices=tuple(n for n in state.notices if n.id not in seen_notices),
    )


def add_notice(state: PlayerState, schedule_id: str, day: str) -> PlayerState:
    notice = Notice(id=uuid.uuid4().hex, schedule_id=schedule_id, day=day)
    return replace(state, notices=(*state.notices, notice)[-MAX_NOTICES:])


@dataclass(frozen=True)
class TodayView:
    """What the scoreboard shows for today (contracts/progress.yaml, `ProgressOut`)."""

    day: ProgressDay
    streak: int
    streak_at_stake: bool
    show_review: bool


def today_view(day: ProgressDay, state: PlayerState, *, morning_review: bool) -> TodayView:
    counts_today = day.active and day.goal_met
    return TodayView(
        day=day,
        streak=state.current_streak + (1 if counts_today else 0),
        streak_at_stake=day.active and not day.goal_met and state.current_streak > 0,
        show_review=morning_review and day.active and not day.review_seen,
    )


# --- Firestore documents -------------------------------------------------------------------


def _strings(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, str))


def _int(value: object, default: int = 0) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default


def day_from_document(data: Mapping[str, Any]) -> ProgressDay:
    return ProgressDay(
        date=str(data["date"]),
        active=bool(data.get("active", True)),
        goal=_int(data.get("goal"), 1) or 1,
        completed_task_ids=_strings(data.get("completed_task_ids")),
        mission_task_ids=_strings(data.get("mission_task_ids")),
        mission_completed_ids=_strings(data.get("mission_completed_ids")),
        phase_bonus=bool(data.get("phase_bonus", False)),
        mission_bonus=bool(data.get("mission_bonus", False)),
        phase_announced=bool(data.get("phase_announced", False)),
        mission_announced=bool(data.get("mission_announced", False)),
        points=_int(data.get("points")),
        review_seen=bool(data.get("review_seen", False)),
        closed=bool(data.get("closed", False)),
    )


def day_to_document(day: ProgressDay, now: datetime) -> dict[str, Any]:
    return {
        "date": day.date,
        "active": day.active,
        "goal": day.goal,
        "completed_task_ids": list(day.completed_task_ids),
        "completed_count": day.completed_count,
        "mission_task_ids": list(day.mission_task_ids),
        "mission_completed_ids": list(day.mission_completed_ids),
        "phase_bonus": day.phase_bonus,
        "mission_bonus": day.mission_bonus,
        "phase_announced": day.phase_announced,
        "mission_announced": day.mission_announced,
        "points": day.points,
        "review_seen": day.review_seen,
        "closed": day.closed,
        "updated_at": now,
    }


def _announcement_from_document(data: object) -> Announcement | None:
    if not isinstance(data, dict):
        return None
    try:
        kind = AnnouncementKind(data["kind"])
    except (KeyError, ValueError):
        return None
    value = data.get("value")
    return Announcement(
        id=str(data.get("id", "")),
        kind=kind,
        value=value if isinstance(value, str | int) else None,
        day=str(data.get("day", "")),
        created_at=data.get("created_at") or datetime.min,
    )


def _notice_from_document(data: object) -> Notice | None:
    if not isinstance(data, dict) or not isinstance(data.get("schedule_id"), str):
        return None
    return Notice(id=str(data.get("id", "")), schedule_id=data["schedule_id"], day=str(data["day"]))


def state_from_document(data: Mapping[str, Any]) -> PlayerState:
    achievements = data.get("achievements")
    announcements = [_announcement_from_document(item) for item in data.get("announcements", [])]
    notices = [_notice_from_document(item) for item in data.get("notices", [])]
    return PlayerState(
        score=_int(data.get("score")),
        max_level_announced=_int(data.get("max_level_announced"), 1) or 1,
        current_streak=_int(data.get("current_streak")),
        best_streak=_int(data.get("best_streak")),
        best_day_count=_int(data.get("best_day_count")),
        best_day_date=data.get("best_day_date"),
        tasks_scored=_int(data.get("tasks_scored")),
        last_closed_day=data.get("last_closed_day"),
        last_active_closed_day=data.get("last_active_closed_day"),
        record_announced_on=data.get("record_announced_on"),
        achievements={
            key: value
            for key, value in (achievements or {}).items()
            if key in ACHIEVEMENT_IDS and isinstance(value, datetime)
        }
        if isinstance(achievements, dict)
        else {},
        announcements=tuple(item for item in announcements if item is not None),
        notices=tuple(item for item in notices if item is not None),
        started_at=data.get("started_at"),
    )


def state_to_document(state: PlayerState, now: datetime) -> dict[str, Any]:
    return {
        "score": state.score,
        "max_level_announced": state.max_level_announced,
        "current_streak": state.current_streak,
        "best_streak": state.best_streak,
        "best_day_count": state.best_day_count,
        "best_day_date": state.best_day_date,
        "tasks_scored": state.tasks_scored,
        "last_closed_day": state.last_closed_day,
        "last_active_closed_day": state.last_active_closed_day,
        "record_announced_on": state.record_announced_on,
        "achievements": dict(state.achievements),
        "announcements": [
            {
                "id": item.id,
                "kind": item.kind.value,
                "value": item.value,
                "day": item.day,
                "created_at": item.created_at,
            }
            for item in state.announcements
        ],
        "notices": [
            {"id": item.id, "schedule_id": item.schedule_id, "day": item.day}
            for item in state.notices
        ],
        "started_at": state.started_at,
        "updated_at": now,
    }
