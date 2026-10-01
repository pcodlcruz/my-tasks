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
- Toda operación **del agente** sobre Google Cloud pasa por el **MCP oficial de Google Cloud**
  con la cuenta de servicio del agente.
- **Nunca** ejecutes `gcloud`, `gsutil` ni `bq` directamente, ni uses SDKs/APIs fuera del MCP.
- **Nunca** uses credenciales personales del usuario.
- La cuenta de servicio del agente es `mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com`
  (ver constitución); **nunca** uses otra. Las cuentas `terraform-*`, `terraform-plan-*` y
  `deployer-*` son exclusivas del pipeline CI/CD (federadas, sin claves) y el agente no las usa.
  Mientras el MCP no esté configurado para operar con ella, **no hay
  operaciones reales sobre Google Cloud**: si una tarea las requiere, detente y avisa.
- Cualquier cambio de infraestructura requiere confirmación explícita del usuario.

### Git y Pull Requests (Principios VI, VII)
- GitFlow: `feature/*` → `develop` (staging) → `release/*` → `main` (producción);
  `hotfix/*` → `main` con retro-merge a `develop`. Staging se despliega desde `develop`,
  `release/*` y `hotfix/*`; producción, desde `main`.
- Cada feature de Spec Kit se entrega en **una PR de diseño y una PR por fase** de `tasks.md`:
  - `feature/NNN-nombre` (igual que `specs/NNN-nombre/`): solo los documentos de diseño; su PR
    se abre tras `/speckit-analyze` y se fusiona antes de implementar.
  - `feature/NNN-nombre-fase-N`: el código de la fase N (`## Phase N: ...`), desde
    `origin/develop`; se implementa con `/speckit-implement fase N` y solo esa fase.
  Las crea automáticamente el hook `speckit.git.feature` (ver tabla de skills abajo); no se
  crean a mano salvo que ese hook falle.
- **Nunca** hagas commit directo a `main`, `develop`, `release/*` ni `hotfix/*`: siempre PR.
- **Nunca** ejecutes `merge` (ni equivalentes) sobre una PR, la hayas abierto tú o no: la fusión
  la ejecuta siempre el propietario, tras revisar el diff.
- Commits en inglés con [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): subject` (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`).
- Los despliegues a staging/producción los hace **solo el pipeline de CI/CD** con sus propias
  identidades; nunca manuales.

### Agentes y skills (Principio VIII)
Usa el agente o skill de `.claude/skills/` que cubra la tarea antes de actuar por tu cuenta.
Si ninguno la cubre, hazlo manualmente y justifícalo en la PR.

| Tarea | Skill |
|---|---|
| Frontend (React + TypeScript) | `mytasks-frontend-developer` |
| Backend (FastAPI) | `mytasks-backend-developer` |
| Arquitectura en Google Cloud (solo diseño) | `mytasks-google-cloud-architect` |
| Operación real sobre Google Cloud | `mytasks-google-cloud-operator` |
| Infraestructura como código | `mytasks-iac-developer` |
| Revisión de seguridad (obligatoria si tocas auth, autorización o modelo de datos) | `mytasks-security-auditor` |
| Planificación, issues, Kanban | `mytasks-project-manager` |
| Especificación → plan → tareas → implementación | `speckit-specify`, `speckit-plan`, `speckit-tasks`, `speckit-implement` |
| Ciclo git de la feature (ramas de diseño y de fase, commit de diseño, PRs) — automático vía hooks, ver `.specify/extensions.yml` | `speckit-git-feature`, `speckit-git-commit`, `speckit-git-pr` |

Los skills de rol viven en `.claude/skills/` de este repo (no a nivel usuario) con el prefijo `mytasks-`: Claude Code da prioridad al skill de usuario (`~/.claude/skills/`) sobre el de proyecto cuando comparten nombre, así que sin el prefijo se invocaría siempre la versión genérica de usuario en vez de la adaptada a este proyecto.

## Stack (fijado por la constitución; no se decide en cada plan)

- **Frontend**: React 18+, TypeScript estricto, TanStack Query, Zustand, Vitest, Playwright.
- **Backend**: Python 3.12+, FastAPI, pytest.
- **Persistencia**: Firestore (modo nativo) con `google-cloud-firestore`; emulador en local.
  No uses SQLAlchemy/Alembic aunque el skill `mytasks-backend-developer` los prefiera por defecto.
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
