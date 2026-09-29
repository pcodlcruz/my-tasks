import httpx
import pytest

from mytasks_api.config import Settings
from mytasks_api.factory import create_app

pytestmark = pytest.mark.unit


def _app_client(**values: object) -> httpx.AsyncClient:
    settings = Settings(_env_file=None, **values)  # type: ignore[call-arg,arg-type]
    transport = httpx.ASGITransport(app=create_app(settings))
    return httpx.AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture(autouse=True)
def _clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for variable in (
        "FIRESTORE_EMULATOR_HOST",
        "FIREBASE_AUTH_EMULATOR_HOST",
        "APP_ENV",
        "GOOGLE_CLOUD_PROJECT",
    ):
        monkeypatch.delenv(variable, raising=False)


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
async def test_documentation_endpoints_are_disabled_outside_local(path: str) -> None:
    async with _app_client(app_env="production", google_cloud_project="mytasks-prod") as client:
        response = await client.get(path)

    assert response.status_code == 404


@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
async def test_documentation_endpoints_are_available_in_local(path: str) -> None:
    async with _app_client(app_env="local") as client:
        response = await client.get(path)

    assert response.status_code == 200


async def test_responses_carry_security_headers() -> None:
    async with _app_client(app_env="local") as client:
        response = await client.get("/healthz")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"


async def test_responses_carry_a_request_id() -> None:
    async with _app_client(app_env="local") as client:
        first = await client.get("/healthz")
        second = await client.get("/healthz")

    assert len(first.headers["x-request-id"]) == 32
    assert first.headers["x-request-id"] != second.headers["x-request-id"]


async def test_client_supplied_request_id_is_ignored() -> None:
    async with _app_client(app_env="local") as client:
        response = await client.get("/healthz", headers={"X-Request-ID": "forged\nvalue"})

    assert response.headers["x-request-id"] != "forged\nvalue"


async def test_cors_allows_only_the_configured_origin() -> None:
    async with _app_client(app_env="local", cors_origins="http://localhost:5173") as client:
        allowed = await client.options(
            "/api/v1/tasks",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "PATCH",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        foreign = await client.options(
            "/api/v1/tasks",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
        )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert foreign.status_code == 400


@pytest.mark.parametrize(
    ("method", "headers"),
    [("PUT", "authorization"), ("TRACE", "authorization"), ("GET", "x-custom-header")],
)
async def test_cors_rejects_methods_and_headers_the_api_does_not_use(
    method: str, headers: str
) -> None:
    async with _app_client(app_env="local") as client:
        response = await client.options(
            "/api/v1/tasks",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": headers,
            },
        )

    assert response.status_code == 400
