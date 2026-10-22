---

description: "Lista de tareas de implementación de la feature 003-user-roles-invitations"
---

# Tasks: Perfilado mínimo de usuarios e invitaciones

**Input**: documentos de diseño de `specs/003-user-roles-invitations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/access.yaml](./contracts/access.yaml),
[quickstart.md](./quickstart.md)

**Tests**: **obligatorios** por el Principio II (NON-NEGOTIABLE): unitarios para el dominio y el
servicio, integración por cada endpoint nuevo o modificado, y e2e con Playwright por cada flujo
principal. Se escriben primero y deben fallar antes de implementar.

**Organization**: las fases siguen el orden del plan (Fases 1 a 4) porque cada `## Phase N` se
entrega en su propia rama `feature/003-user-roles-invitations-fase-N` y PR a `develop`
(Principio VII). Cada tarea lleva la historia a la que sirve: **US1** acceso restringido a
invitados, **US2** el administrador invita, **US3** el administrador gestiona accesos, **US4** el
usuario sigue trabajando como hasta ahora.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1…US4)
- **(propietario)**: acto humano que el agente no puede ni debe hacer (incluida toda fusión de PR:
  un agente nunca ejecuta `merge`)

## Convenciones

- Estructura: `backend/`, `frontend/`, `.github/workflows/` (ver plan.md, *Source Code*).
- Código y comentarios en **inglés**; documentación y PRs en **español**; commits en inglés con
  Conventional Commits (Principio IX).
- Backend con `mytasks-backend-developer`, frontend con `mytasks-frontend-developer`, pipeline
  con `mytasks-iac-developer`, revisiones con `mytasks-security-auditor` (Principio VIII).
- Esta feature no requiere ninguna operación del agente sobre Google Cloud ni cambios de IAM.
- Los identificadores `T###` se asignan en orden de ejecución.

---

## Phase 1: Backend — cuentas y aplicación del acceso (US1, US4)

**Purpose**: que solo una cuenta activa pueda usar la API de tareas, y que las cuentas se creen
únicamente por invitación aceptada o por el bootstrap del administrador. Agente:
`mytasks-backend-developer`.

**Goal**: un desconocido no obtiene acceso ni datos; el propietario entra como `admin` con sus
tareas intactas; un `user` activo usa las tareas como hasta ahora.

**Independent Test**: escenarios 1, 2 y 4 de [quickstart.md](./quickstart.md) contra los
emuladores, con las invitaciones sembradas directamente en Firestore.

### Tests (escribir primero y comprobar que fallan)

- [ ] T001 [P] [US1] Tests unitarios de dominio (normalización de correo, validación, transiciones de estado de cuenta e invitación, rechazo de revocar un `admin`) en `backend/tests/unit/domain/test_account.py`
- [ ] T002 [P] [US1] Tests unitarios del servicio de sesión (invitación pendiente → cuenta `user` y aceptada una sola vez; bootstrap solo con correo verificado y cuenta inexistente; correo no verificado denegado; sin invitación denegado; fallo del repositorio → denegado) en `backend/tests/unit/services/test_access_service.py`
- [ ] T003 [P] [US1] Test de integración de `GET /api/v1/me` (desconocido → 403 sin crear `users/{uid}`; invitado → 200 y `accepted`; segunda llamada no duplica; dos llamadas simultáneas aceptan una sola vez; bootstrap conserva las tareas existentes; cuenta revocada → 403; sin token → 401) en `backend/tests/integration/test_me.py`
- [ ] T004 [P] [US4] Test de integración parametrizado que recorre **cada** endpoint de `/api/v1/tasks` y comprueba 401 sin token, 403 `access_denied` sin cuenta y con cuenta revocada, y que el 401 precede al 403, en `backend/tests/integration/test_access_enforcement.py`
- [ ] T005 [P] [US1] Test unitario de `bootstrap_admin_email` (opcional, normalizado, vacío = desactivado) en `backend/tests/unit/test_config.py`

### Implementation

- [ ] T006 [P] [US1] Crear el dominio (`Role`, `AccountStatus`, `InvitationStatus`, `normalize_email`, errores `AccessDeniedError`/`InvalidEmailError`) en `backend/src/mytasks_api/domain/account.py` (T001)
- [ ] T007 [P] [US1] Añadir `bootstrap_admin_email` a `Settings` y documentarlo en `backend/.env.example` (T005)
- [ ] T008 [US1] Crear el repositorio de cuentas e invitaciones (leer `users/{uid}`, aceptar invitación en transacción, crear cuenta bootstrap, actualizar el correo guardado) en `backend/src/mytasks_api/repositories/account_repository.py` (depende de T006)
- [ ] T009 [US1] Crear `AccessService.resolve_session(uid, email, email_verified)` con la lógica de R3 en `backend/src/mytasks_api/services/access_service.py` (depende de T006, T007, T008)
- [ ] T010 [US1] Extender `CurrentUser` con `email_verified` y añadir la dependencia `get_active_user` (cuenta activa o `AccessDeniedError`; fallo cerrado ante error del repositorio) en `backend/src/mytasks_api/auth.py`
- [ ] T011 [P] [US1] Crear los esquemas `MeOut` y `ErrorOut` de acceso en `backend/src/mytasks_api/schemas/access.py`
- [ ] T012 [US1] Crear `GET /api/v1/me` en `backend/src/mytasks_api/routers/me.py` y registrarlo, junto al manejador 403 `access_denied` (mensaje idéntico para «sin invitación» y «revocado», FR-017), en `backend/src/mytasks_api/factory.py` (depende de T009, T010, T011)
- [ ] T013 [US4] Sustituir `get_current_user` por `get_active_user` en todos los endpoints y en `valid_task_id` de `backend/src/mytasks_api/routers/tasks.py` (depende de T010)
- [ ] T014 [P] [US1] Añadir los campos `actor_uid` y `target` (hash SHA-256 truncado del correo) a la lista cerrada de `log_event` y los eventos `access_denied` e `invitation_accepted` en `backend/src/mytasks_api/logging_config.py`, con su test en `backend/tests/unit/test_logging_config.py`
- [ ] T015 [US4] Actualizar `backend/tests/conftest.py`: `google_user` crea por defecto la cuenta activa `users/{uid}`, nueva fixture `google_user_without_account` y helpers de siembra de invitaciones y cuentas revocadas
- [ ] T016 [US4] Ejecutar la suite completa de `backend/` (incluida `test_performance.py`) y corregir regresiones; confirmar que los tests de la feature 001 pasan sin cambiar su intención
- [ ] T017 [P] [US1] Ampliar `backend/scripts/export_openapi.py` y su test `backend/tests/unit/test_export_openapi.py` para que el contrato exportado incluya `/api/v1/me` y el 403 en las tareas (conforme a [contracts/access.yaml](./contracts/access.yaml))
- [ ] T018 [US1] Revisión de seguridad de la fase con `mytasks-security-auditor` (autenticación, autorización y modelo de datos, Principio III) y registro en `specs/003-user-roles-invitations/security-review-fase-1.md`; corregir los hallazgos CRITICAL/HIGH antes de abrir la PR

**Checkpoint**: la API rechaza a cualquiera sin cuenta activa; T003, T004 y la suite de la
feature 001 en verde.

---

## Phase 2: Backend — administración de invitaciones y accesos (US2, US3)

**Purpose**: que el administrador invite, liste y revoque. Agente: `mytasks-backend-developer`.
Depende de la Fase 1 fusionada.

**Goal**: el administrador invita a otra persona y gestiona quién tiene acceso; un `user` no
puede hacer nada de esto.

**Independent Test**: escenarios 3, 5, 6 y 7 de [quickstart.md](./quickstart.md) por API.

### Tests (escribir primero y comprobar que fallan)

- [ ] T019 [P] [US2] Tests unitarios del servicio de administración (invitar correo nuevo, ya pendiente → `already_pending`, con cuenta activa → conflicto, con cuenta revocada → `reactivated`, correo inválido, normalización de mayúsculas) en `backend/tests/unit/services/test_access_service_admin.py`
- [ ] T020 [P] [US2] Test de integración de `POST /api/v1/admin/invitations` (201, 200 sin duplicar, 409, 422, 403 a un `user`, 401 sin token, reactivación conserva las tareas) en `backend/tests/integration/test_admin_invitations.py`
- [ ] T021 [P] [US3] Test de integración de `GET /api/v1/admin/access`, `DELETE /api/v1/admin/invitations/{email}` y `DELETE /api/v1/admin/users/{uid}` (revocar invitación impide entrar; revocar cuenta → 403 inmediato en la siguiente petición y tareas conservadas; revocar un `admin` → 409; 404; 403 a un `user`; 401 sin token) en `backend/tests/integration/test_admin_users.py`
- [ ] T022 [P] [US2] Test de integración de la auditoría (cada invitación, aceptación, revocación, reactivación y denegación genera su evento sin correos en claro ni tokens) en `backend/tests/integration/test_access_audit.py`

### Implementation

- [ ] T023 [US2] Ampliar `backend/src/mytasks_api/repositories/account_repository.py` con crear/revocar invitación, listar (máx. 100), buscar cuenta por correo, revocar y reactivar cuenta (transaccionales)
- [ ] T024 [US2] Ampliar `backend/src/mytasks_api/services/access_service.py` con `invite`, `list_access`, `revoke_invitation`, `revoke_account` (rechaza `admin`) y los eventos de auditoría R8 (depende de T023)
- [ ] T025 [P] [US2] Añadir `InvitationIn`, `InvitationOut`, `AccountOut`, `InviteResultOut`, `AccessListOut` a `backend/src/mytasks_api/schemas/access.py` (`additionalProperties: false`, correo ≤ 254 caracteres y sin `/`)
- [ ] T026 [US2] Añadir la dependencia `require_admin` (rol verificado en servidor, 403 a un `user`) en `backend/src/mytasks_api/auth.py`
- [ ] T027 [US2] Crear los cinco endpoints de `/api/v1/admin` en `backend/src/mytasks_api/routers/admin.py` y registrarlos en `backend/src/mytasks_api/factory.py` (depende de T024, T025, T026)
- [ ] T028 [P] [US3] Actualizar `backend/scripts/export_openapi.py` y `backend/tests/unit/test_export_openapi.py` con los endpoints de administración
- [ ] T029 [US3] Ejecutar la suite completa de `backend/` y corregir regresiones
- [ ] T030 [US2] Revisión de seguridad con `mytasks-security-auditor` (control de roles, enumeración de correos, concurrencia, auditoría) y registro en `specs/003-user-roles-invitations/security-review-fase-2.md`

**Checkpoint**: un administrador gestiona accesos por API y un `user` recibe 403 en todo
`/api/v1/admin`.

---

## Phase 3: Frontend — sesión con cuenta, pantalla sin acceso y administración (US1, US2, US3, US4)

**Purpose**: la interfaz del flujo completo. Agente: `mytasks-frontend-developer`. Depende de la
Fase 2 fusionada.

**Goal**: quien no tiene acceso lo ve explicado; el administrador gestiona invitaciones y
usuarios; el `user` no ve la administración y usa el tablero igual que antes.

**Independent Test**: flujos e2e de los escenarios 1–6 de [quickstart.md](./quickstart.md).

### Tests (escribir primero y comprobar que fallan)

- [ ] T031 [P] [US1] Tests Vitest de `useAccount` (200 → cuenta; 403 → sin acceso; 401/red → error distinguible) en `frontend/src/features/auth/useAccount.test.ts`
- [ ] T032 [P] [US1] Tests Vitest de `ProtectedRoute` y `AccessDeniedPage` (sin acceso muestra el mensaje y el cierre de sesión; admin ve la ruta; `user` es redirigido de `/admin/access`) en `frontend/src/app/ProtectedRoute.test.tsx` y `frontend/src/features/auth/AccessDeniedPage.test.tsx`
- [ ] T033 [P] [US2] Tests Vitest de `AccessPage` (invitar con validación, listado con estados, revocar invitación y cuenta con confirmación, errores 409/422, accesibilidad por teclado) en `frontend/src/features/admin/AccessPage.test.tsx`
- [ ] T034 [P] [US1] Test e2e Playwright: desconocido denegado y sin datos; propietario entra como admin con sus tareas en `frontend/e2e/access-denied.spec.ts`
- [ ] T035 [P] [US2] Test e2e Playwright: admin invita → la persona invitada entra como `user` con lista vacía; el `user` no ve la administración en `frontend/e2e/invitations.spec.ts`
- [ ] T036 [P] [US3] Test e2e Playwright: revocar y reinvitar (pierde y recupera el acceso conservando las tareas) en `frontend/e2e/revoke-access.spec.ts`

### Implementation

- [ ] T037 [P] [US1] Añadir tipos y cliente de la API de acceso en `frontend/src/api/types.ts` y `frontend/src/api/access.ts`
- [ ] T038 [US1] Crear `useAccount` (TanStack Query sobre `GET /api/v1/me`) en `frontend/src/features/auth/useAccount.ts` (depende de T037)
- [ ] T039 [US1] Crear `AccessDeniedPage` («necesitas una invitación», cierre de sesión, sin revelar el motivo) en `frontend/src/features/auth/AccessDeniedPage.tsx`
- [ ] T040 [US1] Actualizar `frontend/src/features/auth/LoginPage.tsx`: sustituir el texto «La primera vez, tu cuenta se crea automáticamente» por el aviso de acceso solo por invitación
- [ ] T041 [US1] Integrar la cuenta en `frontend/src/app/ProtectedRoute.tsx` (carga → cuenta activa → 403 a `AccessDeniedPage`) y la ruta `/admin/access` solo para `admin` en `frontend/src/app/App.tsx` (depende de T038, T039)
- [ ] T042 [US4] Mostrar en `frontend/src/app/AppHeader.tsx` el enlace «Accesos» solo a un `admin`, sin alterar el resto del encabezado
- [ ] T043 [US2] Crear `AccessPage` (formulario de invitación, listado de invitaciones y cuentas con estado, revocar con `ConfirmDialog` existente, avisos con `toastStore`) en `frontend/src/features/admin/AccessPage.tsx` (depende de T037, T041)
- [ ] T044 [US4] Ejecutar `npm test`, `npm run lint`, el chequeo de tipos y los e2e completos; confirmar que los e2e de la feature 001 siguen en verde con la cuenta de prueba activa (ajustar `window.__mytasksTestLogin` o sus fixtures para sembrar la cuenta)
- [ ] T045 [US2] Revisión de seguridad con `mytasks-security-auditor` (rol solo cosmético en la interfaz, sin datos sensibles en el estado cliente, CSP) y registro en `specs/003-user-roles-invitations/security-review-fase-3.md`

**Checkpoint**: el flujo completo funciona en local con los emuladores.

---

## Phase 4: Pipeline, documentación y cierre (US1)

**Purpose**: poder desplegar el bootstrap del administrador por entorno y cerrar la feature.
Agente: `mytasks-iac-developer` para el workflow; el resto, el agente de documentación habitual.
Depende de la Fase 3 fusionada.

**Goal**: staging y producción despliegan con un administrador inicial garantizado y la
documentación refleja el acceso solo por invitación.

**Independent Test**: despliegue a staging por el pipeline y escenarios 1–3 de
[quickstart.md](./quickstart.md) con cuentas reales de prueba.

- [ ] T046 [US1] Añadir `BOOTSTRAP_ADMIN_EMAIL` a `--update-env-vars` del paso de despliegue de la API y exigir que exista en el paso «Check the service variables» (falla si falta) en `.github/workflows/deploy.yml`, leyéndola de `vars.BOOTSTRAP_ADMIN_EMAIL` del GitHub Environment (sin secretos)
- [ ] T047 [US1] (propietario) Crear la variable `BOOTSTRAP_ADMIN_EMAIL` con el correo de tu cuenta Google en los GitHub Environments `staging` y `production` (Settings → Environments → Variables)
- [ ] T048 [P] [US1] Documentar el procedimiento (bootstrap por entorno, cómo invitar, cómo recuperar el acceso de administrador si se pierde la cuenta) en `infra/RUNBOOK.md` y `README.md`
- [ ] T049 [P] [US1] Anotar en `specs/001-eisenhower-task-manager/spec.md` (FR-001, SC-001, historia 1), `data-model.md` y `plan.md` que el registro abierto queda sustituido por la feature 003 y que ahora existe el documento `users/{uid}`
- [ ] T050 [P] [US2] Integrar los endpoints nuevos en `specs/001-eisenhower-task-manager/contracts/openapi.yaml` a partir de [contracts/access.yaml](./contracts/access.yaml) y verificar que coincide con el contrato exportado por `backend/scripts/export_openapi.py`
- [ ] T051 [US1] Revisión de seguridad final de la feature (incluido el riesgo residual de identidades Google creadas por desconocidos en Identity Platform sin acceso a datos, y el enlace cuenta↔`uid` frente al correo) y registro en `specs/003-user-roles-invitations/security-review-final.md`
- [ ] T052 [US1] (propietario) Desplegar a staging por el pipeline y ejecutar los escenarios 1–3 del [quickstart.md](./quickstart.md); anotar el resultado en `specs/003-user-roles-invitations/validacion-staging.md`
- [ ] T053 [US1] Repasar el checklist *Definition of Done* de la constitución y marcar la feature como lista para release

---

## Dependencias y orden de ejecución

- **Fase 1** → **Fase 2** → **Fase 3** → **Fase 4**, cada una con su PR fusionada por el
  propietario antes de empezar la siguiente (cada fase sale de `origin/develop`).
- Dentro de cada fase: los tests (primero, en rojo) → dominio/repositorio → servicio → endpoints
  → integración y revisión de seguridad.
- **Historias**: US1 y US4 se entregan juntas en la Fase 1 (cerrar el acceso sin romper a los
  usuarios); US2 y US3 en la Fase 2 (API) y la Fase 3 (interfaz).
- **Despliegue**: no desplegar la Fase 1 a un entorno sin haber hecho antes T046 y T047, o el
  propietario quedaría fuera. Por eso el pipeline falla si falta la variable.

### Oportunidades de paralelismo

- Fase 1: T001–T005 a la vez; T006, T007, T011, T014, T017 a la vez.
- Fase 2: T019–T022 a la vez; T025 y T028 en paralelo con el repositorio.
- Fase 3: T031–T036 a la vez; T037 en paralelo con las páginas.
- Fase 4: T048, T049 y T050 a la vez.

## Estrategia de implementación

1. **MVP = Fase 1 + T046/T047**: con esto ya no puede entrar nadie sin cuenta; el propietario es
   admin y se pueden sembrar invitaciones a mano si hiciera falta.
2. Fase 2 devuelve la capacidad de invitar por API; Fase 3 la pone en la interfaz.
3. Cada fase se valida en staging antes de promover (Principio IV).

## Notas

- Las tareas de revisión de seguridad son obligatorias por el Principio III y por el FR-019.
- Ningún agente fusiona PRs (Principio VII); las marcadas «(propietario)» son actos humanos.
- Commits en inglés, p. ej. `feat(access): add active-account enforcement`.
