import os
from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_PROJECT_ID = "demo-mytasks"
DEMO_PROJECT_PREFIX = "demo-"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime environment. Defaults to "production" (fails closed): local mode, the
    # only one that admits emulators, must be requested explicitly.
    app_env: Literal["local", "staging", "production"] = "production"
    google_cloud_project: str | None = None
    firestore_emulator_host: str | None = None
    firebase_auth_emulator_host: str | None = None
    cors_origins: str = "http://localhost:5173"
    # Version served by /healthz. The pipeline sets it on deploy (tree hash of backend/).
    app_version: str = "dev"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_local(self) -> bool:
        return self.app_env == "local"

    @model_validator(mode="after")
    def _check_environment(self) -> Self:
        if self.is_local:
            project = self.google_cloud_project or LOCAL_PROJECT_ID
            if not project.startswith(DEMO_PROJECT_PREFIX):
                message = (
                    f"Con APP_ENV=local el project id debe empezar por '{DEMO_PROJECT_PREFIX}' "
                    f"(recibido: '{project}'): en local nunca se usa un proyecto real."
                )
                raise ValueError(message)
            self.google_cloud_project = project
            return self

        # With the Auth emulators active the SDK accepts unsigned tokens: in a real
        # environment that would let anyone impersonate any user.
        if self.firestore_emulator_host or self.firebase_auth_emulator_host:
            message = (
                "Las variables de los emuladores de Firebase (FIRESTORE_EMULATOR_HOST, "
                "FIREBASE_AUTH_EMULATOR_HOST) solo se admiten con APP_ENV=local. "
                f"El entorno actual es '{self.app_env}': elimina esas variables."
            )
            raise ValueError(message)
        if not self.google_cloud_project:
            message = f"GOOGLE_CLOUD_PROJECT es obligatorio con APP_ENV={self.app_env}."
            raise ValueError(message)
        if self.google_cloud_project.startswith(DEMO_PROJECT_PREFIX):
            message = (
                f"Con APP_ENV={self.app_env} el project id no puede empezar por "
                f"'{DEMO_PROJECT_PREFIX}' (es el prefijo de los proyectos de emulador)."
            )
            raise ValueError(message)
        return self

    def export_emulator_hosts(self) -> None:
        """Publish the emulator hosts in the variables the Google SDKs read.

        `firebase_admin` and `google-cloud-firestore` only read `os.environ`: a value
        that comes from the `.env` file never reaches them unless it is exported here.
        """
        if self.firestore_emulator_host:
            os.environ["FIRESTORE_EMULATOR_HOST"] = self.firestore_emulator_host
        if self.firebase_auth_emulator_host:
            os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = self.firebase_auth_emulator_host


@lru_cache
def get_settings() -> Settings:
    return Settings()
