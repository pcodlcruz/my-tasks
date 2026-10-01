#!/usr/bin/env python3
"""PreToolUse guard for the Google Cloud MCP: reject any attempt to change identity.

The agent may only act as `mytasks-ai-agent` through the MCP. The primary guarantee is that no
personal credentials exist in the MCP's isolated gcloud config directory (see
specs/002-cloud-run-cicd/contracts/agent-identity.md); this hook is a deterministic second layer
that refuses commands trying to select another account, impersonate, inject a token or switch
the credential store. It is plain code, not an instruction to the LLM.

Protocol: Claude Code sends the tool call as JSON on stdin. Exit code 2 blocks the call (the
reason goes to stderr); exit code 0 lets the normal permission flow continue.
"""

import json
import os
import re
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

GCLOUD_TOOL_PREFIX = "mcp__gcloud__"
DEFAULT_LOG_PATH = "~/.config/mytasks-agent/identity-guard.log"
LOG_ENV_VAR = "MYTASKS_GUARD_LOG"

# Flags that select an identity, inject a credential or pick another gcloud configuration.
FORBIDDEN_FLAGS = (
    "--account",
    "--impersonate-service-account",
    "--access-token-file",
    "--credential-file-override",
    "--configuration",
)
# gcloud may accept unambiguous abbreviations; block them too (shorter ones would be ambiguous).
MIN_ABBREVIATION_LENGTH = 5

# How many positional words may precede the command group (global flags with separate values).
GROUP_SEARCH_WINDOW = 3

IDENTITY_CONFIG_KEYS = ("account", "core/account")
IDENTITY_CONFIG_PREFIXES = ("auth/",)

Verdict = tuple[bool, str | None]


def _flatten_args(args: list[str]) -> list[str]:
    """Split single-string commands ("auth list") and drop a leading `gcloud`."""
    tokens: list[str] = []
    for item in args:
        if any(ch.isspace() for ch in item):
            try:
                tokens.extend(shlex.split(item))
            except ValueError:
                tokens.extend(item.split())
        else:
            tokens.append(item)
    if tokens and tokens[0] == "gcloud":
        tokens = tokens[1:]
    return tokens


def _forbidden_flag(token: str) -> str | None:
    if not token.startswith("--"):
        return None
    name = token.split("=", 1)[0]
    for forbidden in FORBIDDEN_FLAGS:
        if name == forbidden:
            return forbidden
        if len(name) >= MIN_ABBREVIATION_LENGTH and forbidden.startswith(name):
            return forbidden
    return None


def _group_index(positionals: list[str], group: str) -> int | None:
    for index, word in enumerate(positionals[:GROUP_SEARCH_WINDOW]):
        if word == group:
            return index
    return None


def _config_verdict(positionals: list[str]) -> str | None:
    index = _group_index(positionals, "config")
    if index is None:
        return None
    action = positionals[index + 1] if len(positionals) > index + 1 else ""
    key = positionals[index + 2] if len(positionals) > index + 2 else ""
    if action in ("set", "unset") and (
        key in IDENTITY_CONFIG_KEYS or key.startswith(IDENTITY_CONFIG_PREFIXES)
    ):
        return "config-identity-key"
    if action == "configurations" and key not in ("", "list", "describe"):
        return "config-configurations-change"
    return None


def _evaluate_tokens(tokens: list[str]) -> str | None:
    """Return the rejection reason for a gcloud command, or None if it is acceptable."""
    for token in tokens:
        forbidden = _forbidden_flag(token)
        if forbidden is not None:
            return f"forbidden-flag:{forbidden}"
        if re.match(r"^CLOUDSDK_", token) or "CLOUDSDK_CONFIG" in token:
            return "cloudsdk-env-override"

    positionals = [token for token in tokens if not token.startswith("-")]
    if _group_index(positionals, "auth") is not None:
        return "auth-command"
    return _config_verdict(positionals)


def evaluate(payload: object) -> Verdict:
    """Decide whether a PreToolUse payload may proceed: (allowed, reason-if-blocked)."""
    if not isinstance(payload, dict):
        return False, "malformed-input"
    tool_name = payload.get("tool_name")
    if not isinstance(tool_name, str) or not tool_name.startswith(GCLOUD_TOOL_PREFIX):
        return True, None

    tool_input = payload.get("tool_input")
    args = tool_input.get("args") if isinstance(tool_input, dict) else None
    if not isinstance(args, list) or not all(isinstance(item, str) for item in args):
        return False, "malformed-input"

    reason = _evaluate_tokens(_flatten_args(args))
    if reason is not None:
        return False, reason
    return True, None


def _log_rejection(tool_name: str, reason: str) -> None:
    """Append a rejection record; never include command arguments (they may hold credentials)."""
    log_path = Path(os.environ.get(LOG_ENV_VAR) or DEFAULT_LOG_PATH).expanduser()
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tool": tool_name,
        "reason": reason,
    }
    log_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(log_path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    with os.fdopen(descriptor, "a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(entry) + "\n")


def main() -> int:
    tool_name = "unknown"
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        payload = None
    else:
        if isinstance(payload, dict) and isinstance(payload.get("tool_name"), str):
            tool_name = payload["tool_name"]

    allowed, reason = evaluate(payload)
    if allowed:
        return 0

    assert reason is not None
    try:
        _log_rejection(tool_name, reason)
    except OSError as error:
        # A logging failure must never turn a rejection into an approval.
        print(f"gcloud identity guard: could not write the rejection log ({error.strerror})", file=sys.stderr)
    print(
        f"Blocked by the gcloud identity guard ({reason}): the agent may only act as "
        "mytasks-ai-agent and must not select, impersonate or switch identities.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
