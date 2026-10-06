import json
from pathlib import Path

import pytest

from scripts.export_openapi import export_openapi, main

pytestmark = pytest.mark.unit


def test_export_is_deterministic(tmp_path: Path) -> None:
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"

    export_openapi(first)
    export_openapi(second)

    assert first.read_bytes() == second.read_bytes()


def test_export_contains_the_api_paths_and_schemas(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    contract = json.loads(target.read_text(encoding="utf-8"))

    assert "/healthz" in contract["paths"]
    assert "/readyz" in contract["paths"]
    assert any(path.startswith("/api/v1/tasks") for path in contract["paths"])
    assert "TaskOut" in contract["components"]["schemas"]


def test_export_sorts_keys_so_diffs_are_stable(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    contract = json.loads(target.read_text(encoding="utf-8"))

    assert list(contract["paths"]) == sorted(contract["paths"])
    assert target.read_text(encoding="utf-8").endswith("\n")


def test_export_does_not_require_a_real_project_or_emulators(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for variable in ("APP_ENV", "GOOGLE_CLOUD_PROJECT", "FIRESTORE_EMULATOR_HOST"):
        monkeypatch.delenv(variable, raising=False)
    target = tmp_path / "openapi.json"

    export_openapi(target)

    assert target.exists()


def test_main_writes_the_file_given_on_the_command_line(tmp_path: Path) -> None:
    target = tmp_path / "contract.json"

    exit_code = main([str(target)])

    assert exit_code == 0
    assert json.loads(target.read_text(encoding="utf-8"))["openapi"].startswith("3.")
