#!/usr/bin/env python3
"""Create or verify the git branch for the active Spec Kit feature.

Invoked as the `speckit.git.feature` hook (after_tasks and before_implement in
.specify/extensions.yml). Spec Kit 1.0.4 does not run any git command on its
own (create_new_feature.py has no git calls); this script fills that gap.

Each feature is delivered as one design PR plus one PR per phase of tasks.md:

  - Design mode (no --phase; after_tasks): branch 'feature/003-x' (same
    basename as the spec dir) carrying the spec/plan/tasks documents.
      - If already on that branch: no-op, status "already-on-branch".
      - If the branch exists locally but HEAD is elsewhere: aborts.
      - Otherwise: refuses to run if the working tree has anything other than
        untracked files under the feature directory (that would drag unrelated
        changes into the new branch); then creates the branch from
        'origin/<base>', carrying the untracked spec files along.

  - Phase mode (--phase N|auto; before_implement): branch
    'feature/003-x-fase-N' created from 'origin/<base>'. The design PR must
    already be merged, because the phase list is read from tasks.md as it is
    on 'origin/<base>'. 'auto' picks the first phase with pending tasks. The
    working tree must be clean. Earlier phases that are still pending are
    reported (not blocking: some phases are meant to run in parallel).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gitflow_common import (  # noqa: E402
    GitflowError,
    Phase,
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


def _branch_exists_locally(repo_root: Path, branch: str) -> bool:
    return (
        run(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"], repo_root).returncode
        == 0
    )


def _working_tree_lines(repo_root: Path) -> list[str]:
    # -uall lists every untracked file: without it git collapses a fully
    # untracked directory (e.g. 'specs/' on the first feature) into one entry
    # that never matches the feature directory.
    status = run(["git", "status", "--porcelain=v1", "-uall"], repo_root)
    if status.returncode != 0:
        fail(f"git status falló: {status.stderr.strip()}")
    return [line for line in status.stdout.splitlines() if line]


def _fetch(repo_root: Path, base: str) -> None:
    fetch = run(["git", "fetch", "origin", base], repo_root)
    if fetch.returncode != 0:
        fail(f"'git fetch origin {base}' falló: {fetch.stderr.strip()}")


def _switch_new(repo_root: Path, branch: str, base: str) -> None:
    switch = run(["git", "switch", "-c", branch, f"origin/{base}"], repo_root)
    if switch.returncode != 0:
        fail(f"'git switch -c {branch} origin/{base}' falló: {switch.stderr.strip()}")


def _fail_if_exists_elsewhere(repo_root: Path, branch: str, here: str) -> None:
    if _branch_exists_locally(repo_root, branch):
        fail(
            f"La rama '{branch}' ya existe pero no es la rama actual (estás en '{here}'). "
            f"Cambia manualmente con 'git switch {branch}' y vuelve a intentarlo.",
            branch=branch,
        )


def _phase_payload(phase: Phase) -> dict[str, object]:
    return {
        "phase": phase.number,
        "phase_title": phase.title,
        "phase_tasks_done": phase.done,
        "phase_tasks_total": phase.total,
    }


def design_branch(repo_root: Path, feature_dir_rel: str, base: str) -> int:
    branch = branch_name_for(feature_dir_rel)
    here = current_branch(repo_root)

    if here == branch:
        emit({"status": "already-on-branch", "branch": branch, "feature_directory": feature_dir_rel})
        return 0

    _fail_if_exists_elsewhere(repo_root, branch, here)

    offending: list[str] = []
    for line in _working_tree_lines(repo_root):
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

    _fetch(repo_root, base)
    _switch_new(repo_root, branch, base)
    emit(
        {
            "status": "created",
            "branch": branch,
            "base": f"origin/{base}",
            "feature_directory": feature_dir_rel,
        }
    )
    return 0


def phase_branch(repo_root: Path, feature_dir_rel: str, base: str, requested: str) -> int:
    here = current_branch(repo_root)
    here_phase = phase_of_branch(here, feature_dir_rel)
    tasks_rel = f"{feature_dir_rel}/tasks.md"

    # Already on the requested phase branch (or on any phase branch with 'auto'):
    # the before_implement safety net must not jump to another phase mid-work.
    if here_phase is not None and requested in ("auto", str(here_phase)):
        tasks_file = repo_root / tasks_rel
        phases = parse_phases(tasks_file.read_text(encoding="utf-8")) if tasks_file.is_file() else []
        current = next((p for p in phases if p.number == here_phase), None)
        payload: dict[str, object] = {
            "status": "already-on-branch",
            "branch": here,
            "feature_directory": feature_dir_rel,
        }
        if current is not None:
            payload.update(_phase_payload(current))
        emit(payload)
        return 0

    dirty = _working_tree_lines(repo_root)
    if dirty:
        fail(
            "El árbol de trabajo no está limpio; no se puede crear la rama de la fase. "
            "Comitea o descarta estos cambios primero:\n" + "\n".join(dirty),
            offending_paths=dirty,
        )

    _fetch(repo_root, base)
    shown = run(["git", "show", f"origin/{base}:{tasks_rel}"], repo_root)
    if shown.returncode != 0:
        fail(
            f"'{tasks_rel}' no está en origin/{base}: la PR de diseño de la feature "
            f"('{branch_name_for(feature_dir_rel)}') tiene que estar fusionada antes de "
            "empezar a implementar sus fases."
        )
    phases = parse_phases(shown.stdout)
    if not phases:
        fail(f"No se encontró ninguna sección '## Phase N: ...' en {tasks_rel}.")

    if requested == "auto":
        phase = next((p for p in phases if not p.complete), None)
        if phase is None:
            fail(f"Todas las fases de {tasks_rel} están completas en origin/{base}.")
    else:
        phase = next((p for p in phases if str(p.number) == requested), None)
        if phase is None:
            fail(
                f"La fase {requested} no existe en {tasks_rel} "
                f"(fases: {', '.join(str(p.number) for p in phases)})."
            )
        if phase.complete:
            fail(f"La fase {phase.number} ('{phase.title}') ya está completa en origin/{base}.")
    assert phase is not None

    branch = branch_name_for(feature_dir_rel, phase.number)
    _fail_if_exists_elsewhere(repo_root, branch, here)
    _switch_new(repo_root, branch, base)

    emit(
        {
            "status": "created",
            "branch": branch,
            "base": f"origin/{base}",
            "feature_directory": feature_dir_rel,
            **_phase_payload(phase),
            "pending_earlier_phases": [
                p.number for p in phases if p.number < phase.number and not p.complete
            ],
        }
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base", default="develop", help="Rama GitFlow base (por defecto: develop)"
    )
    parser.add_argument(
        "--phase",
        help="Número de fase de tasks.md, o 'auto' para la primera con tareas pendientes. "
        "Sin este argumento se crea/verifica la rama de diseño.",
    )
    args = parser.parse_args()

    if args.phase is not None and args.phase != "auto" and not args.phase.isdigit():
        fail(f"--phase debe ser un número o 'auto' (recibido: '{args.phase}').")

    repo_root = get_repo_root()
    try:
        feature_dir_rel = get_active_feature_dir(repo_root)
    except GitflowError as exc:
        fail(str(exc))

    if args.phase is None:
        return design_branch(repo_root, feature_dir_rel, args.base)
    return phase_branch(repo_root, feature_dir_rel, args.base, args.phase)


if __name__ == "__main__":
    raise SystemExit(main())
