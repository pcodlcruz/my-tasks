#!/usr/bin/env python3
"""Push the feature branch, ready for its Pull Request to develop.

Each feature is delivered as one design PR (branch 'feature/NNN-x', only the
spec/plan/tasks documents; opened after /speckit-analyze) plus one PR per
phase of tasks.md (branch 'feature/NNN-x-fase-N'; opened after
/speckit-implement). On a phase branch only the tasks of that phase must be
checked [X]; on the design branch the task checklist is not checked at all.

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
    parse_phases,
    phase_of_branch,
    run,
)


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
        help="Permite hacer push aunque queden tareas de la fase sin marcar [X] en tasks.md",
    )
    args = parser.parse_args()

    repo_root = get_repo_root()

    try:
        feature_dir_rel = get_active_feature_dir(repo_root)
    except GitflowError as exc:
        fail(str(exc))
        return 1

    design_branch = branch_name_for(feature_dir_rel)
    branch = current_branch(repo_root)
    phase_number = phase_of_branch(branch, feature_dir_rel)
    if branch != design_branch and phase_number is None:
        fail(
            f"No estás en la rama de diseño '{design_branch}' ni en una de sus fases "
            f"('{design_branch}-fase-N'); estás en '{branch}'. "
            "Ejecuta /speckit-git-feature antes de abrir la PR.",
            branch=design_branch,
            current_branch=branch,
        )
        return 1

    payload: dict[str, object] = {
        "status": "pushed",
        "branch": branch,
        "feature_directory": feature_dir_rel,
        "kind": "design" if phase_number is None else "phase",
    }

    if phase_number is not None:
        tasks_file = repo_root / feature_dir_rel / "tasks.md"
        phases = parse_phases(tasks_file.read_text(encoding="utf-8")) if tasks_file.is_file() else []
        phase = next((p for p in phases if p.number == phase_number), None)
        if phase is None:
            fail(f"La fase {phase_number} no existe en {feature_dir_rel}/tasks.md.")
            return 1
        if not phase.complete and not args.allow_incomplete_tasks:
            fail(
                f"Quedan {phase.total - phase.done} de {phase.total} tareas de la fase "
                f"{phase.number} ('{phase.title}') sin marcar [X] en "
                f"{feature_dir_rel}/tasks.md. Completa /speckit-implement o usa "
                "/speckit-converge antes de abrir la PR.",
                checked=phase.done,
                total=phase.total,
            )
            return 1
        payload.update({"phase": phase.number, "phase_title": phase.title})

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
    if owner_repo is not None:
        payload["owner"], payload["repo"] = owner_repo
    emit(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
