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
    assert "/health" in contract["paths"]
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


def test_export_contains_the_account_endpoint_and_the_403_of_every_task_operation(
    tmp_path: Path,
) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    contract = json.loads(target.read_text(encoding="utf-8"))

    assert "get" in contract["paths"]["/api/v1/me"]
    assert "MeOut" in contract["components"]["schemas"]
    task_operations = [
        operation
        for path, methods in contract["paths"].items()
        if path.startswith("/api/v1/tasks")
        for operation in methods.values()
    ]
    assert task_operations
    assert all("403" in operation["responses"] for operation in task_operations)


def test_export_contains_the_admin_endpoints_each_with_401_and_403(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    contract = json.loads(target.read_text(encoding="utf-8"))

    admin_paths = {path for path in contract["paths"] if path.startswith("/api/v1/admin")}
    assert admin_paths == {
        "/api/v1/admin/access",
        "/api/v1/admin/invitations",
        "/api/v1/admin/invitations/{email}",
        "/api/v1/admin/users/{uid}",
    }
    for path in admin_paths:
        for operation in contract["paths"][path].values():
            assert {"401", "403"} <= set(operation["responses"])
    schemas = contract["components"]["schemas"]
    assert {"InvitationIn", "InviteResultOut", "AccessListOut"} <= set(schemas)
    assert schemas["InvitationIn"]["additionalProperties"] is False


def test_export_matches_the_profile_contract_of_feature_004(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    contract = json.loads(target.read_text(encoding="utf-8"))

    profile = contract["paths"]["/api/v1/me/profile"]
    assert set(profile) == {"get", "patch", "delete"}
    for operation in profile.values():
        assert {"200", "401", "403"} <= set(operation["responses"])
    assert "422" in profile["patch"]["responses"]
    schemas = contract["components"]["schemas"]
    assert {"ProfileOut", "AvatarOut", "ProfileUpdateIn", "AvatarChoiceIn"} <= set(schemas)
    assert set(schemas["ProfileOut"]["required"]) == {
        "theme",
        "density",
        "default_scope",
        "board_order",
        "history_days",
        "display_name",
        "avatar",
    }
    assert schemas["ProfileUpdateIn"]["additionalProperties"] is False
    assert schemas["AvatarChoiceIn"]["additionalProperties"] is False
    assert schemas["AvatarOut"]["required"] == ["kind", "preset", "version"]


def test_export_profile_enums_match_the_contract(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    schemas = json.loads(target.read_text(encoding="utf-8"))["components"]["schemas"]

    assert set(schemas["Theme"]["enum"]) == {"light", "dark", "system"}
    assert set(schemas["Density"]["enum"]) == {"comfortable", "compact"}
    assert set(schemas["DefaultScope"]["enum"]) == {"all", "work", "personal"}
    assert set(schemas["BoardOrder"]["enum"]) == {"oldest", "newest"}
    assert set(schemas["HistoryDays"]["enum"]) == {30, 90}
    avatar_kind = schemas["AvatarChoiceIn"]["properties"]["kind"]
    assert set(avatar_kind["enum"]) == {"initials", "preset"}
    preset = schemas["AvatarChoiceIn"]["properties"]["preset"]
    assert "avatar-" in json.dumps(preset)


def test_export_lists_the_two_new_task_list_parameters(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    contract = json.loads(target.read_text(encoding="utf-8"))

    parameters = {p["name"]: p for p in contract["paths"]["/api/v1/tasks"]["get"]["parameters"]}
    assert {"order", "within_days"} <= set(parameters)
    assert parameters["order"]["required"] is False
    assert parameters["within_days"]["required"] is False
    assert "422" in contract["paths"]["/api/v1/tasks"]["get"]["responses"]


def test_export_matches_the_avatar_contract_of_feature_004(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi(target)
    contract = json.loads(target.read_text(encoding="utf-8"))

    avatar = contract["paths"]["/api/v1/me/avatar"]
    assert set(avatar) == {"get", "put", "delete"}
    for operation in avatar.values():
        assert {"200", "401", "403"} <= set(operation["responses"])
    assert "404" in avatar["get"]["responses"]
    assert {"413", "415", "429"} <= set(avatar["put"]["responses"])
    assert "image/webp" in avatar["get"]["responses"]["200"]["content"]
    assert set(avatar["put"]["requestBody"]["content"]) == {"image/jpeg", "image/png", "image/webp"}
    parameters = {p["name"]: p for p in avatar["get"]["parameters"]}
    assert parameters["v"]["required"] is False
    assert (
        "ProfileOut"
        in avatar["put"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    )
    assert (
        "ProfileOut"
        in avatar["delete"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    )


def test_the_cors_policy_allows_put_for_the_avatar_upload() -> None:
    from mytasks_api.factory import ALLOWED_METHODS

    assert "PUT" in ALLOWED_METHODS
