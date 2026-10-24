import pytest

from mytasks_api.domain.profile import (
    AVATAR_PRESETS,
    DISPLAY_NAME_MAX_LENGTH,
    RESETTABLE_FIELDS,
    Avatar,
    AvatarChoice,
    AvatarKind,
    BoardOrder,
    DefaultScope,
    Density,
    HistoryDays,
    InvalidAvatarError,
    InvalidDisplayNameError,
    Theme,
    choose_avatar,
    default_profile,
    normalize_display_name,
    profile_from_document,
)

pytestmark = pytest.mark.unit


def test_default_profile_uses_the_documented_defaults() -> None:
    profile = default_profile()

    assert profile.theme is Theme.SYSTEM
    assert profile.density is Density.COMFORTABLE
    assert profile.default_scope is DefaultScope.ALL
    assert profile.board_order is BoardOrder.OLDEST
    assert profile.history_days is None
    assert profile.display_name is None
    assert profile.avatar == Avatar(kind=AvatarKind.INITIALS, preset=None, version=0)


def test_closed_lists_hold_exactly_the_allowed_values() -> None:
    assert {theme.value for theme in Theme} == {"light", "dark", "system"}
    assert {density.value for density in Density} == {"comfortable", "compact"}
    assert {scope.value for scope in DefaultScope} == {"all", "work", "personal"}
    assert {order.value for order in BoardOrder} == {"oldest", "newest"}
    assert {days.value for days in HistoryDays} == {30, 90}
    assert {kind.value for kind in AvatarKind} == {"initials", "preset", "upload"}


def test_avatar_catalog_has_exactly_twelve_presets() -> None:
    expected = tuple(f"avatar-{number:02d}" for number in range(1, 13))

    assert expected == AVATAR_PRESETS


def test_profile_from_empty_document_returns_the_defaults() -> None:
    assert profile_from_document({}) == default_profile()


def test_profile_from_document_reads_every_stored_field() -> None:
    profile = profile_from_document(
        {
            "theme": "dark",
            "density": "compact",
            "default_scope": "work",
            "board_order": "newest",
            "history_days": 90,
            "display_name": "Ana",
            "avatar_kind": "preset",
            "avatar_preset": "avatar-03",
            "avatar_version": 4,
        }
    )

    assert profile.theme is Theme.DARK
    assert profile.density is Density.COMPACT
    assert profile.default_scope is DefaultScope.WORK
    assert profile.board_order is BoardOrder.NEWEST
    assert profile.history_days is HistoryDays.DAYS_90
    assert profile.display_name == "Ana"
    assert profile.avatar == Avatar(kind=AvatarKind.PRESET, preset="avatar-03", version=4)


def test_profile_from_document_falls_back_to_the_default_for_an_unknown_stored_value() -> None:
    profile = profile_from_document({"theme": "neon", "history_days": 7, "avatar_kind": "gif"})

    assert profile.theme is Theme.SYSTEM
    assert profile.history_days is None
    assert profile.avatar.kind is AvatarKind.INITIALS


def test_resettable_fields_are_only_the_five_display_preferences() -> None:
    assert set(RESETTABLE_FIELDS) == {
        "theme",
        "density",
        "default_scope",
        "board_order",
        "history_days",
    }


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Ana", "Ana"),
        ("  Ana María  ", "Ana María"),
        ("José Ñandú", "José Ñandú"),
        ("Sol ☀️", "Sol ☀️"),
        ("👨‍👩‍👧 Familia", "👨‍👩‍👧 Familia"),
        ("<b>Ana</b>", "<b>Ana</b>"),
        ("a" * DISPLAY_NAME_MAX_LENGTH, "a" * DISPLAY_NAME_MAX_LENGTH),
    ],
)
def test_normalize_display_name_accepts_valid_names(raw: str, expected: str) -> None:
    assert normalize_display_name(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "   ", "\t \n"])
def test_normalize_display_name_turns_empty_values_into_none(raw: str | None) -> None:
    assert normalize_display_name(raw) is None


@pytest.mark.parametrize(
    "raw",
    [
        "a" * (DISPLAY_NAME_MAX_LENGTH + 1),
        "Ana\x00",
        "Ana\x07Bel",
        "Ana‮Bel",
        "Ana​Bel",
        "Ana﻿Bel",
        "A\nB",
    ],
)
def test_normalize_display_name_rejects_long_names_and_control_characters(raw: str) -> None:
    with pytest.raises(InvalidDisplayNameError):
        normalize_display_name(raw)


def test_choose_avatar_preset_sets_the_kind_and_bumps_the_version() -> None:
    current = Avatar(kind=AvatarKind.INITIALS, preset=None, version=2)

    result = choose_avatar(current, AvatarChoice(kind=AvatarKind.PRESET, preset="avatar-07"))

    assert result == Avatar(kind=AvatarKind.PRESET, preset="avatar-07", version=3)


def test_choose_avatar_initials_clears_the_preset_and_bumps_the_version() -> None:
    current = Avatar(kind=AvatarKind.PRESET, preset="avatar-07", version=3)

    result = choose_avatar(current, AvatarChoice(kind=AvatarKind.INITIALS, preset=None))

    assert result == Avatar(kind=AvatarKind.INITIALS, preset=None, version=4)


def test_choose_avatar_cannot_set_upload() -> None:
    current = Avatar(kind=AvatarKind.INITIALS, preset=None, version=0)

    with pytest.raises(InvalidAvatarError):
        choose_avatar(current, AvatarChoice(kind=AvatarKind.UPLOAD, preset=None))


@pytest.mark.parametrize("preset", [None, "avatar-00", "avatar-13", "avatar-1", "other", ""])
def test_choose_avatar_rejects_a_preset_outside_the_catalog(preset: str | None) -> None:
    current = Avatar(kind=AvatarKind.INITIALS, preset=None, version=0)

    with pytest.raises(InvalidAvatarError):
        choose_avatar(current, AvatarChoice(kind=AvatarKind.PRESET, preset=preset))


def test_choose_avatar_rejects_a_preset_together_with_initials() -> None:
    current = Avatar(kind=AvatarKind.INITIALS, preset=None, version=0)

    with pytest.raises(InvalidAvatarError):
        choose_avatar(current, AvatarChoice(kind=AvatarKind.INITIALS, preset="avatar-01"))


def test_choose_avatar_reports_that_an_uploaded_image_must_be_dropped() -> None:
    uploaded = Avatar(kind=AvatarKind.UPLOAD, preset=None, version=5)

    assert uploaded.has_uploaded_image
    assert not Avatar(kind=AvatarKind.PRESET, preset="avatar-01", version=1).has_uploaded_image
    assert not Avatar(kind=AvatarKind.INITIALS, preset=None, version=0).has_uploaded_image
    after = choose_avatar(uploaded, AvatarChoice(kind=AvatarKind.PRESET, preset="avatar-01"))
    assert not after.has_uploaded_image
    assert after.version == 6
