from __future__ import annotations

import asyncio
import io
import random
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

import httpx
import pytest
from PIL import Image

from mytasks_api.domain.avatar_image import MAX_INPUT_BYTES

if TYPE_CHECKING:
    from google.cloud import firestore

    from tests.conftest import GoogleUser, GoogleUserFactory, SeedAccountFactory

pytestmark = pytest.mark.integration

AVATAR_URL = "/api/v1/me/avatar"
PROFILE_URL = "/api/v1/me/profile"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _image(
    image_format: str, color: tuple[int, int, int] = (200, 40, 40), size: int = 120
) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (size, size), color).save(buffer, format=image_format)
    return buffer.getvalue()


def _headers(user: GoogleUser, content_type: str = "image/png") -> dict[str, str]:
    return {**_auth(user.id_token), "Content-Type": content_type}


async def _upload(
    client: httpx.AsyncClient, user: GoogleUser, content: bytes, content_type: str = "image/png"
) -> httpx.Response:
    return await client.put(AVATAR_URL, content=content, headers=_headers(user, content_type))


async def _avatar_documents(firestore_client: firestore.AsyncClient, uid: str) -> list[str]:
    settings = firestore_client.collection("users").document(uid).collection("settings")
    return sorted([document.id async for document in settings.stream()])


async def _profile(client: httpx.AsyncClient, user: GoogleUser) -> dict[str, object]:
    return (await client.get(PROFILE_URL, headers=_auth(user.id_token))).json()


class TestAccess:
    async def test_every_method_requires_a_token(self, client: httpx.AsyncClient) -> None:
        for method in ("GET", "PUT", "DELETE"):
            response = await client.request(method, AVATAR_URL, content=_image("PNG"))

            assert response.status_code == 401, method
            assert response.json()["code"] == "unauthenticated"

    async def test_a_signed_in_person_without_an_account_gets_403(
        self, client: httpx.AsyncClient, google_user_without_account: GoogleUserFactory
    ) -> None:
        stranger = await google_user_without_account("stranger@example.com")

        for method in ("GET", "PUT", "DELETE"):
            response = await client.request(
                method, AVATAR_URL, content=_image("PNG"), headers=_headers(stranger)
            )

            assert response.status_code == 403, method
            assert response.json()["code"] == "access_denied"

    async def test_a_revoked_account_gets_403(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        seed_account: SeedAccountFactory,
    ) -> None:
        user = await google_user("revoked@example.com")
        await seed_account(user.uid, user.email, status="revoked")

        for method in ("GET", "PUT", "DELETE"):
            response = await client.request(
                method, AVATAR_URL, content=_image("PNG"), headers=_headers(user)
            )

            assert response.status_code == 403, method


class TestUpload:
    @pytest.mark.parametrize(
        ("image_format", "content_type"),
        [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")],
    )
    async def test_each_accepted_format_is_stored_as_a_square_webp(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        image_format: str,
        content_type: str,
    ) -> None:
        user = await google_user("owner@example.com")

        response = await _upload(client, user, _image(image_format), content_type)

        assert response.status_code == 200
        assert response.json()["avatar"] == {"kind": "upload", "preset": None, "version": 1}
        stored = await client.get(AVATAR_URL, headers=_auth(user.id_token))
        picture = Image.open(io.BytesIO(stored.content))
        assert (picture.format, picture.size) == ("WEBP", (256, 256))

    async def test_the_content_decides_and_not_the_declared_type(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")

        accepted = await _upload(client, user, _image("PNG"), "image/jpeg")
        rejected = await _upload(client, user, b"no soy una imagen", "image/png")

        assert accepted.status_code == 200
        assert rejected.status_code == 415

    async def test_replacing_the_image_leaves_a_single_avatar_document(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        firestore_client: firestore.AsyncClient,
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("JPEG", (200, 0, 0)), "image/jpeg")
        first = (await client.get(AVATAR_URL, headers=_auth(user.id_token))).content

        await _upload(client, user, _image("PNG", (0, 0, 200)))
        second = (await client.get(AVATAR_URL, headers=_auth(user.id_token))).content

        assert first != second
        assert await _avatar_documents(firestore_client, user.uid) == ["avatar", "profile"]
        stored = await (
            firestore_client.collection("users")
            .document(user.uid)
            .collection("settings")
            .document("avatar")
            .get()
        )
        assert stored.to_dict()["size"] == len(second)  # type: ignore[index]
        assert stored.to_dict()["content_type"] == "image/webp"  # type: ignore[index]

    async def test_the_version_goes_up_with_every_change_of_avatar(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        headers = _auth(user.id_token)

        versions = [(await _upload(client, user, _image("PNG"))).json()["avatar"]["version"]]
        versions.append(
            (await _upload(client, user, _image("JPEG"), "image/jpeg")).json()["avatar"]["version"]
        )
        versions.append(
            (
                await client.patch(
                    PROFILE_URL,
                    json={"avatar": {"kind": "preset", "preset": "avatar-03"}},
                    headers=headers,
                )
            ).json()["avatar"]["version"]
        )
        versions.append((await _upload(client, user, _image("PNG"))).json()["avatar"]["version"])
        versions.append(
            (await client.delete(AVATAR_URL, headers=headers)).json()["avatar"]["version"]
        )

        assert versions == [1, 2, 3, 4, 5]

    async def test_two_simultaneous_uploads_both_succeed_and_leave_one_image(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        firestore_client: firestore.AsyncClient,
    ) -> None:
        user = await google_user("owner@example.com")

        responses = await asyncio.gather(
            _upload(client, user, _image("PNG", (200, 0, 0))),
            _upload(client, user, _image("PNG", (0, 200, 0))),
        )

        assert [response.status_code for response in responses] == [200, 200]
        assert (await _profile(client, user))["avatar"]["version"] == 2  # type: ignore[index]
        assert await _avatar_documents(firestore_client, user.uid) == ["avatar", "profile"]

    async def test_an_empty_body_is_unsupported(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")

        response = await _upload(client, user, b"")

        assert response.status_code == 415


class TestRejectedUploads:
    async def test_a_file_over_two_megabytes_is_413_by_its_content_length(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")

        response = await _upload(client, user, b"\x89PNG" + b"\x00" * MAX_INPUT_BYTES)

        assert response.status_code == 413
        assert response.json()["code"] == "avatar_too_large"

    async def test_a_file_over_two_megabytes_is_413_even_without_a_content_length(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        read: list[int] = []

        async def body() -> AsyncIterator[bytes]:
            for _ in range(40):  # 40 chunks of 64 KiB = 2.5 MiB, sent without a declared length
                read.append(1)
                yield b"\x00" * 65536

        response = await client.put(AVATAR_URL, content=body(), headers=_headers(user))

        assert response.status_code == 413
        assert response.json()["code"] == "avatar_too_large"
        assert len(read) < 40  # the reading was cut once the limit was passed

    async def test_a_file_just_under_the_limit_is_judged_by_its_content_not_its_size(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")

        response = await _upload(client, user, b"\x00" * MAX_INPUT_BYTES)

        assert response.status_code == 415

    @pytest.mark.parametrize(
        "content",
        [
            b"un texto renombrado a .png",
            b"<html><script>alert(1)</script></html>",
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            _image("GIF"),
            _image("TIFF"),
            _image("PNG")[:60],
            random.Random(5).randbytes(4000),
        ],
    )
    async def test_anything_that_is_not_a_valid_jpeg_png_or_webp_is_415(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory, content: bytes
    ) -> None:
        user = await google_user("owner@example.com")

        response = await _upload(client, user, content)

        assert response.status_code == 415
        assert response.json()["code"] == "avatar_unsupported"

    async def test_a_rejected_upload_keeps_the_previous_avatar_untouched(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        firestore_client: firestore.AsyncClient,
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))
        before = (await client.get(AVATAR_URL, headers=_auth(user.id_token))).content
        profile_before = await _profile(client, user)

        await _upload(client, user, b"not an image")
        await _upload(client, user, b"\x00" * (MAX_INPUT_BYTES + 1))

        after = (await client.get(AVATAR_URL, headers=_auth(user.id_token))).content
        assert after == before
        assert await _profile(client, user) == profile_before
        assert await _avatar_documents(firestore_client, user.uid) == ["avatar", "profile"]

    async def test_a_decompression_bomb_is_415_and_does_not_hang(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        import struct
        import zlib

        def chunk(kind: bytes, payload: bytes) -> bytes:
            return (
                struct.pack(">I", len(payload))
                + kind
                + payload
                + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
            )

        header = struct.pack(">IIBBBBB", 40_000, 40_000, 1, 0, 0, 0, 0)
        bomb = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(b"\x00" * 64))
            + chunk(b"IEND", b"")
        )
        user = await google_user("owner@example.com")

        response = await asyncio.wait_for(_upload(client, user, bomb), timeout=10)

        assert response.status_code == 415


class TestRateLimit:
    async def test_the_eleventh_upload_in_an_hour_is_429_with_retry_after(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        firestore_client: firestore.AsyncClient,
    ) -> None:
        user = await google_user("owner@example.com")
        for index in range(10):
            response = await _upload(client, user, _image("PNG", (index * 20, 0, 0)))
            assert response.status_code == 200, index
        before = (await client.get(AVATAR_URL, headers=_auth(user.id_token))).content

        response = await _upload(client, user, _image("PNG", (0, 255, 0)))

        assert response.status_code == 429
        assert response.json()["code"] == "avatar_rate_limited"
        assert 1 <= int(response.headers["Retry-After"]) <= 3600
        assert (await client.get(AVATAR_URL, headers=_auth(user.id_token))).content == before
        assert (await _profile(client, user))["avatar"]["version"] == 10  # type: ignore[index]

    async def test_removing_the_avatar_does_not_count_for_the_limit_nor_reset_it(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        for _ in range(10):
            await _upload(client, user, _image("PNG"))

        removal = await client.delete(AVATAR_URL, headers=_auth(user.id_token))
        again = await _upload(client, user, _image("PNG"))

        assert removal.status_code == 200
        assert again.status_code == 429

    async def test_rejected_files_do_not_count_as_uploads(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        for _ in range(12):
            assert (await _upload(client, user, b"not an image")).status_code == 415

        for _ in range(10):
            assert (await _upload(client, user, _image("PNG"))).status_code == 200

    async def test_the_limit_is_per_person(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        ana = await google_user("ana@example.com")
        bob = await google_user("bob@example.com")
        for _ in range(10):
            await _upload(client, ana, _image("PNG"))

        assert (await _upload(client, ana, _image("PNG"))).status_code == 429
        assert (await _upload(client, bob, _image("PNG"))).status_code == 200

    async def test_a_profile_reset_does_not_clear_the_upload_counter(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        for _ in range(10):
            await _upload(client, user, _image("PNG"))

        await client.delete(PROFILE_URL, headers=_auth(user.id_token))

        assert (await _upload(client, user, _image("PNG"))).status_code == 429


class TestRead:
    async def test_get_serves_the_image_with_the_privacy_and_cache_headers(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))

        response = await client.get(AVATAR_URL, params={"v": 1}, headers=_auth(user.id_token))

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/webp"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["cache-control"] == "private, max-age=31536000, immutable"

    async def test_the_cached_image_is_only_reused_for_the_same_credentials(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        # The URL is the same for everyone (`?v=1` is the first version of every person), so
        # without `Vary` a browser shared by two people could show one the other's picture.
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))

        response = await client.get(AVATAR_URL, params={"v": 1}, headers=_auth(user.id_token))

        varied = {name.strip().lower() for name in response.headers["vary"].split(",")}
        assert "authorization" in varied

    async def test_the_version_in_the_url_is_ignored_by_the_server(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))

        plain = await client.get(AVATAR_URL, headers=_auth(user.id_token))
        versioned = await client.get(AVATAR_URL, params={"v": 99}, headers=_auth(user.id_token))
        invalid = await client.get(AVATAR_URL, params={"v": -1}, headers=_auth(user.id_token))

        assert plain.content == versioned.content
        assert invalid.status_code == 422

    async def test_without_an_uploaded_image_get_is_404(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")

        response = await client.get(AVATAR_URL, headers=_auth(user.id_token))

        assert response.status_code == 404
        assert response.json()["code"] == "avatar_not_found"

    async def test_other_responses_keep_the_no_store_cache_header(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))

        for response in (
            await client.get(PROFILE_URL, headers=_auth(user.id_token)),
            await client.get(AVATAR_URL + "-missing", headers=_auth(user.id_token)),
            await client.put(AVATAR_URL, content=b"x", headers=_headers(user)),
        ):
            assert response.headers["cache-control"] == "no-store"


class TestRemoval:
    async def test_delete_removes_the_image_and_goes_back_to_the_initials(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        firestore_client: firestore.AsyncClient,
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))

        response = await client.delete(AVATAR_URL, headers=_auth(user.id_token))

        assert response.status_code == 200
        assert response.json()["avatar"] == {"kind": "initials", "preset": None, "version": 2}
        assert (await client.get(AVATAR_URL, headers=_auth(user.id_token))).status_code == 404
        assert await _avatar_documents(firestore_client, user.uid) == ["profile"]

    async def test_delete_is_idempotent(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))
        first = await client.delete(AVATAR_URL, headers=_auth(user.id_token))

        second = await client.delete(AVATAR_URL, headers=_auth(user.id_token))
        third = await client.delete(AVATAR_URL, headers=_auth(user.id_token))

        assert [first.status_code, second.status_code, third.status_code] == [200, 200, 200]
        assert second.json() == third.json() == first.json()

    async def test_delete_without_any_avatar_returns_the_defaults(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")

        response = await client.delete(AVATAR_URL, headers=_auth(user.id_token))

        assert response.status_code == 200
        assert response.json()["avatar"] == {"kind": "initials", "preset": None, "version": 0}

    async def test_delete_also_removes_a_catalog_avatar(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        await client.patch(
            PROFILE_URL,
            json={"avatar": {"kind": "preset", "preset": "avatar-04"}},
            headers=_auth(user.id_token),
        )

        response = await client.delete(AVATAR_URL, headers=_auth(user.id_token))

        assert response.json()["avatar"] == {"kind": "initials", "preset": None, "version": 2}

    @pytest.mark.parametrize(
        "choice",
        [{"kind": "preset", "preset": "avatar-02"}, {"kind": "initials"}],
    )
    async def test_choosing_a_preset_or_initials_deletes_the_uploaded_image(
        self,
        client: httpx.AsyncClient,
        google_user: GoogleUserFactory,
        firestore_client: firestore.AsyncClient,
        choice: dict[str, str],
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))

        response = await client.patch(
            PROFILE_URL, json={"avatar": choice}, headers=_auth(user.id_token)
        )

        assert response.status_code == 200
        assert (await client.get(AVATAR_URL, headers=_auth(user.id_token))).status_code == 404
        assert await _avatar_documents(firestore_client, user.uid) == ["profile"]

    async def test_a_profile_reset_keeps_the_uploaded_image(
        self, client: httpx.AsyncClient, google_user: GoogleUserFactory
    ) -> None:
        user = await google_user("owner@example.com")
        await _upload(client, user, _image("PNG"))

        await client.delete(PROFILE_URL, headers=_auth(user.id_token))

        assert (await client.get(AVATAR_URL, headers=_auth(user.id_token))).status_code == 200
        assert (await _profile(client, user))["avatar"]["kind"] == "upload"  # type: ignore[index]
