from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from google.cloud import firestore

    from tests.conftest import AdminUserFactory, GoogleUserFactory, SeedAccountFactory

pytestmark = pytest.mark.integration

PROFILE_URL = "/api/v1/me/profile"

DEFAULT_PROFILE = {
    "theme": "system",
    "density": "comfortable",
    "default_scope": "all",
    "board_order": "oldest",
    "history_days": None,
    "display_name": None,
    "avatar": {"kind": "initials", "preset": None, "version": 0},
    "daily_goal": 3,
    "active_weekdays": [1, 2, 3, 4, 5, 6, 7],
    "timezone": None,
    "morning_review": True,
    "arcade_mode": True,
}


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _profile_ref(
    firestore_client: firestore.AsyncClient, uid: str
) -> firestore.AsyncDocumentReference:
    return (
        firestore_client.collection("users")
        .document(uid)
        .collection("settings")
        .document("profile")
    )


async def test_get_profile_requires_a_token(client: httpx.AsyncClient) -> None:
    for method in ("GET", "PATCH", "DELETE"):
        response = await client.request(method, PROFILE_URL, json={"theme": "dark"})

        assert response.status_code == 401, method
        assert response.json()["code"] == "unauthenticated"


async def test_profile_endpoints_deny_a_signed_in_person_without_an_account(
    client: httpx.AsyncClient, google_user_without_account: GoogleUserFactory
) -> None:
    stranger = await google_user_without_account("stranger@example.com")

    for method in ("GET", "PATCH", "DELETE"):
        response = await client.request(
            method, PROFILE_URL, json={"theme": "dark"}, headers=_auth(stranger.id_token)
        )

        assert response.status_code == 403, method
        assert response.json()["code"] == "access_denied"


async def test_profile_endpoints_deny_a_revoked_account(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_account: SeedAccountFactory,
) -> None:
    user = await google_user("revoked@example.com")
    await seed_account(user.uid, user.email, status="revoked")

    for method in ("GET", "PATCH", "DELETE"):
        response = await client.request(
            method, PROFILE_URL, json={"theme": "dark"}, headers=_auth(user.id_token)
        )

        assert response.status_code == 403, method
        assert response.json()["code"] == "access_denied"


async def test_get_profile_returns_the_defaults_when_there_is_no_document(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.get(PROFILE_URL, headers=_auth(user.id_token))

    assert response.status_code == 200
    assert response.json() == DEFAULT_PROFILE


async def test_get_profile_does_not_create_a_document(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("owner@example.com")

    await client.get(PROFILE_URL, headers=_auth(user.id_token))

    assert not (await _profile_ref(firestore_client, user.uid).get()).exists


async def test_patch_profile_changes_only_the_fields_sent(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.patch(
        PROFILE_URL, json={"theme": "dark", "density": "compact"}, headers=_auth(user.id_token)
    )

    assert response.status_code == 200
    assert response.json() == {**DEFAULT_PROFILE, "theme": "dark", "density": "compact"}
    again = await client.get(PROFILE_URL, headers=_auth(user.id_token))
    assert again.json() == response.json()


async def test_patch_profile_accumulates_successive_partial_changes(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    await client.patch(PROFILE_URL, json={"theme": "light"}, headers=_auth(user.id_token))
    await client.patch(
        PROFILE_URL,
        json={"default_scope": "work", "board_order": "newest", "history_days": 90},
        headers=_auth(user.id_token),
    )
    response = await client.patch(
        PROFILE_URL, json={"history_days": None}, headers=_auth(user.id_token)
    )

    assert response.json() == {
        **DEFAULT_PROFILE,
        "theme": "light",
        "default_scope": "work",
        "board_order": "newest",
        "history_days": None,
    }


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"theme": "neon"},
        {"theme": None},
        {"density": "huge"},
        {"default_scope": "everything"},
        {"board_order": "random"},
        {"history_days": 7},
        {"history_days": "30"},
        {"unknown": 1},
        {"theme": "dark", "unknown": 1},
        {"display_name": "a" * 51},
        {"display_name": "Ana\x07"},
        {"display_name": "Ana‮Bel"},
        {"display_name": 123},
        {"avatar": {"kind": "upload"}},
        {"avatar": {"kind": "preset"}},
        {"avatar": {"kind": "preset", "preset": "avatar-13"}},
        {"avatar": {"kind": "preset", "preset": "avatar-00"}},
        {"avatar": {"kind": "initials", "preset": "avatar-01"}},
        {"avatar": {"kind": "preset", "preset": "avatar-01", "extra": True}},
        {"avatar": {"preset": "avatar-01"}},
        {"avatar": None},
    ],
)
async def test_patch_profile_rejects_invalid_input_with_422(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, payload: dict[str, object]
) -> None:
    user = await google_user("owner@example.com")

    response = await client.patch(PROFILE_URL, json=payload, headers=_auth(user.id_token))

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_a_rejected_patch_saves_nothing_even_for_the_valid_fields(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("owner@example.com")

    response = await client.patch(
        PROFILE_URL,
        json={"theme": "dark", "density": "compact", "display_name": "a" * 51},
        headers=_auth(user.id_token),
    )

    assert response.status_code == 422
    assert not (await _profile_ref(firestore_client, user.uid).get()).exists
    after = await client.get(PROFILE_URL, headers=_auth(user.id_token))
    assert after.json() == DEFAULT_PROFILE


async def test_display_name_is_trimmed_and_accepts_accents_and_emojis(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.patch(
        PROFILE_URL, json={"display_name": "  José Ñandú 🌞  "}, headers=_auth(user.id_token)
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "José Ñandú 🌞"


@pytest.mark.parametrize("empty", [None, "", "    "])
async def test_an_empty_display_name_goes_back_to_the_google_name(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, empty: str | None
) -> None:
    user = await google_user("owner@example.com")
    await client.patch(PROFILE_URL, json={"display_name": "Ana"}, headers=_auth(user.id_token))

    response = await client.patch(
        PROFILE_URL, json={"display_name": empty}, headers=_auth(user.id_token)
    )

    assert response.status_code == 200
    assert response.json()["display_name"] is None


async def test_a_display_name_of_fifty_characters_is_accepted(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.patch(
        PROFILE_URL, json={"display_name": "ñ" * 50}, headers=_auth(user.id_token)
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "ñ" * 50


async def test_a_display_name_with_html_is_returned_literally(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")
    name = "<img src=x onerror=alert(1)> & <b>Ana</b>"

    response = await client.patch(
        PROFILE_URL, json={"display_name": name}, headers=_auth(user.id_token)
    )

    assert response.json()["display_name"] == name
    assert (await client.get(PROFILE_URL, headers=_auth(user.id_token))).json()[
        "display_name"
    ] == name


async def test_choosing_a_valid_preset_sets_the_avatar_and_bumps_the_version(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    first = await client.patch(
        PROFILE_URL,
        json={"avatar": {"kind": "preset", "preset": "avatar-07"}},
        headers=_auth(user.id_token),
    )
    second = await client.patch(
        PROFILE_URL,
        json={"avatar": {"kind": "preset", "preset": "avatar-12"}},
        headers=_auth(user.id_token),
    )

    assert first.json()["avatar"] == {"kind": "preset", "preset": "avatar-07", "version": 1}
    assert second.json()["avatar"] == {"kind": "preset", "preset": "avatar-12", "version": 2}


async def test_choosing_initials_clears_the_preset(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")
    await client.patch(
        PROFILE_URL,
        json={"avatar": {"kind": "preset", "preset": "avatar-01"}},
        headers=_auth(user.id_token),
    )

    response = await client.patch(
        PROFILE_URL, json={"avatar": {"kind": "initials"}}, headers=_auth(user.id_token)
    )

    assert response.json()["avatar"] == {"kind": "initials", "preset": None, "version": 2}


async def test_changing_other_fields_does_not_bump_the_avatar_version(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")
    await client.patch(
        PROFILE_URL,
        json={"avatar": {"kind": "preset", "preset": "avatar-01"}},
        headers=_auth(user.id_token),
    )

    response = await client.patch(PROFILE_URL, json={"theme": "dark"}, headers=_auth(user.id_token))

    assert response.json()["avatar"] == {"kind": "preset", "preset": "avatar-01", "version": 1}


async def test_choosing_a_preset_removes_a_previously_uploaded_image(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("owner@example.com")
    settings = firestore_client.collection("users").document(user.uid).collection("settings")
    await settings.document("profile").set(
        {"avatar_kind": "upload", "avatar_preset": None, "avatar_version": 4}
    )
    await settings.document("avatar").set(
        {
            "data": b"RIFF",
            "content_type": "image/webp",
            "size": 4,
            "updated_at": datetime.now(UTC),
        }
    )

    response = await client.patch(
        PROFILE_URL,
        json={"avatar": {"kind": "preset", "preset": "avatar-02"}},
        headers=_auth(user.id_token),
    )

    assert response.status_code == 200
    assert response.json()["avatar"] == {"kind": "preset", "preset": "avatar-02", "version": 5}
    assert not (await settings.document("avatar").get()).exists


async def test_choosing_initials_removes_a_previously_uploaded_image(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("owner@example.com")
    settings = firestore_client.collection("users").document(user.uid).collection("settings")
    await settings.document("profile").set(
        {"avatar_kind": "upload", "avatar_preset": None, "avatar_version": 1}
    )
    await settings.document("avatar").set(
        {"data": b"RIFF", "content_type": "image/webp", "size": 4, "updated_at": datetime.now(UTC)}
    )

    response = await client.patch(
        PROFILE_URL, json={"avatar": {"kind": "initials"}}, headers=_auth(user.id_token)
    )

    assert response.json()["avatar"] == {"kind": "initials", "preset": None, "version": 2}
    assert not (await settings.document("avatar").get()).exists


async def test_a_rejected_avatar_choice_keeps_the_uploaded_image(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("owner@example.com")
    settings = firestore_client.collection("users").document(user.uid).collection("settings")
    await settings.document("profile").set(
        {"avatar_kind": "upload", "avatar_preset": None, "avatar_version": 1}
    )
    await settings.document("avatar").set(
        {"data": b"RIFF", "content_type": "image/webp", "size": 4, "updated_at": datetime.now(UTC)}
    )

    response = await client.patch(
        PROFILE_URL,
        json={"avatar": {"kind": "preset", "preset": "avatar-99"}},
        headers=_auth(user.id_token),
    )

    assert response.status_code == 422
    assert (await settings.document("avatar").get()).exists
    assert (await _profile_ref(firestore_client, user.uid).get()).to_dict()[
        "avatar_kind"
    ] == "upload"


async def test_reset_restores_the_display_preferences_but_not_the_name_or_the_avatar(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")
    await client.patch(
        PROFILE_URL,
        json={
            "theme": "dark",
            "density": "compact",
            "default_scope": "personal",
            "board_order": "newest",
            "history_days": 30,
            "display_name": "Ana",
            "avatar": {"kind": "preset", "preset": "avatar-04"},
        },
        headers=_auth(user.id_token),
    )

    response = await client.delete(PROFILE_URL, headers=_auth(user.id_token))

    assert response.status_code == 200
    assert response.json() == {
        **DEFAULT_PROFILE,
        "display_name": "Ana",
        "avatar": {"kind": "preset", "preset": "avatar-04", "version": 1},
    }
    assert (await client.get(PROFILE_URL, headers=_auth(user.id_token))).json() == response.json()


async def test_reset_without_a_profile_document_returns_the_defaults(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")

    response = await client.delete(PROFILE_URL, headers=_auth(user.id_token))

    assert response.status_code == 200
    assert response.json() == DEFAULT_PROFILE


async def test_changing_the_display_name_does_not_change_the_account_or_the_access_list(
    client: httpx.AsyncClient, admin_user: AdminUserFactory
) -> None:
    admin = await admin_user()
    me_before = (await client.get("/api/v1/me", headers=_auth(admin.id_token))).json()
    access_before = (await client.get("/api/v1/admin/access", headers=_auth(admin.id_token))).json()

    await client.patch(
        PROFILE_URL, json={"display_name": "Otro Nombre"}, headers=_auth(admin.id_token)
    )

    me_after = (await client.get("/api/v1/me", headers=_auth(admin.id_token))).json()
    access_after = (await client.get("/api/v1/admin/access", headers=_auth(admin.id_token))).json()
    assert me_after == me_before
    assert access_after == access_before
    assert "Otro Nombre" not in str(me_after) + str(access_after)


async def test_two_simultaneous_avatar_choices_both_succeed_and_count_twice(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("owner@example.com")
    headers = _auth(user.id_token)

    responses = await asyncio.gather(
        client.patch(
            PROFILE_URL, json={"avatar": {"kind": "preset", "preset": "avatar-01"}}, headers=headers
        ),
        client.patch(
            PROFILE_URL, json={"avatar": {"kind": "preset", "preset": "avatar-02"}}, headers=headers
        ),
    )

    assert [response.status_code for response in responses] == [200, 200]
    final = (await client.get(PROFILE_URL, headers=headers)).json()
    assert final["avatar"]["version"] == 2
    assert final["avatar"]["preset"] in {"avatar-01", "avatar-02"}


# --- Progress settings (feature 007) -------------------------------------------------------


async def test_patch_profile_saves_the_progress_settings(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    changes = {
        "daily_goal": 5,
        "active_weekdays": [5, 1, 2, 3, 4],
        "timezone": "Atlantic/Canary",
        "morning_review": False,
        "arcade_mode": False,
    }

    response = await client.patch(PROFILE_URL, json=changes, headers=_auth(user.id_token))

    assert response.status_code == 200
    body = response.json()
    assert body["daily_goal"] == 5
    assert body["active_weekdays"] == [1, 2, 3, 4, 5]
    assert body["timezone"] == "Atlantic/Canary"
    assert body["morning_review"] is False
    assert body["arcade_mode"] is False


@pytest.mark.parametrize(
    "changes",
    [
        {"daily_goal": 0},
        {"daily_goal": 21},
        {"daily_goal": "3"},
        {"daily_goal": True},
        {"active_weekdays": []},
        {"active_weekdays": [1, 1]},
        {"active_weekdays": [8]},
        {"timezone": "Mars/Olympus"},
        {"timezone": None},
        {"daily_goal": None},
        {"morning_review": None},
        {"arcade_mode": "yes"},
    ],
)
async def test_patch_profile_rejects_invalid_progress_settings_and_saves_nothing(
    changes: dict[str, object],
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")

    response = await client.patch(
        PROFILE_URL, json={"theme": "dark", **changes}, headers=_auth(user.id_token)
    )

    assert response.status_code == 422
    snapshot = await _profile_ref(firestore_client, user.uid).get()
    assert not snapshot.exists


async def test_reset_keeps_the_progress_settings(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    user = await google_user("ana@example.com")
    await client.patch(
        PROFILE_URL,
        json={"daily_goal": 7, "arcade_mode": False, "theme": "dark"},
        headers=_auth(user.id_token),
    )

    response = await client.delete(PROFILE_URL, headers=_auth(user.id_token))

    body = response.json()
    assert body["theme"] == "system"
    assert body["daily_goal"] == 7
    assert body["arcade_mode"] is False


async def test_changing_the_time_zone_moves_today_but_not_the_closed_days(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    firestore_client: firestore.AsyncClient,
) -> None:
    user = await google_user("ana@example.com")
    # 05:00 UTC: 06:00 in Madrid (a new day) but 00:00 in New York (still yesterday).
    now = {"X-Test-Now": "2026-11-04T05:00:00+00:00"}
    madrid = await client.get("/api/v1/me/progress", headers={**_auth(user.id_token), **now})
    closed = (
        await firestore_client.collection("users")
        .document(user.uid)
        .collection("progress")
        .document("state")
        .get()
    ).to_dict()

    await client.patch(
        PROFILE_URL, json={"timezone": "America/New_York"}, headers=_auth(user.id_token)
    )
    new_york = await client.get("/api/v1/me/progress", headers={**_auth(user.id_token), **now})

    assert madrid.json()["today"] == "2026-11-04"
    assert new_york.json()["today"] == "2026-11-03"
    after = (
        await firestore_client.collection("users")
        .document(user.uid)
        .collection("progress")
        .document("state")
        .get()
    ).to_dict()
    assert after is not None and closed is not None
    assert after["last_closed_day"] == closed["last_closed_day"]
