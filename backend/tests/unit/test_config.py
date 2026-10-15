import pytest
from pydantic import ValidationError

from mytasks_api.config import Settings

pytestmark = pytest.mark.unit

EMULATOR_VARIABLES = (
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "APP_ENV",
    "APP_VERSION",
)


@pytest.fixture(autouse=True)
def _clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for variable in (*EMULATOR_VARIABLES, "GOOGLE_CLOUD_PROJECT"):
        monkeypatch.delenv(variable, raising=False)


def _settings(**values: object) -> Settings:
    return Settings(_env_file=None, **values)  # type: ignore[call-arg,arg-type]


def test_app_env_defaults_to_production() -> None:
    settings = _settings(google_cloud_project="mytasks-prod")

    assert settings.app_env == "production"


@pytest.mark.parametrize("app_env", ["staging", "production"])
def test_auth_emulator_host_is_rejected_outside_local(app_env: str) -> None:
    with pytest.raises(ValidationError, match="APP_ENV=local"):
        _settings(
            app_env=app_env,
            google_cloud_project="mytasks-prod",
            firebase_auth_emulator_host="localhost:9099",
        )


@pytest.mark.parametrize("app_env", ["staging", "production"])
def test_firestore_emulator_host_is_rejected_outside_local(app_env: str) -> None:
    with pytest.raises(ValidationError, match="APP_ENV=local"):
        _settings(
            app_env=app_env,
            google_cloud_project="mytasks-prod",
            firestore_emulator_host="localhost:8080",
        )


def test_emulator_variables_from_the_environment_are_also_rejected_outside_local(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")

    with pytest.raises(ValidationError, match="APP_ENV=local"):
        _settings(google_cloud_project="mytasks-prod")


def test_project_id_is_required_outside_local() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_CLOUD_PROJECT"):
        _settings(app_env="production")


def test_demo_project_id_is_rejected_outside_local() -> None:
    with pytest.raises(ValidationError, match="demo-"):
        _settings(app_env="staging", google_cloud_project="demo-mytasks")


def test_real_project_without_emulators_is_accepted_outside_local() -> None:
    settings = _settings(app_env="production", google_cloud_project="mytasks-prod")

    assert settings.google_cloud_project == "mytasks-prod"


def test_local_defaults_to_the_demo_project_id() -> None:
    settings = _settings(app_env="local")

    assert settings.google_cloud_project == "demo-mytasks"


def test_local_accepts_emulators() -> None:
    settings = _settings(
        app_env="local",
        firestore_emulator_host="localhost:8080",
        firebase_auth_emulator_host="localhost:9099",
    )

    assert settings.firebase_auth_emulator_host == "localhost:9099"


def test_local_rejects_a_real_project_id() -> None:
    with pytest.raises(ValidationError, match="demo-"):
        _settings(app_env="local", google_cloud_project="mytasks-prod")


def test_app_version_defaults_to_dev_for_local_runs() -> None:
    settings = _settings(app_env="local")

    assert settings.app_version == "dev"


def test_app_version_is_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_VERSION", "3f9c2ab")

    settings = _settings(app_env="production", google_cloud_project="mytasks-prod")

    assert settings.app_version == "3f9c2ab"


def test_export_emulator_hosts_sets_the_variables_the_sdks_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import os

    settings = _settings(
        app_env="local",
        firestore_emulator_host="localhost:8080",
        firebase_auth_emulator_host="localhost:9099",
    )

    settings.export_emulator_hosts()

    assert os.environ["FIRESTORE_EMULATOR_HOST"] == "localhost:8080"
    assert os.environ["FIREBASE_AUTH_EMULATOR_HOST"] == "localhost:9099"
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST")
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST")
