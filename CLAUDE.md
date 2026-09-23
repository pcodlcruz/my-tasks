# CLAUDE.md — Gestor Personal de Tareas

Aplicación web de gestión personal de tareas, desarrollada con Spec Kit y agentes de IA.
La fuente de verdad de las reglas del proyecto es la constitución:
`.specify/memory/constitution.md`. Este fichero solo resume las reglas **siempre activas**
(las que aplican en cualquier sesión, no solo dentro de los comandos `/speckit-*`). En caso
de conflicto, prevalece la constitución.

## Reglas siempre activas (NON-NEGOTIABLE)

### Idioma (Principio IX)
- Habla con el usuario **siempre en español**.
- Código (identificadores y comentarios) y mensajes de commit: **inglés**.
- Documentación del proyecto, título y cuerpo de PRs e Issues: **español**.

### Google Cloud (Principio V)
- Toda operación sobre Google Cloud pasa por el **MCP oficial de Google Cloud** con la cuenta
  de servicio del agente.
- **Nunca** ejecutes `gcloud`, `gsutil` ni `bq` directamente, ni uses SDKs/APIs fuera del MCP.
- **Nunca** uses credenciales personales del usuario.
- Mientras no exista la cuenta de servicio (`TODO(SERVICE_ACCOUNT_ID)` en la constitución),
  **no hay operaciones reales sobre Google Cloud**: si una tarea las requiere, detente y avisa.
- Cualquier cambio de infraestructura requiere confirmación explícita del usuario.

### Git y Pull Requests (Principios VI, VII)
- GitFlow: `feature/*` → `develop` (staging) → `release/*` → `main` (producción);
  `hotfix/*` → `main` con retro-merge a `develop`.
- Convención de nombre de rama de feature: `feature/NNN-nombre`, igual que el directorio
  de la spec (`specs/NNN-nombre/`). La crea automáticamente el hook `speckit.git.feature`
  (ver tabla de skills abajo y `docs/flujo-speckit.md`); no se crea a mano salvo que ese
  hook falle.
- **Nunca** hagas commit directo a `main`, `develop`, `release/*` ni `hotfix/*`: siempre PR.
- **Nunca** ejecutes `merge` (ni equivalentes) sobre una PR, la hayas abierto tú o no: la fusión
  la ejecuta siempre el propietario, tras revisar el diff.
- Commits en inglés con [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): subject` (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`).
- Los despliegues a staging/producción los hace **solo el pipeline de CI/CD**; nunca manuales.

### Agentes y skills (Principio VIII)
Usa el agente o skill de `.claude/skills/` que cubra la tarea antes de actuar por tu cuenta.
Si ninguno la cubre, hazlo manualmente y justifícalo en la PR.

| Tarea | Skill |
|---|---|
| Frontend (React + TypeScript) | `frontend-developer` |
| Backend (FastAPI) | `backend-developer` |
| Arquitectura en Google Cloud (solo diseño) | `google-cloud-architect` |
| Operación real sobre Google Cloud | `google-cloud-operator` |
| Infraestructura como código | `iac-developer` |
| Revisión de seguridad (obligatoria si tocas auth, autorización o modelo de datos) | `security-auditor` |
| Planificación, issues, Kanban | `project-manager` |
| Especificación → plan → tareas → implementación | `speckit-specify`, `speckit-plan`, `speckit-tasks`, `speckit-implement` |
| Ciclo git de la feature (rama, commit de diseño, PR) — automático vía hooks, ver `.specify/extensions.yml` | `speckit-git-feature`, `speckit-git-commit`, `speckit-git-pr` |

## Stack (fijado por la constitución; no se decide en cada plan)

- **Frontend**: React 18+, TypeScript estricto, TanStack Query, Zustand, Vitest, Playwright.
- **Backend**: Python 3.12+, FastAPI, pytest.
- **Persistencia**: Firestore (modo nativo) con `google-cloud-firestore`; emulador en local.
  No uses SQLAlchemy/Alembic aunque el skill `backend-developer` los prefiera por defecto.
- **Nube**: Google Cloud exclusivamente. Entornos: local → staging → producción.

## Definition of Done

Antes de dar una tarea por terminada, repasa el checklist *Definition of Done* de la
constitución. Resumen: tests del nivel correspondiente en verde (unitarios / integración por
endpoint contra el emulador / e2e por flujo), sin secretos en el repo, PR abierta en español
con commits en inglés, y ninguna operación en Google Cloud fuera del MCP.

## Flujo de trabajo con Spec Kit

1. `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
   `/speckit-analyze` → `/speckit-implement`.
2. `/speckit-plan` lee la constitución y genera el *Constitution Check* de la feature; una
   violación de un DEBE/PROHIBIDO es CRITICAL y se corrige en el plan, no se reinterpreta.
3. Si un principio necesita cambiar, se hace con `/speckit-constitution`; el usuario ratifica.
