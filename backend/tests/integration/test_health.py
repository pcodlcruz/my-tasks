import time
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest

from mytasks_api.factory import get_firestore_client_factory

pytestmark = pytest.mark.integration


class _UnreachableFirestore:
    """Stands in for a Firestore client whose backend cannot be reached."""

    def collection(self, _: str) -> "_UnreachableFirestore":
        return self

    def document(self, _: str) -> "_UnreachableFirestore":
        return self

    async def get(self, **_: Any) -> None:
        message = "firestore unreachable: internal detail that must not leak"
        raise ConnectionError(message)


def _credentials_missing() -> _UnreachableFirestore:
    message = "could not find default credentials: internal detail that must not leak"
    raise RuntimeError(message)


def _slow_client() -> _UnreachableFirestore:
    # Credential discovery outside Google Cloud can block for many seconds. The thread
    # cannot be cancelled, so the sleep stays short enough not to delay the test session.
    time.sleep(6)
    return _UnreachableFirestore()


def _override_client(factory: Callable[[], Any]) -> Iterator[None]:
    # Imported here, not at module level: importing the app builds it from the environment,
    # and at collection time the conftest has not yet set APP_ENV=local for the emulators.
    from mytasks_api.main import app

    app.dependency_overrides[get_firestore_client_factory] = lambda: factory
    yield
    app.dependency_overrides.pop(get_firestore_client_factory, None)


@pytest.fixture
def unreachable_firestore() -> Iterator[None]:
    yield from _override_client(_UnreachableFirestore)


@pytest.fixture
def missing_credentials() -> Iterator[None]:
    yield from _override_client(_credentials_missing)


@pytest.fixture
def slow_client() -> Iterator[None]:
    yield from _override_client(_slow_client)


async def test_healthz_includes_the_version_without_authentication(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "dev"}


async def test_readyz_returns_200_when_firestore_is_reachable(client: httpx.AsyncClient) -> None:
    response = await client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


async def test_readyz_returns_503_when_firestore_is_unreachable(
    client: httpx.AsyncClient, unreachable_firestore: None
) -> None:
    response = await client.get("/readyz")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


async def test_readyz_returns_503_when_the_client_cannot_be_created(
    client: httpx.AsyncClient, missing_credentials: None
) -> None:
    response = await client.get("/readyz")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


async def test_readyz_answers_503_within_the_timeout_when_the_client_is_slow(
    client: httpx.AsyncClient, slow_client: None
) -> None:
    started = time.monotonic()
    response = await client.get("/readyz")
    elapsed = time.monotonic() - started

    assert response.status_code == 503
    assert elapsed < 5


@pytest.mark.parametrize("scenario", ["unreachable_firestore", "missing_credentials"])
async def test_readyz_does_not_leak_internal_details_on_failure(
    client: httpx.AsyncClient, request: pytest.FixtureRequest, scenario: str
) -> None:
    request.getfixturevalue(scenario)

    response = await client.get("/readyz")

    assert "unreachable" not in response.text
    assert "credentials" not in response.text
    assert "internal detail" not in response.text


async def test_readyz_does_not_read_user_data(client: httpx.AsyncClient) -> None:
    response = await client.get("/readyz")

    assert set(response.json()) == {"status"}
