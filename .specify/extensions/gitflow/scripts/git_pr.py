#!/usr/bin/env python3
"""Push the feature branch and open (or report) its Pull Request to develop.

Invoked as the `speckit.git.pr` hook (after_implement in
.specify/extensions.yml). Per Principio VII de la constitución: this script
NEVER merges. It only pushes and opens the PR; the owner reviews the diff and
merges manually.

This script does not run tests and does not commit code: by Principio VIII,
code commits happen during /speckit-implement via the role skill
(backend-developer / frontend-developer), which already follows GitFlow +
Conventional Commits. The calling skill (speckit-git-pr) is responsible for
having verified tests are green *before* invoking this script; this script
only re-checks that the working tree is clean, since a dirty tree here means
something was never committed.

Uses the `gh` CLI (not the GitHub MCP, which is currently down per
docs/flujo-speckit.md) to push and create the PR.
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="develop")
    parser.add_argument("--title", required=True, help="Título de la PR, en español")
    parser.add_argument(
        "--body-file", required=True, help="Ruta a un fichero con el cuerpo de la PR, en español"
    )
    parser.add_argument(
        "--allow-incomplete-tasks",
        action="store_true",
        help="Permite abrir la PR aunque queden tareas sin marcar [X] en tasks.md",
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

    existing = run(
        ["gh", "pr", "view", branch, "--json", "url,state"], repo_root
    )
    if existing.returncode == 0:
        emit(
            {
                "status": "exists",
                "branch": branch,
                "feature_directory": feature_dir_rel,
                "raw": existing.stdout.strip(),
            }
        )
        return 0

    body_file = Path(args.body_file)
    if not body_file.is_file():
        fail(f"No existe el fichero de cuerpo de PR: {body_file}")
        return 1

    create = run(
        [
            "gh",
            "pr",
            "create",
            "--base",
            args.base,
            "--head",
            branch,
            "--title",
            args.title,
            "--body-file",
            str(body_file),
        ],
        repo_root,
    )
    if create.returncode != 0:
        fail(f"'gh pr create' falló: {create.stderr.strip()}")
        return 1

    emit(
        {
            "status": "created",
            "branch": branch,
            "feature_directory": feature_dir_rel,
            "url": create.stdout.strip(),
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
