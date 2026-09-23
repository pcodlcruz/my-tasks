#!/usr/bin/env python3
"""Commit the design artifacts (spec/plan/tasks) for the active feature.

Invoked as the `speckit.git.commit` hook (after_analyze in
.specify/extensions.yml). Design and code stay in separate commits, so the
design diff doesn't get mixed into the PR's code review.

The CRITICAL-issue gate from /speckit-analyze is NOT re-derived here: the
calling skill must have already confirmed, from the analysis it just ran in
the same conversation, that there are zero CRITICAL findings before invoking
this script at all.

Stages ONLY the active feature directory (never other paths) and commits with
a Conventional Commits 'docs(spec): ...' subject. No-op (status
"nothing-to-commit") if nothing changed since the last commit touching that
directory.
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
    short_label_for,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--trailer",
        action="append",
        default=[],
        help="Línea de trailer a añadir al mensaje (p.ej. 'Co-Authored-By: ...'); repetible",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Permite comitear aunque HEAD no esté en la rama feature/<feature> (no recomendado)",
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
    if here != branch and not args.force:
        fail(
            f"No estás en la rama '{branch}' (estás en '{here}'). "
            "Ejecuta /speckit-git-feature primero.",
            branch=branch,
            current_branch=here,
        )
        return 1

    feature_path = repo_root / feature_dir_rel
    if not feature_path.is_dir():
        fail(f"No existe el directorio de la feature: {feature_dir_rel}")
        return 1

    add = run(["git", "add", "--", feature_dir_rel], repo_root)
    if add.returncode != 0:
        fail(f"'git add {feature_dir_rel}' falló: {add.stderr.strip()}")
        return 1

    diff = run(["git", "diff", "--cached", "--quiet", "--", feature_dir_rel], repo_root)
    if diff.returncode == 0:
        emit(
            {
                "status": "nothing-to-commit",
                "branch": branch,
                "feature_directory": feature_dir_rel,
            }
        )
        return 0

    prior_log = run(["git", "log", "--oneline", "--", feature_dir_rel], repo_root)
    verb = "update" if prior_log.stdout.strip() else "add"
    label = short_label_for(feature_dir_rel)

    subject = f"docs(spec): {verb} spec, plan and tasks for {label}"
    message = subject
    if args.trailer:
        message += "\n\n" + "\n".join(args.trailer)

    commit = run(["git", "commit", "-m", message], repo_root)
    if commit.returncode != 0:
        fail(f"'git commit' falló: {commit.stderr.strip()}")
        return 1

    emit(
        {
            "status": "committed",
            "branch": branch,
            "feature_directory": feature_dir_rel,
            "subject": subject,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
