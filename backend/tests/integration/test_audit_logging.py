from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import pytest
from firebase_admin import auth

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration

LOGGER_NAME = "mytasks_api"


def _records(caplog: pytest.LogCaptureFixture, message: str) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.getMessage() == message]


def _trashed_fields() -> dict[str, object]:
    now = datetime.now(UTC)
    return {"in_trash": True, "trashed_at": now, "purge_at": now + timedelta(days=30)}


async def test_failed_authentication_is_logged_without_the_token(
    client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board"},
        headers={"Authorization": "Bearer not-a-real-token-1234567890"},
    )

    assert response.status_code == 401
    records = _records(caplog, "auth_failed")
    assert len(records) == 1
    assert records[0].levelno == logging.WARNING
    assert records[0].reason  # type: ignore[attr-defined]
    assert "not-a-real-token-1234567890" not in caplog.text


async def test_missing_token_is_logged_as_an_authentication_failure(
    client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.get("/api/v1/tasks", params={"view": "board"})

    assert response.status_code == 401
    assert [record.reason for record in _records(caplog, "auth_failed")] == [  # type: ignore[attr-defined]
        "missing_token"
    ]


async def test_token_verifier_outage_returns_503_and_logs_an_error(
    client: httpx.AsyncClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _unavailable(*_: object, **__: object) -> None:
        raise auth.CertificateFetchError("no se pudieron obtener los certificados", None)

    monkeypatch.setattr(auth, "verify_id_token", _unavailable)
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.get(
        "/api/v1/tasks",
        params={"view": "board"},
        headers={"Authorization": "Bearer any-token"},
    )

    assert response.status_code == 503
    assert response.json()["code"] == "auth_unavailable"
    records = _records(caplog, "auth_verifier_unavailable")
    assert len(records) == 1
    assert records[0].levelno == logging.ERROR
    assert not _records(caplog, "auth_failed")


@pytest.mark.parametrize(
    ("action", "method", "path_suffix", "seed", "expected_status"),
    [
        ("complete", "POST", "/complete", {}, 200),
        ("reopen", "POST", "/reopen", {"status": "completed"}, 200),
        ("trash", "POST", "/trash", {}, 200),
        ("restore", "POST", "/restore", _trashed_fields(), 200),
        ("delete", "DELETE", "", _trashed_fields(), 204),
    ],
)
async def test_state_changes_are_logged_with_uid_and_task_id(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    caplog: pytest.LogCaptureFixture,
    action: str,
    method: str,
    path_suffix: str,
    seed: dict[str, object],
    expected_status: int,
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, **seed)
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.request(
        method,
        f"/api/v1/tasks/{task_id}{path_suffix}",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == expected_status
    records = _records(caplog, "task_transition")
    assert len(records) == 1
    assert records[0].action == action  # type: ignore[attr-defined]
    assert records[0].uid == user.uid  # type: ignore[attr-defined]
    assert records[0].task_id == task_id  # type: ignore[attr-defined]


async def test_state_changes_never_log_task_content_or_the_token(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid, title="Título muy privado", description="Detalle privado")
    caplog.set_level(logging.DEBUG, logger=LOGGER_NAME)

    await client.post(
        f"/api/v1/tasks/{task_id}/trash",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert "Título muy privado" not in caplog.text
    assert "Detalle privado" not in caplog.text
    assert user.id_token not in caplog.text


async def test_access_to_a_missing_or_foreign_task_is_logged(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    owner = await google_user("owner@example.com")
    intruder = await google_user("intruder@example.com")
    task_id = await seed_task(owner.uid)
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.post(
        f"/api/v1/tasks/{task_id}/trash",
        headers={"Authorization": f"Bearer {intruder.id_token}"},
    )

    assert response.status_code == 404
    records = _records(caplog, "task_not_found")
    assert len(records) == 1
    assert records[0].levelno == logging.WARNING
    assert records[0].uid == intruder.uid  # type: ignore[attr-defined]
    assert records[0].task_id == task_id  # type: ignore[attr-defined]
    assert records[0].action == "trash"  # type: ignore[attr-defined]


async def test_responses_include_a_request_id_that_appears_in_the_logs(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_task: SeedTaskFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    user = await google_user("owner@example.com")
    task_id = await seed_task(user.uid)
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.post(
        f"/api/v1/tasks/{task_id}/complete",
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    request_id = response.headers["x-request-id"]
    assert [record.request_id for record in _records(caplog, "task_transition")] == [  # type: ignore[attr-defined]
        request_id
    ]


async def test_profile_update_is_logged_with_the_uid_and_only_the_names_of_the_fields(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    user = await google_user("owner@example.com")
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.patch(
        "/api/v1/me/profile",
        json={"display_name": "Nombre Muy Privado", "theme": "dark", "history_days": 90},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 200
    (record,) = _records(caplog, "profile_updated")
    assert record.uid == user.uid  # type: ignore[attr-defined]
    assert record.fields == "display_name,history_days,theme"  # type: ignore[attr-defined]
    assert "Nombre Muy Privado" not in caplog.text
    assert "owner@example.com" not in caplog.text
    assert user.id_token not in caplog.text


async def test_profile_avatar_choice_is_logged_by_field_name_only(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    user = await google_user("owner@example.com")
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    await client.patch(
        "/api/v1/me/profile",
        json={"avatar": {"kind": "preset", "preset": "avatar-05"}},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    (record,) = _records(caplog, "profile_updated")
    assert record.fields == "avatar"  # type: ignore[attr-defined]
    assert "avatar-05" not in caplog.text


async def test_profile_reset_is_logged_with_the_uid_and_the_reset_field_names(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    user = await google_user("owner@example.com")
    await client.patch(
        "/api/v1/me/profile",
        json={"theme": "dark", "display_name": "Nombre Muy Privado"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )
    caplog.clear()
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    await client.delete("/api/v1/me/profile", headers={"Authorization": f"Bearer {user.id_token}"})

    (record,) = _records(caplog, "profile_reset")
    assert record.uid == user.uid  # type: ignore[attr-defined]
    assert record.fields == "board_order,default_scope,density,history_days,theme"  # type: ignore[attr-defined]
    assert "Nombre Muy Privado" not in caplog.text


async def test_a_rejected_profile_update_is_not_logged_as_an_update(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    user = await google_user("owner@example.com")
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.patch(
        "/api/v1/me/profile",
        json={"theme": "neon"},
        headers={"Authorization": f"Bearer {user.id_token}"},
    )

    assert response.status_code == 422
    assert _records(caplog, "profile_updated") == []


async def test_an_avatar_upload_is_logged_with_the_uid_and_the_final_size_only(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    import io

    from PIL import Image

    user = await google_user("owner@example.com")
    buffer = io.BytesIO()
    Image.new("RGB", (90, 90), (10, 120, 10)).save(buffer, format="PNG")
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.put(
        "/api/v1/me/avatar",
        content=buffer.getvalue(),
        headers={"Authorization": f"Bearer {user.id_token}", "Content-Type": "image/png"},
    )
    stored = await client.get(
        "/api/v1/me/avatar", headers={"Authorization": f"Bearer {user.id_token}"}
    )

    assert response.status_code == 200
    (record,) = _records(caplog, "avatar_uploaded")
    assert record.uid == user.uid  # type: ignore[attr-defined]
    assert record.size == str(len(stored.content))  # type: ignore[attr-defined]
    assert "owner@example.com" not in caplog.text
    assert user.id_token not in caplog.text
    assert "RIFF" not in caplog.text
    assert "WEBP" not in caplog.text


async def test_an_avatar_removal_is_logged_with_the_uid(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    user = await google_user("owner@example.com")
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    await client.delete("/api/v1/me/avatar", headers={"Authorization": f"Bearer {user.id_token}"})

    (record,) = _records(caplog, "avatar_removed")
    assert record.uid == user.uid  # type: ignore[attr-defined]


async def test_a_rejected_avatar_upload_is_not_logged_as_an_upload_and_leaks_no_content(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, caplog: pytest.LogCaptureFixture
) -> None:
    user = await google_user("owner@example.com")
    caplog.set_level(logging.INFO, logger=LOGGER_NAME)

    response = await client.put(
        "/api/v1/me/avatar",
        content=b"contenido-secreto-del-archivo",
        headers={"Authorization": f"Bearer {user.id_token}", "Content-Type": "image/png"},
    )

    assert response.status_code == 415
    assert _records(caplog, "avatar_uploaded") == []
    assert "contenido-secreto-del-archivo" not in caplog.text
