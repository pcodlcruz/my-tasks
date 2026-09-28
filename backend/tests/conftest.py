import json
import os
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx
import pytest
from google.cloud import firestore

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "demo-mytasks")
FIRESTORE_EMULATOR_HOST = os.environ.get("FIRESTORE_EMULATOR_HOST", "localhost:8080")
FIREBASE_AUTH_EMULATOR_HOST = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")


def _require_emulators() -> None:
    if not PROJECT_ID.startswith("demo-"):
        pytest.exit(
            "GOOGLE_CLOUD_PROJECT debe empezar por 'demo-' en tests "
            "(nunca se usa un proyecto real). Actual: " + PROJECT_ID
        )
    os.environ.setdefault("FIRESTORE_EMULATOR_HOST", FIRESTORE_EMULATOR_HOST)
    os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", FIREBASE_AUTH_EMULATOR_HOST)
    try:
        httpx.get(f"http://{FIRESTORE_EMULATOR_HOST}/", timeout=1.0)
    except httpx.ConnectError:
        pytest.exit(
            "El emulador de Firestore no responde en "
            f"{FIRESTORE_EMULATOR_HOST}. Arráncalo con `firebase emulators:start` "
            "antes de ejecutar los tests de integración."
        )
    try:
        httpx.get(f"http://{FIREBASE_AUTH_EMULATOR_HOST}/", timeout=1.0)
    except httpx.ConnectError:
        pytest.exit(
            "El emulador de Auth no responde en "
            f"{FIREBASE_AUTH_EMULATOR_HOST}. Arráncalo con `firebase emulators:start` "
            "antes de ejecutar los tests de integración."
        )


@pytest.fixture
def firestore_client() -> firestore.AsyncClient:
    _require_emulators()
    return firestore.AsyncClient(project=PROJECT_ID)


@pytest.fixture(autouse=True)
async def _clean_emulators(request: pytest.FixtureRequest) -> AsyncGenerator[None]:
    yield
    if request.node.get_closest_marker("integration") is None:
        return
    async with httpx.AsyncClient() as client:
        await client.delete(
            f"http://{FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/{PROJECT_ID}"
            "/databases/(default)/documents"
        )
        await client.delete(
            f"http://{FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/{PROJECT_ID}/accounts"
        )


@dataclass(frozen=True)
class GoogleUser:
    uid: str
    email: str
    id_token: str


GoogleUserFactory = Callable[[str], Awaitable[GoogleUser]]
SeedTaskFactory = Callable[..., Awaitable[str]]


async def _google_user(email: str) -> GoogleUser:
    _require_emulators()
    fake_id_token = json.dumps({"sub": str(uuid.uuid4()), "email": email, "email_verified": True})
    post_body = urlencode({"id_token": fake_id_token, "providerId": "google.com"})
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"http://{FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com"
            "/v1/accounts:signInWithIdp",
            params={"key": "fake-api-key"},
            json={
                "postBody": post_body,
                "requestUri": "http://localhost",
                "returnIdpCredential": True,
                "returnSecureToken": True,
            },
        )
        response.raise_for_status()
        payload = response.json()
    return GoogleUser(uid=payload["localId"], email=email, id_token=payload["idToken"])


@pytest.fixture
def google_user() -> Callable[[str], Awaitable[GoogleUser]]:
    return _google_user


@pytest.fixture
def seed_task(firestore_client: firestore.AsyncClient) -> Callable[..., Awaitable[str]]:
    async def _seed(uid: str, **fields: object) -> str:
        now = datetime.now(UTC)
        defaults: dict[str, object] = {
            "title": "Tarea de prueba",
            "description": "Descripción de prueba",
            "urgent": True,
            "important": True,
            "scope": "work",
            "pinned": False,
            "status": "active",
            "in_trash": False,
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
            "trashed_at": None,
            "purge_at": None,
        }
        defaults.update(fields)
        doc_ref: firestore.AsyncDocumentReference = (
            firestore_client.collection("users").document(uid).collection("tasks").document()
        )
        await doc_ref.set(defaults)
        return str(doc_ref.id)

    return _seed


@pytest.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient]:
    _require_emulators()
    from mytasks_api.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
