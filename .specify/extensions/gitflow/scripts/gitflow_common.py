#!/usr/bin/env python3
"""Shared helpers for the gitflow extension scripts.

These scripts implement the git-side automation described in
docs/flujo-speckit.md ("Spec Kit 1.0.4 no crea ramas git"): creating the
feature branch, committing design artifacts, and opening the PR. They are
invoked by the speckit-git-feature / speckit-git-commit / speckit-git-pr
skills as extension hooks (see .specify/extensions.yml), never directly by
Spec Kit's own bundled scripts.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

# Reuse the official Spec Kit helpers (get_repo_root, feature.json reading)
# instead of duplicating that logic.
_SPECKIT_SCRIPTS = Path(__file__).resolve().parents[3] / "scripts" / "python"
if str(_SPECKIT_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SPECKIT_SCRIPTS))

from common import (  # type: ignore  # noqa: E402
    get_repo_root as _get_repo_root,
    read_feature_json_feature_directory,
)


class GitflowError(RuntimeError):
    """Raised for any condition that should stop the hook and report to the user."""


def get_repo_root() -> Path:
    return _get_repo_root()


def get_active_feature_dir(repo_root: Path) -> str:
    """Return the active feature directory (e.g. 'specs/003-user-auth') or raise."""
    value = read_feature_json_feature_directory(repo_root)
    if not value:
        raise GitflowError(
            "No hay ninguna feature activa en .specify/feature.json. "
            "Ejecuta /speckit-specify primero."
        )
    return value


def branch_name_for(feature_dir_rel: str) -> str:
    """Derive 'feature/<basename>' from 'specs/<basename>', per docs/flujo-speckit.md."""
    basename = feature_dir_rel.rstrip("/").split("/")[-1]
    return f"feature/{basename}"


def short_label_for(feature_dir_rel: str) -> str:
    """Strip the numeric/timestamp prefix from the feature dir basename for commit subjects."""
    basename = feature_dir_rel.rstrip("/").split("/")[-1]
    match = re.match(r"^\d{3,}-(.+)$", basename) or re.match(
        r"^\d{8}-\d{6}-(.+)$", basename
    )
    return match.group(1) if match else basename


def run(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True)


def current_branch(repo_root: Path) -> str:
    result = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo_root)
    if result.returncode != 0:
        raise GitflowError(f"git rev-parse falló: {result.stderr.strip()}")
    return result.stdout.strip()


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")


def fail(message: str, **extra: object) -> None:
    emit({"status": "error", "message": message, **extra})
    raise SystemExit(1)
