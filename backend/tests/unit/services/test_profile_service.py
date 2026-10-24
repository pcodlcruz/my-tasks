import logging
from collections.abc import Callable
from dataclasses import replace
from typing import Any

import pytest

from mytasks_api.domain.profile import (
    RESETTABLE_FIELDS,
    Avatar,
    AvatarChoice,
    AvatarKind,
    BoardOrder,
    Density,
    HistoryDays,
    Profile,
    Theme,
    choose_avatar,
    default_profile,
    normalize_display_name,
)
from mytasks_api.schemas.profile import ProfileUpdateIn
from mytasks_api.services.profile_service import ProfileService

pytestmark = pytest.mark.unit


class FakeProfileRepository:
    def __init__(self) -> None:
        self.profiles: dict[str, Profile] = {}
        self.updates: list[tuple[str, dict[str, object], AvatarChoice | None]] = []
        self.resets: list[str] = []
        self.dropped_uploads: list[str] = []

    async def get(self, uid: str) -> Profile:
        return self.profiles.get(uid, default_profile())

    async def update(
        self, uid: str, fields: dict[str, object], avatar: AvatarChoice | None
    ) -> Profile:
        self.updates.append((uid, dict(fields), avatar))
        current = await self.get(uid)
        converters: dict[str, Callable[[Any], object]] = {
            "theme": Theme,
            "density": Density,
            "history_days": lambda value: None if value is None else HistoryDays(value),
        }
        changes = {
            name: converters.get(name, lambda value: value)(value) for name, value in fields.items()
        }
        updated = replace(current, **changes)
        if avatar is not None:
            if current.avatar.has_uploaded_image:
                self.dropped_uploads.append(uid)
            updated = replace(updated, avatar=choose_avatar(current.avatar, avatar))
        self.profiles[uid] = updated
        return updated

    async def reset(self, uid: str) -> Profile:
        self.resets.append(uid)
        current = await self.get(uid)
        defaults = default_profile()
        reset = replace(
            current,
            **{name: getattr(defaults, name) for name in RESETTABLE_FIELDS},
        )
        self.profiles[uid] = reset
        return reset


def _service(repository: FakeProfileRepository) -> ProfileService:
    return ProfileService(repository)  # type: ignore[arg-type]


def _update(**fields: object) -> ProfileUpdateIn:
    return ProfileUpdateIn.model_validate(fields)


async def test_get_profile_returns_the_defaults_when_nothing_is_stored() -> None:
    profile = await _service(FakeProfileRepository()).get_profile("uid-1")

    assert profile == default_profile()


async def test_update_profile_sends_only_the_fields_the_person_changed() -> None:
    repository = FakeProfileRepository()

    profile = await _service(repository).update_profile("uid-1", _update(theme="dark"))

    assert repository.updates == [("uid-1", {"theme": "dark"}, None)]
    assert profile.theme is Theme.DARK
    assert profile.density is Density.COMFORTABLE


async def test_update_profile_applies_every_field_of_a_multi_field_change_in_one_call() -> None:
    repository = FakeProfileRepository()

    await _service(repository).update_profile(
        "uid-1", _update(theme="light", density="compact", display_name="  Ana  ")
    )

    assert len(repository.updates) == 1
    _, fields, avatar = repository.updates[0]
    assert fields == {"theme": "light", "density": "compact", "display_name": "Ana"}
    assert avatar is None


async def test_update_profile_keeps_an_explicit_null_history_days_as_all_history() -> None:
    repository = FakeProfileRepository()

    await _service(repository).update_profile("uid-1", _update(history_days=None))

    assert repository.updates[0][1] == {"history_days": None}


async def test_update_profile_turns_a_blank_display_name_into_none() -> None:
    repository = FakeProfileRepository()

    await _service(repository).update_profile("uid-1", _update(display_name="   "))

    assert repository.updates[0][1] == {"display_name": None}


async def test_choosing_a_preset_avatar_passes_the_choice_to_the_repository() -> None:
    repository = FakeProfileRepository()

    profile = await _service(repository).update_profile(
        "uid-1", _update(avatar={"kind": "preset", "preset": "avatar-05"})
    )

    assert repository.updates[0][2] == AvatarChoice(kind=AvatarKind.PRESET, preset="avatar-05")
    assert profile.avatar == Avatar(kind=AvatarKind.PRESET, preset="avatar-05", version=1)


async def test_choosing_a_preset_or_initials_asks_to_drop_the_uploaded_image() -> None:
    repository = FakeProfileRepository()
    repository.profiles["uid-1"] = replace(
        default_profile(), avatar=Avatar(kind=AvatarKind.UPLOAD, preset=None, version=3)
    )
    service = _service(repository)

    await service.update_profile("uid-1", _update(avatar={"kind": "initials"}))

    assert repository.dropped_uploads == ["uid-1"]
    assert repository.updates[0][2] == AvatarChoice(kind=AvatarKind.INITIALS, preset=None)
    assert repository.profiles["uid-1"].avatar.version == 4


async def test_updating_only_display_preferences_does_not_touch_the_avatar() -> None:
    repository = FakeProfileRepository()
    repository.profiles["uid-1"] = replace(
        default_profile(), avatar=Avatar(kind=AvatarKind.UPLOAD, preset=None, version=3)
    )

    await _service(repository).update_profile("uid-1", _update(theme="dark"))

    assert repository.dropped_uploads == []
    assert repository.profiles["uid-1"].avatar.kind is AvatarKind.UPLOAD


async def test_reset_profile_restores_only_the_five_display_preferences() -> None:
    repository = FakeProfileRepository()
    repository.profiles["uid-1"] = Profile(
        theme=Theme.DARK,
        density=Density.COMPACT,
        default_scope=default_profile().default_scope,
        board_order=BoardOrder.NEWEST,
        history_days=HistoryDays.DAYS_30,
        display_name=normalize_display_name("Ana"),
        avatar=Avatar(kind=AvatarKind.PRESET, preset="avatar-02", version=1),
    )

    profile = await _service(repository).reset_profile("uid-1")

    assert repository.resets == ["uid-1"]
    assert profile.theme is Theme.SYSTEM
    assert profile.density is Density.COMFORTABLE
    assert profile.board_order is BoardOrder.OLDEST
    assert profile.history_days is None
    assert profile.display_name == "Ana"
    assert profile.avatar == Avatar(kind=AvatarKind.PRESET, preset="avatar-02", version=1)


async def test_update_profile_logs_only_the_names_of_the_changed_fields(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="mytasks_api")

    await _service(FakeProfileRepository()).update_profile(
        "uid-1", _update(display_name="Nombre Privado", theme="dark")
    )

    (record,) = [r for r in caplog.records if r.getMessage() == "profile_updated"]
    assert record.uid == "uid-1"  # type: ignore[attr-defined]
    assert record.fields == "display_name,theme"  # type: ignore[attr-defined]
    assert "Nombre Privado" not in caplog.text


async def test_reset_profile_logs_the_reset_with_the_uid_and_the_field_names(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="mytasks_api")

    await _service(FakeProfileRepository()).reset_profile("uid-9")

    (record,) = [r for r in caplog.records if r.getMessage() == "profile_reset"]
    assert record.uid == "uid-9"  # type: ignore[attr-defined]
    assert record.fields == ",".join(sorted(RESETTABLE_FIELDS))  # type: ignore[attr-defined]
