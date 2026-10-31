from datetime import UTC, datetime, timedelta

import pytest

from mytasks_api.domain.profile import (
    AVATAR_PRESETS,
    AVATAR_UPLOAD_WINDOW,
    AVATAR_UPLOADS_PER_WINDOW,
    DISPLAY_NAME_MAX_LENGTH,
    RESETTABLE_FIELDS,
    Avatar,
    AvatarChoice,
    AvatarKind,
    AvatarRateLimitedError,
    BoardOrder,
    DefaultScope,
    Density,
    HistoryDays,
    InvalidAvatarError,
    InvalidDisplayNameError,
    InvalidProgressSettingError,
    Theme,
    UploadWindow,
    choose_avatar,
    default_profile,
    normalize_active_weekdays,
    normalize_display_name,
    profile_from_document,
    register_upload,
    validate_daily_goal,
    validate_timezone,
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


NOW = datetime(2026, 10, 24, 12, 0, tzinfo=UTC)


def test_the_limit_is_ten_uploads_per_hour() -> None:
    assert AVATAR_UPLOADS_PER_WINDOW == 10
    assert timedelta(hours=1) == AVATAR_UPLOAD_WINDOW


def test_the_first_upload_opens_a_window_with_one_upload() -> None:
    assert register_upload(None, NOW) == UploadWindow(window_start=NOW, count=1)


def test_ten_uploads_in_the_window_are_allowed() -> None:
    window = None
    for index in range(AVATAR_UPLOADS_PER_WINDOW):
        window = register_upload(window, NOW + timedelta(minutes=index))

    assert window == UploadWindow(window_start=NOW, count=10)


def test_the_eleventh_upload_is_rejected_with_the_seconds_left() -> None:
    window = UploadWindow(window_start=NOW, count=10)

    with pytest.raises(AvatarRateLimitedError) as rejected:
        register_upload(window, NOW + timedelta(minutes=10))

    assert rejected.value.retry_after_seconds == 50 * 60


def test_the_seconds_left_round_up_and_are_never_zero() -> None:
    window = UploadWindow(window_start=NOW, count=10)

    with pytest.raises(AvatarRateLimitedError) as rejected:
        register_upload(window, NOW + timedelta(seconds=3599, milliseconds=500))

    assert rejected.value.retry_after_seconds == 1


def test_a_rejected_upload_does_not_change_the_window() -> None:
    window = UploadWindow(window_start=NOW, count=10)

    with pytest.raises(AvatarRateLimitedError):
        register_upload(window, NOW + timedelta(minutes=5))

    assert window == UploadWindow(window_start=NOW, count=10)


def test_the_window_restarts_when_it_expires() -> None:
    window = UploadWindow(window_start=NOW, count=10)

    assert register_upload(window, NOW + timedelta(hours=1, seconds=1)) == UploadWindow(
        window_start=NOW + timedelta(hours=1, seconds=1), count=1
    )


def test_the_window_has_expired_exactly_one_hour_after_it_opened() -> None:
    window = UploadWindow(window_start=NOW, count=10)

    assert register_upload(window, NOW + timedelta(hours=1)).count == 1


def test_uploads_below_the_limit_just_count() -> None:
    window = UploadWindow(window_start=NOW, count=3)

    assert register_upload(window, NOW + timedelta(minutes=30)) == UploadWindow(
        window_start=NOW, count=4
    )


# --- Progress settings (feature 007) -------------------------------------------------------


def test_default_profile_uses_the_default_progress_settings() -> None:
    profile = default_profile()

    assert profile.daily_goal == 3
    assert profile.active_weekdays == (1, 2, 3, 4, 5, 6, 7)
    assert profile.timezone is None
    assert profile.effective_timezone == "Europe/Madrid"
    assert profile.morning_review is True
    assert profile.arcade_mode is True


@pytest.mark.parametrize("goal", [1, 20])
def test_validate_daily_goal_accepts_one_to_twenty(goal: int) -> None:
    assert validate_daily_goal(goal) == goal


@pytest.mark.parametrize("goal", [0, 21, -3])
def test_validate_daily_goal_rejects_values_out_of_range(goal: int) -> None:
    with pytest.raises(InvalidProgressSettingError):
        validate_daily_goal(goal)


def test_normalize_active_weekdays_sorts_the_days() -> None:
    assert normalize_active_weekdays([5, 1, 3]) == (1, 3, 5)


@pytest.mark.parametrize("days", [[], [1, 1], [0], [8]])
def test_normalize_active_weekdays_rejects_empty_repeated_or_unknown_days(days: list[int]) -> None:
    with pytest.raises(InvalidProgressSettingError):
        normalize_active_weekdays(days)


def test_validate_timezone_only_accepts_iana_zones() -> None:
    assert validate_timezone("America/New_York") == "America/New_York"
    with pytest.raises(InvalidProgressSettingError):
        validate_timezone("Mars/Olympus")


def test_profile_from_document_reads_stored_progress_settings() -> None:
    profile = profile_from_document(
        {
            "daily_goal": 5,
            "active_weekdays": [1, 2, 3, 4, 5],
            "timezone": "Atlantic/Canary",
            "morning_review": False,
            "arcade_mode": False,
        }
    )

    assert profile.daily_goal == 5
    assert profile.active_weekdays == (1, 2, 3, 4, 5)
    assert profile.effective_timezone == "Atlantic/Canary"
    assert profile.morning_review is False
    assert profile.arcade_mode is False


def test_profile_from_document_falls_back_on_invalid_progress_settings() -> None:
    profile = profile_from_document(
        {
            "daily_goal": True,
            "active_weekdays": [],
            "timezone": "Mars/Olympus",
            "morning_review": "yes",
            "arcade_mode": 0,
        }
    )

    assert profile.daily_goal == 3
    assert profile.active_weekdays == (1, 2, 3, 4, 5, 6, 7)
    assert profile.timezone is None
    assert profile.morning_review is True
    assert profile.arcade_mode is True


def test_reset_never_touches_the_progress_settings() -> None:
    progress_fields = {"daily_goal", "active_weekdays", "timezone", "morning_review", "arcade_mode"}

    assert progress_fields.isdisjoint(RESETTABLE_FIELDS)
