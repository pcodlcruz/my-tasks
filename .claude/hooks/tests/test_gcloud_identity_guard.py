"""Tests for the gcloud identity guard (PreToolUse hook for the Google Cloud MCP)."""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

HOOK_PATH = Path(__file__).resolve().parents[1] / "gcloud_identity_guard.py"
GCLOUD_TOOL = "mcp__gcloud__run_gcloud_command"


def _load_guard():
    spec = importlib.util.spec_from_file_location("gcloud_identity_guard", HOOK_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _payload(args, tool_name=GCLOUD_TOOL):
    return {"hook_event_name": "PreToolUse", "tool_name": tool_name, "tool_input": {"args": args}}


BLOCKED_ARGS = [
    pytest.param(
        ["compute", "instances", "list", "--account=personal@gmail.com"], id="account-equals"
    ),
    pytest.param(
        ["compute", "instances", "list", "--account", "personal@gmail.com"], id="account-separate"
    ),
    pytest.param(
        ["projects", "list", "--impersonate-service-account=x@p.iam.gserviceaccount.com"],
        id="impersonate-equals",
    ),
    pytest.param(
        ["projects", "list", "--impersonate-service-account", "x@p.iam.gserviceaccount.com"],
        id="impersonate-separate",
    ),
    pytest.param(["projects", "list", "--access-token-file=/tmp/token"], id="access-token-file"),
    pytest.param(["projects", "list", "--credential-file-override=/tmp/key"], id="credential-file"),
    pytest.param(["projects", "list", "--configuration=personal"], id="named-configuration"),
    pytest.param(["projects", "list", "--acc=personal@gmail.com"], id="abbreviated-account"),
    pytest.param(["auth", "list"], id="auth-list"),
    pytest.param(["auth", "login"], id="auth-login"),
    pytest.param(["auth", "print-access-token"], id="auth-print-token"),
    pytest.param(["auth", "activate-service-account", "--key-file=k.json"], id="auth-activate"),
    pytest.param(["config", "set", "account", "personal@gmail.com"], id="config-set-account"),
    pytest.param(["config", "set", "core/account", "personal@gmail.com"], id="config-set-core"),
    pytest.param(
        ["config", "set", "auth/impersonate_service_account", "x@p.iam.gserviceaccount.com"],
        id="config-set-auth",
    ),
    pytest.param(["config", "unset", "account"], id="config-unset-account"),
    pytest.param(["config", "configurations", "activate", "personal"], id="config-activate"),
    pytest.param(["projects", "list", "CLOUDSDK_CONFIG=/home/u/.config/gcloud"], id="cloudsdk-config"),
    pytest.param(["projects", "list", "CLOUDSDK_CORE_ACCOUNT=a@b.com"], id="cloudsdk-account"),
    pytest.param(["auth list"], id="single-string-auth"),
    pytest.param(["gcloud auth list"], id="gcloud-prefix-single-string"),
    pytest.param(["gcloud", "projects", "list", "--account=a@b.com"], id="gcloud-prefix-list"),
]

ALLOWED_ARGS = [
    pytest.param(["projects", "list"], id="projects-list"),
    pytest.param(
        ["run", "services", "list", "--region=europe-southwest1", "--format=json"], id="run-list"
    ),
    pytest.param(["config", "list"], id="config-list"),
    pytest.param(["config", "get-value", "project"], id="config-get-value"),
    pytest.param(["iam", "service-accounts", "list"], id="service-accounts-list"),
    pytest.param(
        [
            "logging",
            "read",
            "protoPayload.authenticationInfo.principalEmail:"
            "mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com",
            "--limit=10",
        ],
        id="audit-log-query-mentions-account-in-value",
    ),
    pytest.param(["projects", "get-iam-policy", "pdlco-mytasks"], id="get-iam-policy"),
]


@pytest.mark.parametrize("args", BLOCKED_ARGS)
def test_blocks_identity_changes(args):
    allowed, reason = _load_guard().evaluate(_payload(args))
    assert allowed is False
    assert reason


@pytest.mark.parametrize("args", ALLOWED_ARGS)
def test_allows_read_only_commands(args):
    allowed, reason = _load_guard().evaluate(_payload(args))
    assert allowed is True
    assert reason is None


@pytest.mark.parametrize("tool_name", ["Bash", "Read", "mcp__github__list_pull_requests"])
def test_ignores_other_tools(tool_name):
    allowed, _ = _load_guard().evaluate(_payload(["auth", "list"], tool_name=tool_name))
    assert allowed is True


@pytest.mark.parametrize(
    "tool_input",
    [{}, {"args": "auth list"}, {"args": None}, {"args": [1, 2]}, None],
    ids=["missing-args", "args-not-a-list", "args-null", "args-not-strings", "no-tool-input"],
)
def test_fails_closed_on_malformed_input(tool_input):
    payload = {"hook_event_name": "PreToolUse", "tool_name": GCLOUD_TOOL, "tool_input": tool_input}
    allowed, reason = _load_guard().evaluate(payload)
    assert allowed is False
    assert reason


def _run_hook(stdin_text, log_path):
    return subprocess.run(
        [sys.executable, str(HOOK_PATH)],
        input=stdin_text,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", "MYTASKS_GUARD_LOG": str(log_path)},
        check=False,
    )


def test_cli_blocks_with_exit_code_2_and_logs_without_leaking_arguments(tmp_path):
    log_path = tmp_path / "guard.log"
    result = _run_hook(
        json.dumps(_payload(["projects", "list", "--account=secret.person@gmail.com"])), log_path
    )

    assert result.returncode == 2
    assert result.stderr.strip()
    assert "secret.person@gmail.com" not in result.stderr

    entry = json.loads(log_path.read_text().splitlines()[-1])
    assert entry["tool"] == GCLOUD_TOOL
    assert entry["reason"]
    assert entry["timestamp"]
    assert "secret.person@gmail.com" not in log_path.read_text()


def test_cli_allows_with_exit_code_0_and_writes_no_log(tmp_path):
    log_path = tmp_path / "guard.log"
    result = _run_hook(json.dumps(_payload(["projects", "list"])), log_path)

    assert result.returncode == 0
    assert not log_path.exists()


def test_cli_blocks_invalid_json(tmp_path):
    result = _run_hook("not json", tmp_path / "guard.log")
    assert result.returncode == 2


def test_cli_still_blocks_when_the_log_cannot_be_written(tmp_path):
    unwritable = tmp_path / "missing-dir-is-created-but-this-is-a-file" / "x"
    (tmp_path / "missing-dir-is-created-but-this-is-a-file").write_text("not a directory")

    result = _run_hook(json.dumps(_payload(["auth", "list"])), unwritable)

    assert result.returncode == 2
