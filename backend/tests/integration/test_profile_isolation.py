from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedAccountFactory

pytestmark = pytest.mark.integration

PROFILE_URL = "/api/v1/me/profile"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_two_accounts_keep_separate_profiles(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    ana = await google_user("ana@example.com")
    bob = await google_user("bob@example.com")

    await client.patch(
        PROFILE_URL,
        json={"theme": "dark", "display_name": "Ana"},
        headers=_auth(ana.id_token),
    )
    await client.patch(
        PROFILE_URL,
        json={"theme": "light", "display_name": "Bob"},
        headers=_auth(bob.id_token),
    )

    ana_profile = (await client.get(PROFILE_URL, headers=_auth(ana.id_token))).json()
    bob_profile = (await client.get(PROFILE_URL, headers=_auth(bob.id_token))).json()
    assert (ana_profile["theme"], ana_profile["display_name"]) == ("dark", "Ana")
    assert (bob_profile["theme"], bob_profile["display_name"]) == ("light", "Bob")


async def test_resetting_one_profile_leaves_the_other_untouched(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    ana = await google_user("ana@example.com")
    bob = await google_user("bob@example.com")
    await client.patch(PROFILE_URL, json={"theme": "dark"}, headers=_auth(ana.id_token))
    await client.patch(PROFILE_URL, json={"theme": "dark"}, headers=_auth(bob.id_token))

    await client.delete(PROFILE_URL, headers=_auth(ana.id_token))

    assert (await client.get(PROFILE_URL, headers=_auth(ana.id_token))).json()["theme"] == "system"
    assert (await client.get(PROFILE_URL, headers=_auth(bob.id_token))).json()["theme"] == "dark"


async def test_no_client_parameter_can_point_to_another_uid(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    ana = await google_user("ana@example.com")
    bob = await google_user("bob@example.com")
    await client.patch(PROFILE_URL, json={"theme": "dark"}, headers=_auth(bob.id_token))

    in_query = await client.get(
        PROFILE_URL, params={"uid": bob.uid, "user_id": bob.uid}, headers=_auth(ana.id_token)
    )
    in_headers = await client.get(
        PROFILE_URL, headers={**_auth(ana.id_token), "X-User-Id": bob.uid, "X-Uid": bob.uid}
    )
    in_body = await client.patch(
        PROFILE_URL, json={"uid": bob.uid, "theme": "light"}, headers=_auth(ana.id_token)
    )
    in_path = await client.get(f"{PROFILE_URL}/{bob.uid}", headers=_auth(ana.id_token))

    assert in_query.json()["theme"] == "system"
    assert in_headers.json()["theme"] == "system"
    assert in_body.status_code == 422
    assert in_path.status_code in {404, 405}
    assert (await client.get(PROFILE_URL, headers=_auth(bob.id_token))).json()["theme"] == "dark"


async def test_a_revoked_account_keeps_its_profile_after_being_reactivated(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_account: SeedAccountFactory,
) -> None:
    user = await google_user("ana@example.com")
    await client.patch(
        PROFILE_URL,
        json={"theme": "dark", "display_name": "Ana", "history_days": 30},
        headers=_auth(user.id_token),
    )

    await seed_account(user.uid, user.email, status="revoked")
    revoked = await client.get(PROFILE_URL, headers=_auth(user.id_token))
    await seed_account(user.uid, user.email, status="active")
    restored = await client.get(PROFILE_URL, headers=_auth(user.id_token))

    assert revoked.status_code == 403
    assert restored.status_code == 200
    body = restored.json()
    assert (body["theme"], body["display_name"], body["history_days"]) == ("dark", "Ana", 30)


AVATAR_URL = "/api/v1/me/avatar"


def _picture(color: tuple[int, int, int]) -> bytes:
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(buffer, format="PNG")
    return buffer.getvalue()


async def _put_avatar(client: httpx.AsyncClient, token: str, content: bytes) -> httpx.Response:
    return await client.put(
        AVATAR_URL, content=content, headers={**_auth(token), "Content-Type": "image/png"}
    )


async def test_each_account_gets_only_its_own_avatar_image(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    ana = await google_user("ana@example.com")
    bob = await google_user("bob@example.com")
    await _put_avatar(client, ana.id_token, _picture((220, 20, 20)))
    await _put_avatar(client, bob.id_token, _picture((20, 20, 220)))

    ana_image = (await client.get(AVATAR_URL, headers=_auth(ana.id_token))).content
    bob_image = (await client.get(AVATAR_URL, headers=_auth(bob.id_token))).content

    assert ana_image != bob_image
    assert ana_image == (await client.get(AVATAR_URL, headers=_auth(ana.id_token))).content


async def test_an_account_without_an_image_never_gets_someone_elses(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    ana = await google_user("ana@example.com")
    bob = await google_user("bob@example.com")
    await _put_avatar(client, bob.id_token, _picture((20, 20, 220)))

    response = await client.get(
        AVATAR_URL, params={"uid": bob.uid, "user_id": bob.uid}, headers=_auth(ana.id_token)
    )

    assert response.status_code == 404


async def test_no_route_or_header_accepts_another_uid_for_the_avatar(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    ana = await google_user("ana@example.com")
    bob = await google_user("bob@example.com")
    await _put_avatar(client, bob.id_token, _picture((20, 20, 220)))

    by_path = await client.get(f"{AVATAR_URL}/{bob.uid}", headers=_auth(ana.id_token))
    by_header = await client.get(
        AVATAR_URL, headers={**_auth(ana.id_token), "X-User-Id": bob.uid, "X-Uid": bob.uid}
    )
    put_by_path = await client.put(
        f"{AVATAR_URL}/{bob.uid}",
        content=_picture((0, 0, 0)),
        headers={**_auth(ana.id_token), "Content-Type": "image/png"},
    )
    delete_by_path = await client.delete(f"{AVATAR_URL}/{bob.uid}", headers=_auth(ana.id_token))

    assert by_path.status_code in {404, 405}
    assert by_header.status_code == 404
    assert put_by_path.status_code in {404, 405}
    assert delete_by_path.status_code in {404, 405}
    assert (await client.get(AVATAR_URL, headers=_auth(bob.id_token))).status_code == 200


async def test_removing_one_avatar_leaves_the_other_account_image(
    client: httpx.AsyncClient, google_user: GoogleUserFactory
) -> None:
    ana = await google_user("ana@example.com")
    bob = await google_user("bob@example.com")
    await _put_avatar(client, ana.id_token, _picture((220, 20, 20)))
    await _put_avatar(client, bob.id_token, _picture((20, 20, 220)))

    await client.delete(AVATAR_URL, headers=_auth(ana.id_token))

    assert (await client.get(AVATAR_URL, headers=_auth(ana.id_token))).status_code == 404
    assert (await client.get(AVATAR_URL, headers=_auth(bob.id_token))).status_code == 200


async def test_a_revoked_account_gets_403_but_keeps_its_image(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_account: SeedAccountFactory,
) -> None:
    user = await google_user("ana@example.com")
    await _put_avatar(client, user.id_token, _picture((220, 20, 20)))
    before = (await client.get(AVATAR_URL, headers=_auth(user.id_token))).content

    await seed_account(user.uid, user.email, status="revoked")
    revoked = await client.get(AVATAR_URL, headers=_auth(user.id_token))
    await seed_account(user.uid, user.email, status="active")
    restored = await client.get(AVATAR_URL, headers=_auth(user.id_token))

    assert revoked.status_code == 403
    assert restored.status_code == 200
    assert restored.content == before
