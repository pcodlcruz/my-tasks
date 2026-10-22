# Implementation Plan: Perfilado mínimo de usuarios e invitaciones

**Branch**: `feature/003-user-roles-invitations` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-user-roles-invitations/spec.md`

## Summary

Hoy cualquier cuenta Google obtiene acceso en su primer inicio de sesión (feature 001): la
identidad es solo el `uid` del token y no existe ningún dato de usuario. Esta feature añade la
primera autorización de la aplicación: un **documento de cuenta** (`users/{uid}`, rol y estado)
y un **documento de invitación** por correo (`invitations/{correo}`). El backend deja de fiarse
solo del token: cada petición de datos exige una cuenta **activa**, y las operaciones de
administración exigen además rol `admin`.

Decisiones clave (detalle y alternativas en [research.md](research.md)):

- La **autorización vive en el backend contra Firestore**, no en Identity Platform. Evita
  funciones de bloqueo, claims personalizados y permisos nuevos de Auth para la cuenta de
  servicio de la API.
- La **revocación es inmediata**: se comprueba el estado de la cuenta en cada petición, así que
  no depende de la caducidad del token (~1 h). Cierra el riesgo LOW-004 de la feature 001.
- La invitación se **acepta en un endpoint explícito** (`GET /api/v1/me`) que llama el frontend
  tras iniciar sesión; los endpoints de tareas nunca crean cuentas.
- El **primer administrador** se designa con la variable no secreta `BOOTSTRAP_ADMIN_EMAIL`
  por entorno (variable de GitHub Environment que el pipeline inyecta al desplegar). Solo
  concede `admin` si el token trae ese correo verificado y la cuenta aún no existe.
- Sin envío de correo, sin promoción de roles, sin caducidad de invitaciones (supuestos de la spec).

## Technical Context

**Language/Version**: Python 3.12+ (backend), TypeScript estricto con React 18+ (frontend)

**Primary Dependencies**: FastAPI, Pydantic, `firebase-admin` y `google-cloud-firestore`
(ya presentes); TanStack Query y el router existente en frontend. **Ninguna dependencia nueva.**

**Storage**: Firestore (modo nativo). Se reutiliza el documento padre `users/{uid}` de las
tareas (`users/{uid}/tasks/{id}`), que hoy es implícito; se añade la colección `invitations`.
No hay migración de las tareas existentes.

**Testing**: pytest (unitarios de dominio, integración por endpoint contra los emuladores),
Vitest (hooks y componentes), Playwright (flujos e2e con los emuladores).

**Target Platform**: Cloud Run (API y web) en staging y producción; emuladores en local.

**Project Type**: aplicación web (frontend + backend), como las features anteriores.

**Performance Goals**: una lectura de Firestore adicional por petición autenticada; los
umbrales de `test_performance.py` de la feature 001 deben seguir cumpliéndose.

**Constraints**: fallo cerrado ante cualquier duda (FR-018); revocación efectiva en < 5 min
(SC-003, el diseño la deja en la siguiente petición); sin secretos nuevos; sin permisos IAM
nuevos para `mytasks-api-run-<env>`.

**Scale/Scope**: aplicación personal con un administrador y un puñado de usuarios invitados;
el listado de accesos no necesita paginación avanzada (límite fijo de 100 por lista).

## Constitution Check

*GATE: debe pasar antes de la Fase 0. Reevaluado tras el diseño de la Fase 1.*

| Principio | Evaluación |
|---|---|
| I. Simplicidad | **Pasa.** Dos colecciones, ningún servicio nuevo, ninguna dependencia, sin roles editables, sin caducidad, sin correo. Alternativas más complejas rechazadas en research.md (R1, R2, R4). |
| II. Tests por niveles | **Pasa.** Unitarios (normalización de correo, transiciones de estado), integración por cada endpoint nuevo y por cada endpoint de tareas ante cuenta ausente/revocada, e2e de los flujos principales (ver quickstart.md). |
| III. Seguridad de aplicación | **Pasa con obligación.** Todo endpoint exige autenticación; el rol se verifica en servidor; entradas validadas con Pydantic; sin secretos en el repo (`BOOTSTRAP_ADMIN_EMAIL` no es secreto). Toca autenticación, autorización y modelo de datos: **revisión `mytasks-security-auditor` obligatoria** antes de fusionar cada fase con ese alcance (FR-019). |
| IV. Paridad de entornos | **Pasa.** Misma topología; solo cambia el valor de la variable por entorno. Se valida en staging antes de producción. |
| V. Identidad de agente / MCP | **Pasa.** El diseño no requiere operaciones del agente sobre Google Cloud ni roles IAM nuevos. Cualquier operación real queda fuera del agente. |
| VI. Despliegue por pipeline | **Pasa.** El cambio de `deploy.yml` (inyectar la variable) se entrega por PR y se aplica en el siguiente despliegue del pipeline. |
| VII. Revisión humana | **Pasa.** Una PR de diseño y una por fase; las fusiona el propietario. |
| VIII. Agentes y skills | **Pasa.** Backend: `mytasks-backend-developer`; frontend: `mytasks-frontend-developer`; pipeline/IaC: `mytasks-iac-developer`; revisión: `mytasks-security-auditor`. |
| IX. Idioma | **Pasa.** Documentos en español; código y commits en inglés. |

**Re-evaluación tras la Fase 1**: sin cambios; no hay violaciones, por lo que no se rellena el
Complexity Tracking.

**Efecto sobre la feature 001**: el FR-001 y el SC-001 de esa spec ("sin intervención de un
administrador") quedan sustituidos por el FR-002 de esta. Una tarea de la fase de cierre anota
la sustitución en `specs/001-eisenhower-task-manager/spec.md`.

## Project Structure

### Documentation (this feature)

```text
specs/003-user-roles-invitations/
├── plan.md              # Este fichero
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   └── access.yaml      # Fase 1: endpoints nuevos y cambios en los existentes
└── tasks.md             # Fase 2 (/speckit-tasks, no lo crea este comando)
```

### Source Code (repository root)

```text
backend/
├── src/mytasks_api/
│   ├── auth.py                      # MODIFICADO: get_current_user verifica el token;
│   │                                #   nuevos get_active_user y require_admin
│   ├── config.py                    # MODIFICADO: bootstrap_admin_email
│   ├── domain/account.py            # NUEVO: Role, AccountStatus, InvitationStatus,
│   │                                #   normalización de correo, transiciones
│   ├── repositories/account_repository.py   # NUEVO: users/{uid} e invitations/{correo}
│   ├── services/access_service.py   # NUEVO: aceptar, invitar, revocar, reactivar
│   ├── schemas/access.py            # NUEVO: MeOut, InvitationIn/Out, AccessListOut
│   ├── routers/me.py                # NUEVO: GET /api/v1/me
│   ├── routers/admin.py             # NUEVO: /api/v1/admin/...
│   ├── routers/tasks.py             # MODIFICADO: Depends(get_active_user)
│   ├── factory.py                   # MODIFICADO: routers y handler de AccessDenied
│   └── logging_config.py            # MODIFICADO: campos de auditoría de accesos
└── tests/
    ├── conftest.py                  # MODIFICADO: las cuentas de prueba se crean activas
    ├── unit/domain/test_account.py
    ├── unit/services/test_access_service.py
    └── integration/test_me.py, test_admin_invitations.py, test_admin_users.py,
        test_access_enforcement.py, test_access_audit.py

frontend/src/
├── features/auth/useAccount.ts      # NUEVO (Fase 1): consulta /me
├── features/auth/AccessDeniedPage.tsx   # NUEVO (Fase 1)
├── features/auth/LoginPage.tsx      # MODIFICADO (Fase 1): aviso de acceso por invitación
├── features/admin/AccessPage.tsx    # NUEVO (Fase 3): invitaciones y usuarios
├── app/ProtectedRoute.tsx           # MODIFICADO: cuenta activa (Fase 1); ruta de admin (Fase 3)
├── app/AppHeader.tsx                # MODIFICADO (Fase 3): enlace solo para admin
└── api/access.ts, api/types.ts      # NUEVO / MODIFICADO

frontend/tests/
├── unit/                            # Vitest, junto a las carpetas existentes (app, features, api)
└── e2e/                             # Playwright; fixtures/auth.ts siembra invitaciones por REST
                                     #   al emulador y añade loginAsAdmin

.github/workflows/deploy.yml         # MODIFICADO: inyecta BOOTSTRAP_ADMIN_EMAIL
infra/                               # sin recursos nuevos (ver research.md R5)
```

**Structure Decision**: se mantiene la estructura en capas ya existente
(`routers → services → repositories → domain`), igual que las tareas. El backend sigue siendo
la única vía a Firestore (las reglas de Firestore ya deniegan todo acceso de cliente).

## Fases propuestas para `tasks.md`

1. **Acceso por invitación de extremo a extremo** (dominio, repositorio, `/me`, dependencia
   `get_active_user`, bootstrap, ajuste de fixtures y endpoints de tareas; frontend mínimo con
   la consulta de cuenta y la pantalla sin acceso; fixtures e2e que siembran invitaciones;
   variable `BOOTSTRAP_ADMIN_EMAIL` en `deploy.yml`). Se entrega completa porque `develop` se
   despliega a staging al fusionar: un backend que denegara sin frontend que llame a `/me`
   dejaría fuera al propietario y rompería el check `e2e`, que es obligatorio.
2. **Backend: administración** (invitar, listar, revocar, reactivar, auditoría).
3. **Frontend: pantalla de administración** (ruta y enlace solo para `admin`, e2e de invitar y
   revocar).
4. **Documentación y cierre** (runbook, anotación en la spec 001, contrato, revisión de
   seguridad final, validación en staging).

## Complexity Tracking

Sin violaciones de la constitución: no se rellena.
