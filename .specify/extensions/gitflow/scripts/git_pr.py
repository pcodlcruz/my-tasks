#!/usr/bin/env python3
"""Push the feature branch, ready for its Pull Request to develop.

Invoked as the `speckit.git.pr` hook (after_implement in
.specify/extensions.yml). Per Principio VII de la constitución: nothing in
this flow ever merges. This script only pushes; the calling skill then uses
the GitHub MCP (never the `gh` CLI directly, per project convention) to check
for an existing PR and create one if needed, and the owner reviews the diff
and merges manually.

This script does not run tests and does not commit code: by Principio VIII,
code commits happen during /speckit-implement via the role skill
(backend-developer / frontend-developer), which already follows GitFlow +
Conventional Commits. The calling skill (speckit-git-pr) is responsible for
having verified tests are green *before* invoking this script; this script
only re-checks that the working tree is clean, since a dirty tree here means
something was never committed.

Emits `owner`/`repo` (parsed from the `origin` remote) alongside the push
result so the calling skill has what it needs to call the GitHub MCP tools
without shelling out again.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gitflow_common import (  # noqa: E402
    GitflowError,
    branch_name_for,
    current_branch,
    emit,
    fail,
    get_active_feature_dir,
    get_repo_root,
    run,
)


def _tasks_status(feature_path: Path) -> tuple[int, int]:
    tasks_file = feature_path / "tasks.md"
    if not tasks_file.is_file():
        return (0, 0)
    text = tasks_file.read_text(encoding="utf-8")
    total = len(re.findall(r"^\s*-\s*\[[ Xx]\]", text, re.MULTILINE))
    checked = len(re.findall(r"^\s*-\s*\[[Xx]\]", text, re.MULTILINE))
    return (checked, total)


def _owner_repo(repo_root: Path) -> tuple[str, str] | None:
    """Parse 'owner/repo' out of the origin remote (https or ssh form)."""
    result = run(["git", "remote", "get-url", "origin"], repo_root)
    if result.returncode != 0:
        return None
    url = result.stdout.strip()
    match = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$", url)
    if not match:
        return None
    return match.group("owner"), match.group("repo")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-incomplete-tasks",
        action="store_true",
        help="Permite hacer push aunque queden tareas sin marcar [X] en tasks.md",
    )
    args = parser.parse_args()

    repo_root = get_repo_root()

    try:
        feature_dir_rel = get_active_feature_dir(repo_root)
    except GitflowError as exc:
        fail(str(exc))
        return 1

    branch = branch_name_for(feature_dir_rel)
    here = current_branch(repo_root)
    if here != branch:
        fail(
            f"No estás en la rama '{branch}' (estás en '{here}'). "
            "Ejecuta /speckit-git-feature antes de abrir la PR.",
            branch=branch,
            current_branch=here,
        )
        return 1

    feature_path = repo_root / feature_dir_rel
    checked, total = _tasks_status(feature_path)
    if total and checked < total and not args.allow_incomplete_tasks:
        fail(
            f"Quedan {total - checked} de {total} tareas sin marcar [X] en "
            f"{feature_dir_rel}/tasks.md. Completa /speckit-implement o usa "
            "/speckit-converge antes de abrir la PR.",
            checked=checked,
            total=total,
        )
        return 1

    status = run(["git", "status", "--porcelain=v1"], repo_root)
    if status.stdout.strip():
        fail(
            "El árbol de trabajo no está limpio; hay cambios sin comitear. "
            "Comitea el código (Conventional Commits) antes de abrir la PR:\n"
            + status.stdout,
            dirty=True,
        )
        return 1

    push = run(["git", "push", "-u", "origin", branch], repo_root)
    if push.returncode != 0:
        fail(f"'git push -u origin {branch}' falló: {push.stderr.strip()}")
        return 1

    owner_repo = _owner_repo(repo_root)
    payload = {
        "status": "pushed",
        "branch": branch,
        "feature_directory": feature_dir_rel,
    }
    if owner_repo is not None:
        payload["owner"], payload["repo"] = owner_repo
    emit(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
