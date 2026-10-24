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
