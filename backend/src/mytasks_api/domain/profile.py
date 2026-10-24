import unicodedata
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from mytasks_api.domain.task import BoardOrder, HistoryDays

DISPLAY_NAME_MAX_LENGTH = 50

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


class InvalidAvatarError(ValueError):
    pass


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
    )
