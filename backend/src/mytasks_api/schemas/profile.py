from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from mytasks_api.domain.profile import (
    AvatarChoice,
    AvatarKind,
    DefaultScope,
    Density,
    InvalidDisplayNameError,
    Profile,
    Theme,
    normalize_display_name,
)
from mytasks_api.domain.task import BoardOrder, HistoryDays

AvatarPresetId = Annotated[str, Field(pattern=r"^avatar-(0[1-9]|1[0-2])$")]

# Fields that can be sent but never as an explicit `null`: they have no "unset" meaning.
_NOT_NULLABLE = ("theme", "density", "default_scope", "board_order", "avatar")


class AvatarOut(BaseModel):
    kind: AvatarKind
    preset: str | None
    version: int = Field(ge=0)


class ProfileOut(BaseModel):
    theme: Theme
    density: Density
    default_scope: DefaultScope
    board_order: BoardOrder
    history_days: HistoryDays | None
    display_name: str | None
    avatar: AvatarOut

    @classmethod
    def from_profile(cls, profile: Profile) -> "ProfileOut":
        return cls(
            theme=profile.theme,
            density=profile.density,
            default_scope=profile.default_scope,
            board_order=profile.board_order,
            history_days=profile.history_days,
            display_name=profile.display_name,
            avatar=AvatarOut(
                kind=profile.avatar.kind,
                preset=profile.avatar.preset,
                version=profile.avatar.version,
            ),
        )


class AvatarChoiceIn(BaseModel):
    """`upload` is deliberately not accepted: only uploading an image can set it."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal[AvatarKind.INITIALS, AvatarKind.PRESET]
    preset: AvatarPresetId | None = None

    @model_validator(mode="after")
    def _preset_matches_kind(self) -> Self:
        if self.kind is AvatarKind.PRESET and self.preset is None:
            message = "Elige uno de los avatares del catálogo."
            raise ValueError(message)
        if self.kind is AvatarKind.INITIALS and self.preset is not None:
            message = "Las iniciales no llevan un avatar del catálogo."
            raise ValueError(message)
        return self

    def to_choice(self) -> AvatarChoice:
        return AvatarChoice(kind=self.kind, preset=self.preset)


class ProfileUpdateIn(BaseModel):
    """A partial update: only the fields sent are touched, and any invalid one rejects them all."""

    model_config = ConfigDict(extra="forbid")

    theme: Theme | None = None
    density: Density | None = None
    default_scope: DefaultScope | None = None
    board_order: BoardOrder | None = None
    # A literal, unlike the enum, does not coerce the string "30" into 30.
    history_days: Literal[30, 90] | None = None
    # The cap only keeps absurd bodies out; the real limit (50 once trimmed) is the domain's.
    display_name: str | None = Field(default=None, max_length=200)
    avatar: AvatarChoiceIn | None = None

    @field_validator("display_name", mode="after")
    @classmethod
    def _normalize_display_name(cls, value: str | None) -> str | None:
        try:
            return normalize_display_name(value)
        except InvalidDisplayNameError as error:
            raise ValueError(str(error)) from error

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> Self:
        if not self.model_fields_set:
            message = "Debes indicar al menos un campo a actualizar."
            raise ValueError(message)
        return self

    @model_validator(mode="after")
    def _reject_explicit_null_where_it_means_nothing(self) -> Self:
        for name in _NOT_NULLABLE:
            if name in self.model_fields_set and getattr(self, name) is None:
                message = f"El campo {name} no admite null."
                raise ValueError(message)
        return self

    def stored_fields(self) -> dict[str, object]:
        """The scalar fields that were sent, as they are stored (enums as their values)."""
        sent = self.model_dump(mode="json", exclude_unset=True, exclude={"avatar"})
        return dict(sent)

    def avatar_choice(self) -> AvatarChoice | None:
        return self.avatar.to_choice() if self.avatar is not None else None
