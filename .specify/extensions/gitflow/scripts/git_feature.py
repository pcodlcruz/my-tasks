#!/usr/bin/env python3
"""Create or verify the git branch for the active Spec Kit feature.

Invoked as the `speckit.git.feature` hook (after_tasks and before_implement in
.specify/extensions.yml). See docs/flujo-speckit.md, section "Spec Kit 1.0.4 no
crea ramas git".

Behaviour:
  - Reads the active feature from .specify/feature.json (e.g. 'specs/003-x').
  - Derives the branch name 'feature/003-x' (same basename as the spec dir).
  - If already on that branch: no-op, status "already-on-branch".
  - If the branch exists locally but HEAD is elsewhere: aborts (status "error"),
    the user/agent must switch manually.
  - Otherwise: refuses to run if the working tree has anything other than
    untracked files under the feature directory (that would drag unrelated
    changes into the new branch); then fetches the base branch and creates
    'feature/003-x' from 'origin/<base>', carrying the untracked spec files
    along.
"""

from __future__ import annotations

import argparse
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base", default="develop", help="Rama GitFlow base (por defecto: develop)"
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

    if here == branch:
        emit(
            {
                "status": "already-on-branch",
                "branch": branch,
                "feature_directory": feature_dir_rel,
            }
        )
        return 0

    local_exists = (
        run(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"], repo_root).returncode
        == 0
    )
    if local_exists:
        fail(
            f"La rama '{branch}' ya existe pero no es la rama actual (estás en '{here}'). "
            f"Cambia manualmente con 'git switch {branch}' y vuelve a intentarlo.",
            branch=branch,
        )
        return 1

    status = run(["git", "status", "--porcelain=v1"], repo_root)
    if status.returncode != 0:
        fail(f"git status falló: {status.stderr.strip()}")
        return 1

    offending: list[str] = []
    for line in status.stdout.splitlines():
        if not line:
            continue
        code, path = line[:2], line[3:]
        if code == "??":
            if path != feature_dir_rel and not path.startswith(feature_dir_rel + "/"):
                offending.append(line)
        else:
            # Any staged or unstaged change to a tracked file blocks the switch:
            # it does not belong to a feature whose spec is still uncommitted.
            offending.append(line)

    if offending:
        fail(
            "Hay cambios en el árbol de trabajo que no pertenecen a "
            f"'{feature_dir_rel}'; no se puede crear la rama automáticamente. "
            "Confirma o descarta estos cambios primero:\n" + "\n".join(offending),
            offending_paths=offending,
        )
        return 1

    fetch = run(["git", "fetch", "origin", args.base], repo_root)
    if fetch.returncode != 0:
        fail(f"'git fetch origin {args.base}' falló: {fetch.stderr.strip()}")
        return 1

    switch = run(["git", "switch", "-c", branch, f"origin/{args.base}"], repo_root)
    if switch.returncode != 0:
        fail(f"'git switch -c {branch} origin/{args.base}' falló: {switch.stderr.strip()}")
        return 1

    emit(
        {
            "status": "created",
            "branch": branch,
            "base": f"origin/{args.base}",
            "feature_directory": feature_dir_rel,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
