import math
import unicodedata
import zoneinfo
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from functools import cache
from typing import Any

from mytasks_api.domain.task import BoardOrder, HistoryDays

DISPLAY_NAME_MAX_LENGTH = 50

# Progress settings (feature 007). The daily goal is a number of tasks; the active days are ISO
# weekdays (1 = Monday … 7 = Sunday).
DAILY_GOAL_MIN = 1
DAILY_GOAL_MAX = 20
DEFAULT_DAILY_GOAL = 3
ALL_WEEKDAYS = (1, 2, 3, 4, 5, 6, 7)
# Used to compute the day until the client sends the device's zone for the first time.
DEFAULT_TIMEZONE = "Europe/Madrid"

# At most this many uploaded images per person in a fixed window that opens with the first one
# (FR-025). Removing the avatar does not count.
AVATAR_UPLOADS_PER_WINDOW = 10
AVATAR_UPLOAD_WINDOW = timedelta(hours=1)

# `avatar-01` … `avatar-12`: the catalog approved in the design phase.
AVATAR_PRESETS = tuple(f"avatar-{number:02d}" for number in range(1, 13))

# Zero-width joiner: category Cf, but it is what glues emoji sequences (family, couple, flags).
_ZERO_WIDTH_JOINER = "‍"

# Unicode categories that are never part of a name: controls (Cc) and invisible formatting (Cf,
# which includes bidirectional overrides and zero-width spaces that disguise text).
_FORBIDDEN_CATEGORIES = frozenset({"Cc", "Cf"})


class Theme(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class Density(StrEnum):
    COMFORTABLE = "comfortable"
    COMPACT = "compact"


class DefaultScope(StrEnum):
    ALL = "all"
    WORK = "work"
    PERSONAL = "personal"


class AvatarKind(StrEnum):
    INITIALS = "initials"
    PRESET = "preset"
    UPLOAD = "upload"


# The five display preferences that "reset" restores. The name and the avatar are identity,
# not display settings, so a reset never touches them.
RESETTABLE_FIELDS = ("theme", "density", "default_scope", "board_order", "history_days")


class InvalidDisplayNameError(ValueError):
    pass


class InvalidProgressSettingError(ValueError):
    pass


class InvalidAvatarError(ValueError):
    pass


class AvatarNotFoundError(Exception):
    pass


class AvatarRateLimitedError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(retry_after_seconds)
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class UploadWindow:
    window_start: datetime
    count: int


@dataclass(frozen=True)
class Avatar:
    kind: AvatarKind
    preset: str | None
    version: int

    @property
    def has_uploaded_image(self) -> bool:
        return self.kind is AvatarKind.UPLOAD


@dataclass(frozen=True)
class AvatarChoice:
    """What a profile update may ask for. `upload` is only ever set by uploading an image."""

    kind: AvatarKind
    preset: str | None


@dataclass(frozen=True)
class Profile:
    theme: Theme
    density: Density
    default_scope: DefaultScope
    board_order: BoardOrder
    history_days: HistoryDays | None
    display_name: str | None
    avatar: Avatar
    daily_goal: int = DEFAULT_DAILY_GOAL
    active_weekdays: tuple[int, ...] = ALL_WEEKDAYS
    # `None` until the client sends the device's zone; the day is then computed in the default.
    timezone: str | None = None
    morning_review: bool = True
    arcade_mode: bool = True

    @property
    def effective_timezone(self) -> str:
        return self.timezone or DEFAULT_TIMEZONE


def default_profile() -> Profile:
    return Profile(
        theme=Theme.SYSTEM,
        density=Density.COMFORTABLE,
        default_scope=DefaultScope.ALL,
        board_order=BoardOrder.OLDEST,
        history_days=None,
        display_name=None,
        avatar=Avatar(kind=AvatarKind.INITIALS, preset=None, version=0),
    )


@cache
def _known_timezones() -> frozenset[str]:
    return frozenset(zoneinfo.available_timezones())


def is_known_timezone(value: str) -> bool:
    return value in _known_timezones()


def validate_daily_goal(value: int) -> int:
    if not DAILY_GOAL_MIN <= value <= DAILY_GOAL_MAX:
        message = f"La meta diaria debe estar entre {DAILY_GOAL_MIN} y {DAILY_GOAL_MAX} tareas."
        raise InvalidProgressSettingError(message)
    return value


def normalize_active_weekdays(values: list[int]) -> tuple[int, ...]:
    if not values:
        message = "Al menos un día de la semana debe ser activo."
        raise InvalidProgressSettingError(message)
    if len(set(values)) != len(values) or any(day not in ALL_WEEKDAYS for day in values):
        message = "Los días activos van del 1 (lunes) al 7 (domingo), sin repetir."
        raise InvalidProgressSettingError(message)
    return tuple(sorted(values))


def validate_timezone(value: str) -> str:
    if not is_known_timezone(value):
        message = "La zona horaria no es válida."
        raise InvalidProgressSettingError(message)
    return value


def normalize_display_name(value: str | None) -> str | None:
    """Trim the name and check it; `None` (or nothing left after trimming) means "use the name
    from the Google account"."""
    if value is None:
        return None
    name = value.strip()
    if not name:
        return None
    if len(name) > DISPLAY_NAME_MAX_LENGTH:
        message = f"El nombre no puede superar los {DISPLAY_NAME_MAX_LENGTH} caracteres."
        raise InvalidDisplayNameError(message)
    for character in name:
        if character == _ZERO_WIDTH_JOINER:
            continue
        if unicodedata.category(character) in _FORBIDDEN_CATEGORIES:
            message = "El nombre no puede contener caracteres de control."
            raise InvalidDisplayNameError(message)
    return name


def choose_avatar(current: Avatar, choice: AvatarChoice) -> Avatar:
    """The avatar after picking initials or a catalog image. Every change bumps the version
    (it is what invalidates the browser cache) and leaves no uploaded image behind."""
    if choice.kind is AvatarKind.UPLOAD:
        message = "La imagen propia solo se fija subiéndola."
        raise InvalidAvatarError(message)
    if choice.kind is AvatarKind.PRESET:
        if choice.preset not in AVATAR_PRESETS:
            message = "El avatar no pertenece al catálogo."
            raise InvalidAvatarError(message)
        return Avatar(kind=AvatarKind.PRESET, preset=choice.preset, version=current.version + 1)
    if choice.preset is not None:
        message = "Las iniciales no admiten un avatar del catálogo."
        raise InvalidAvatarError(message)
    return Avatar(kind=AvatarKind.INITIALS, preset=None, version=current.version + 1)


def _enum_or_default[E: StrEnum](enum: type[E], value: object, default: E) -> E:
    if isinstance(value, str):
        try:
            return enum(value)
        except ValueError:
            pass
    return default


def profile_from_document(data: dict[str, Any]) -> Profile:
    """A stored document as a profile. A missing field is its default; so is a value that no
    longer belongs to its closed list, so one bad field never takes the whole profile down."""
    defaults = default_profile()
    history_days: HistoryDays | None = None
    try:
        if data.get("history_days") is not None:
            history_days = HistoryDays(data["history_days"])
    except ValueError:
        history_days = None
    version = data.get("avatar_version", 0)
    return Profile(
        theme=_enum_or_default(Theme, data.get("theme"), defaults.theme),
        density=_enum_or_default(Density, data.get("density"), defaults.density),
        default_scope=_enum_or_default(
            DefaultScope, data.get("default_scope"), defaults.default_scope
        ),
        board_order=_enum_or_default(BoardOrder, data.get("board_order"), defaults.board_order),
        history_days=history_days,
        display_name=data.get("display_name"),
        avatar=Avatar(
            kind=_enum_or_default(AvatarKind, data.get("avatar_kind"), AvatarKind.INITIALS),
            preset=data.get("avatar_preset"),
            version=version if isinstance(version, int) and version >= 0 else 0,
        ),
        daily_goal=_goal_or_default(data.get("daily_goal")),
        active_weekdays=_weekdays_or_default(data.get("active_weekdays")),
        timezone=_timezone_or_none(data.get("timezone")),
        morning_review=_bool_or_default(data.get("morning_review"), defaults.morning_review),
        arcade_mode=_bool_or_default(data.get("arcade_mode"), defaults.arcade_mode),
    )


def _goal_or_default(value: object) -> int:
    # `bool` is an `int` in Python: a stored `true` is not a goal of 1.
    if isinstance(value, int) and not isinstance(value, bool):
        try:
            return validate_daily_goal(value)
        except InvalidProgressSettingError:
            pass
    return DEFAULT_DAILY_GOAL


def _weekdays_or_default(value: object) -> tuple[int, ...]:
    if isinstance(value, list) and all(
        isinstance(day, int) and not isinstance(day, bool) for day in value
    ):
        try:
            return normalize_active_weekdays(value)
        except InvalidProgressSettingError:
            pass
    return ALL_WEEKDAYS


def _timezone_or_none(value: object) -> str | None:
    return value if isinstance(value, str) and is_known_timezone(value) else None


def _bool_or_default(value: object, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def register_upload(window: UploadWindow | None, now: datetime) -> UploadWindow:
    """The window after one more upload, or `AvatarRateLimitedError` with the seconds left if the
    current one is full. A window that has run for an hour is replaced by a new one."""
    if window is None or now >= window.window_start + AVATAR_UPLOAD_WINDOW:
        return UploadWindow(window_start=now, count=1)
    if window.count >= AVATAR_UPLOADS_PER_WINDOW:
        remaining = (window.window_start + AVATAR_UPLOAD_WINDOW - now).total_seconds()
        raise AvatarRateLimitedError(max(1, math.ceil(remaining)))
    return UploadWindow(window_start=window.window_start, count=window.count + 1)
