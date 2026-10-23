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

**Por qué la Fase 1 incluye el frontend mínimo y la variable de despliegue**: `develop` se
despliega a staging al fusionar. Si la Fase 1 llegara sin que el frontend llame a `/api/v1/me`,
nadie (tampoco el propietario) podría crear su cuenta y todo daría 403; y los e2e existentes,
que son un check obligatorio, fallarían. Por eso la Fase 1 deja el sistema completo y usable
(acceso por invitación y bootstrap del administrador), y la Fase 3 solo añade la administración.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1…US4)
- **(propietario)**: acto humano que el agente no puede ni debe hacer (incluida toda fusión de PR:
  un agente nunca ejecuta `merge`)

## Convenciones

- Estructura: `backend/`, `frontend/`, `.github/workflows/` (ver plan.md, *Source Code*).
- Tests de frontend: unitarios en `frontend/tests/unit/…` y e2e en `frontend/tests/e2e/…`
  (carpetas existentes); comandos `npm test` y `npm run test:e2e`.
- Código y comentarios en **inglés**; documentación y PRs en **español**; commits en inglés con
  Conventional Commits (Principio IX).
- Backend con `mytasks-backend-developer`, frontend con `mytasks-frontend-developer`, pipeline
  con `mytasks-iac-developer`, revisiones con `mytasks-security-auditor` (Principio VIII).
- Esta feature no requiere ninguna operación del agente sobre Google Cloud ni cambios de IAM.
- Los identificadores `T###` se asignan en orden de ejecución.

---

## Phase 1: Acceso por invitación de extremo a extremo (US1, US4)

**Purpose**: que solo una cuenta activa pueda usar la aplicación y que las cuentas se creen
únicamente por invitación aceptada o por el bootstrap del administrador, con el frontend mínimo
que lo hace usable. Agentes: `mytasks-backend-developer` (T001–T005, T009–T020),
`mytasks-frontend-developer` (T006–T008, T021–T027) y `mytasks-iac-developer` (T028).

**Goal**: un desconocido no obtiene acceso ni datos; el propietario entra como `admin` con sus
tareas intactas; un `user` activo usa las tareas como hasta ahora; staging queda utilizable.

**Independent Test**: escenarios 1, 2 y 4 de [quickstart.md](./quickstart.md) contra los
emuladores, con las invitaciones sembradas en Firestore (por la fixture e2e o a mano).

### Tests (escribir primero y comprobar que fallan)

- [X] T001 [P] [US1] Tests unitarios de dominio (normalización de correo, validación, transiciones de estado de cuenta e invitación, rechazo de revocar un `admin`) en `backend/tests/unit/domain/test_account.py`
- [X] T002 [P] [US1] Tests unitarios del servicio de sesión (invitación pendiente → cuenta `user` y aceptada una sola vez; bootstrap solo con correo verificado y cuenta inexistente; correo no verificado denegado; sin invitación denegado; fallo del repositorio → denegado) en `backend/tests/unit/services/test_access_service.py`
- [X] T003 [P] [US1] Test de integración de `GET /api/v1/me` (desconocido → 403 sin crear `users/{uid}`; invitado → 200 y `accepted`; segunda llamada no duplica; dos llamadas simultáneas aceptan una sola vez; bootstrap conserva las tareas existentes; cuenta revocada → 403; sin token → 401) en `backend/tests/integration/test_me.py`
- [X] T004 [P] [US4] Test de integración parametrizado que recorre **cada** endpoint de `/api/v1/tasks` y comprueba 401 sin token, 403 `access_denied` sin cuenta y con cuenta revocada, y que el 401 precede al 403, en `backend/tests/integration/test_access_enforcement.py`
- [X] T005 [P] [US1] Test unitario de `bootstrap_admin_email` (opcional, normalizado, vacío = desactivado) en `backend/tests/unit/test_config.py`
- [X] T006 [P] [US1] Tests Vitest de `useAccount` (200 → cuenta; 403 → sin acceso; 401/red → error distinguible) en `frontend/tests/unit/features/auth/useAccount.test.tsx`
- [X] T007 [P] [US1] Tests Vitest de `ProtectedRoute` y `AccessDeniedPage` (cuenta activa deja pasar; sin acceso muestra el mensaje y el cierre de sesión; carga muestra estado de espera) en `frontend/tests/unit/app/ProtectedRoute.test.tsx` y `frontend/tests/unit/features/auth/AccessDeniedPage.test.tsx`
- [X] T008 [P] [US1] Test e2e Playwright: un desconocido ve «necesitas una invitación» y no obtiene datos; el administrador de bootstrap entra con su cuenta, en `frontend/tests/e2e/access-denied.spec.ts`

### Implementation — backend

- [X] T009 [P] [US1] Crear el dominio (`Role`, `AccountStatus`, `InvitationStatus`, `normalize_email`, errores `AccessDeniedError`/`InvalidEmailError`) en `backend/src/mytasks_api/domain/account.py` (T001)
- [X] T010 [P] [US1] Añadir `bootstrap_admin_email` a `Settings` y documentarlo en `backend/.env.example` (T005)
- [X] T011 [US1] Crear el repositorio de cuentas e invitaciones (leer `users/{uid}`, aceptar invitación en transacción, crear cuenta bootstrap) en `backend/src/mytasks_api/repositories/account_repository.py` (depende de T009). Nota: la actualización del correo guardado desde `/me` queda fuera hasta decidir qué hacer si el nuevo correo ya pertenece a otra cuenta (hallazgo F4 de `/speckit-analyze`); la cuenta se identifica por `uid`
- [X] T012 [US1] Crear `AccessService.resolve_session(uid, email, email_verified)` con la lógica de R3 en `backend/src/mytasks_api/services/access_service.py` (depende de T009, T010, T011)
- [X] T013 [US1] Extender `CurrentUser` con `email_verified` y añadir la dependencia `get_active_user` (cuenta activa o `AccessDeniedError`; fallo cerrado ante error del repositorio) en `backend/src/mytasks_api/auth.py`
- [X] T014 [P] [US1] Crear los esquemas `MeOut` y `ErrorOut` de acceso en `backend/src/mytasks_api/schemas/access.py`
- [X] T015 [US1] Crear `GET /api/v1/me` en `backend/src/mytasks_api/routers/me.py` y registrarlo, junto al manejador 403 `access_denied` (mensaje idéntico para «sin invitación» y «revocado», FR-017), en `backend/src/mytasks_api/factory.py` (depende de T012, T013, T014)
- [X] T016 [US4] Sustituir `get_current_user` por `get_active_user` en todos los endpoints y en `valid_task_id` de `backend/src/mytasks_api/routers/tasks.py` (depende de T013)
- [X] T017 [P] [US1] Añadir los campos `actor_uid` y `target` (hash SHA-256 truncado del correo) a la lista cerrada de `log_event` y los eventos `access_denied` e `invitation_accepted` en `backend/src/mytasks_api/logging_config.py`, con su test en `backend/tests/unit/test_logging_config.py`
- [X] T018 [US4] Actualizar `backend/tests/conftest.py`: `google_user` crea por defecto la cuenta activa `users/{uid}`, nueva fixture `google_user_without_account` y helpers de siembra de invitaciones y cuentas revocadas
- [X] T019 [US4] Ejecutar la suite completa de `backend/` (incluida `test_performance.py`) y corregir regresiones; confirmar que los tests de la feature 001 pasan sin cambiar su intención
- [X] T020 [P] [US1] Ampliar `backend/scripts/export_openapi.py` y su test `backend/tests/unit/test_export_openapi.py` para que el contrato exportado incluya `/api/v1/me` y el 403 en las tareas (conforme a [contracts/access.yaml](./contracts/access.yaml))

### Implementation — frontend mínimo

- [X] T021 [P] [US1] Añadir los tipos y el cliente de la API de cuenta (`getMe`) en `frontend/src/api/types.ts` y `frontend/src/api/access.ts`
- [X] T022 [US1] Crear `useAccount` (TanStack Query sobre `GET /api/v1/me`) en `frontend/src/features/auth/useAccount.ts` (depende de T021; T006)
- [X] T023 [P] [US1] Crear `AccessDeniedPage` («necesitas una invitación», cierre de sesión, sin revelar el motivo) en `frontend/src/features/auth/AccessDeniedPage.tsx` (T007)
- [X] T024 [P] [US1] Actualizar `frontend/src/features/auth/LoginPage.tsx`: sustituir el texto «La primera vez, tu cuenta se crea automáticamente» por el aviso de acceso solo por invitación
- [X] T025 [US1] Integrar la cuenta en `frontend/src/app/ProtectedRoute.tsx` (carga → cuenta activa → 403 a `AccessDeniedPage`) (depende de T022, T023)
- [X] T026 [US4] Adaptar las fixtures e2e en `frontend/tests/e2e/fixtures/auth.ts`: `loginAsGoogleUser(email, { invited = true })` siembra `invitations/{email}` por REST en el emulador de Firestore desde el proceso de Playwright (nunca desde el bundle) antes de iniciar sesión, y nuevo helper `loginAsAdmin`; en `frontend/playwright.config.ts` pasar `BOOTSTRAP_ADMIN_EMAIL=admin-e2e@example.com` al backend. Los specs `us1`–`us5` existentes no deben necesitar cambios
- [X] T027 [US4] Ejecutar `npm test`, `npm run lint`, el chequeo de tipos y `npm run test:e2e` completos; confirmar que los e2e de la feature 001 siguen en verde (depende de T025, T026)

### Pipeline

- [X] T028 [US1] Añadir `BOOTSTRAP_ADMIN_EMAIL` a `--update-env-vars` del paso de despliegue de la API y exigir que exista en un paso propio «Check the bootstrap administrator» (falla si falta o no es una dirección válida) en `.github/workflows/deploy.yml`, leyéndola de `vars.BOOTSTRAP_ADMIN_EMAIL` del GitHub Environment (sin secretos); test en `.github/scripts/tests/test_deploy_bootstrap_admin.py`, registrado en el job `scripts-tests` de `ci.yml`
- [X] T029 [US1] (propietario) Crear la variable `BOOTSTRAP_ADMIN_EMAIL` con el correo de tu cuenta Google en los GitHub Environments `staging` y `production` (Settings → Environments → Variables). **Debe estar hecha antes de fusionar la PR de esta fase**

### Revisión de seguridad

- [X] T030 [US1] Revisión de seguridad de la fase con `mytasks-security-auditor` (autenticación, autorización, modelo de datos y gate de sesión del cliente, Principio III) y registro en `specs/003-user-roles-invitations/security-review-fase-1.md`; corregir los hallazgos CRITICAL/HIGH antes de abrir la PR

**Checkpoint**: la API rechaza a cualquiera sin cuenta activa; el propietario puede entrar como
admin en staging; T003, T004, T008 y la suite de la feature 001 (backend y e2e) en verde.

---

## Phase 2: Backend — administración de invitaciones y accesos (US2, US3)

**Purpose**: que el administrador invite, liste y revoque. Agente: `mytasks-backend-developer`.
Depende de la Fase 1 fusionada.

**Goal**: el administrador invita a otra persona y gestiona quién tiene acceso; un `user` no
puede hacer nada de esto.

**Independent Test**: escenarios 3, 5, 6 y 7 de [quickstart.md](./quickstart.md) por API.

### Tests (escribir primero y comprobar que fallan)

- [X] T031 [P] [US2] Tests unitarios del servicio de administración (invitar correo nuevo, ya pendiente → `already_pending`, con cuenta activa → conflicto, con cuenta revocada → `reactivated`, correo inválido, normalización de mayúsculas) en `backend/tests/unit/services/test_access_service_admin.py`
- [X] T032 [P] [US2] Test de integración de `POST /api/v1/admin/invitations` (201, 200 sin duplicar, 409, 422, 403 a un `user`, 401 sin token, reactivación conserva las tareas) en `backend/tests/integration/test_admin_invitations.py`
- [X] T033 [P] [US3] Test de integración de `GET /api/v1/admin/access`, `DELETE /api/v1/admin/invitations/{email}` y `DELETE /api/v1/admin/users/{uid}` (revocar invitación impide entrar; revocar cuenta → 403 inmediato en la siguiente petición y tareas conservadas; revocar un `admin` → 409; 404; 403 a un `user`; 401 sin token) en `backend/tests/integration/test_admin_users.py`
- [X] T034 [P] [US2] Test de integración de la auditoría (cada invitación, aceptación, revocación, reactivación y denegación genera su evento sin correos en claro ni tokens) en `backend/tests/integration/test_access_audit.py`

### Implementation

- [X] T035 [US2] Ampliar `backend/src/mytasks_api/repositories/account_repository.py` con crear/revocar invitación, listar (máx. 100), buscar cuenta por correo, revocar y reactivar cuenta (transaccionales)
- [X] T036 [US2] Ampliar `backend/src/mytasks_api/services/access_service.py` con `invite`, `list_access`, `revoke_invitation`, `revoke_account` (rechaza `admin`) y los eventos de auditoría R8 (depende de T035)
- [X] T037 [P] [US2] Añadir `InvitationIn`, `InvitationOut`, `AccountOut`, `InviteResultOut`, `AccessListOut` a `backend/src/mytasks_api/schemas/access.py` (`additionalProperties: false`, correo ≤ 254 caracteres y sin `/`)
- [X] T038 [US2] Añadir la dependencia `require_admin` (rol verificado en servidor, 403 a un `user`) en `backend/src/mytasks_api/auth.py`
- [X] T039 [US2] Crear los cinco endpoints de `/api/v1/admin` en `backend/src/mytasks_api/routers/admin.py` y registrarlos en `backend/src/mytasks_api/factory.py` (depende de T036, T037, T038)
- [X] T040 [P] [US3] Actualizar `backend/scripts/export_openapi.py` y `backend/tests/unit/test_export_openapi.py` con los endpoints de administración
- [X] T041 [US3] Ejecutar la suite completa de `backend/` y corregir regresiones
- [X] T042 [US2] Revisión de seguridad con `mytasks-security-auditor` (control de roles, enumeración de correos, concurrencia, auditoría) y registro en `specs/003-user-roles-invitations/security-review-fase-2.md`

**Checkpoint**: un administrador gestiona accesos por API y un `user` recibe 403 en todo
`/api/v1/admin`.

---

## Phase 3: Frontend — pantalla de administración (US2, US3, US4)

**Purpose**: la interfaz de administración. Agente: `mytasks-frontend-developer`. Depende de la
Fase 2 fusionada. La sesión con cuenta y la pantalla sin acceso ya llegaron en la Fase 1.

**Goal**: el administrador gestiona invitaciones y usuarios desde la interfaz; el `user` no ve
la administración y usa el tablero igual que antes.

**Independent Test**: flujos e2e de los escenarios 3–6 de [quickstart.md](./quickstart.md).

### Tope de invitaciones pendientes (backend; decisión del propietario sobre MED-001)

Como la lista de accesos se trunca a 100, no se pueden acumular invitaciones sin límite: como
máximo **50 pendientes a la vez**. Superarlo responde 409 `invitation_limit_reached`; reinvitar a
una dirección ya pendiente (200) y reactivar una cuenta no cuentan; revocar una invitación libera
un hueco. Agente: `mytasks-backend-developer`. Se hace antes que el frontend.

- [X] T059 [P] [US2] Tests unitarios del tope en `backend/tests/unit/services/test_access_service_admin.py` (la invitación 51 falla; ya pendiente y reactivación no cuentan; revocar libera un hueco; el tope no impide invitar con menos de 50)
- [X] T060 [P] [US2] Test de integración en `backend/tests/integration/test_admin_invitations.py` (la invitación 51 devuelve 409 `invitation_limit_reached` y no crea nada; reinvitar un pendiente devuelve 200; revocar una y volver a invitar funciona; invitaciones concurrentes en el límite nunca superan 50)
- [X] T061 [US2] Implementar el tope: `PendingInvitationLimitError` en `backend/src/mytasks_api/domain/account.py`, recuento de pendientes dentro de la transacción de `upsert_pending_invitation` en `repositories/account_repository.py`, constante `MAX_PENDING_INVITATIONS = 50` en `services/access_service.py`, manejador 409 en `factory.py`, y el contrato en `contracts/access.yaml` (409 de `createInvitation`) y `data-model.md`
- [X] T062 [US2] Ejecutar la suite completa de `backend/` (incluidos `ruff` y `mypy`) y regenerar/verificar el contrato exportado

### Tests (escribir primero y comprobar que fallan)

- [X] T043 [P] [US2] Tests Vitest de `AccessPage` (invitar con validación, listado con estados, revocar invitación y cuenta con confirmación, errores 409 —ya tiene acceso y `invitation_limit_reached`— y 422, accesibilidad por teclado) en `frontend/tests/unit/features/admin/AccessPage.test.tsx`
- [X] T044 [P] [US4] Tests Vitest de la ruta `/admin/access` y del enlace «Accesos» (un `admin` los ve; un `user` no ve el enlace y es redirigido) en `frontend/tests/unit/app/AdminRoute.test.tsx`
- [X] T045 [P] [US2] Test e2e Playwright: el admin invita → la persona invitada entra como `user` con lista vacía; el `user` no ve la administración, en `frontend/tests/e2e/invitations.spec.ts`
- [X] T046 [P] [US3] Test e2e Playwright: revocar y reinvitar (pierde y recupera el acceso conservando las tareas) en `frontend/tests/e2e/revoke-access.spec.ts`

### Implementation

- [X] T047 [US2] Ampliar `frontend/src/api/types.ts` y `frontend/src/api/access.ts` con las llamadas de administración (`listAccess`, `createInvitation`, `revokeInvitation`, `revokeUserAccess`)
- [X] T048 [US2] Añadir la ruta `/admin/access` solo para `admin` (redirige a un `user`) en `frontend/src/app/App.tsx` y `frontend/src/app/ProtectedRoute.tsx` (depende de T047)
- [X] T049 [US4] Mostrar en `frontend/src/app/AppHeader.tsx` el enlace «Accesos» solo a un `admin`, sin alterar el resto del encabezado
- [X] T050 [US2] Crear `AccessPage` (formulario de invitación, listado de invitaciones y cuentas con estado, revocar con `ConfirmDialog` existente, avisos con `toastStore`) en `frontend/src/features/admin/AccessPage.tsx` (depende de T047, T048)
- [X] T051 [US4] Ejecutar `npm test`, `npm run lint`, el chequeo de tipos y `npm run test:e2e` completos; confirmar que los e2e de la feature 001 siguen en verde
- [X] T052 [US2] Revisión de seguridad con `mytasks-security-auditor` (rol solo cosmético en la interfaz, sin datos sensibles en el estado cliente, CSP) y registro en `specs/003-user-roles-invitations/security-review-fase-3.md`

**Checkpoint**: el flujo completo de administración funciona en local con los emuladores.

---

## Phase 4: Documentación y cierre (US1, US2)

**Purpose**: documentar el procedimiento y cerrar la feature. Agente: el de documentación
habitual. Depende de la Fase 3 fusionada.

**Goal**: la documentación refleja el acceso solo por invitación y la feature queda validada en
staging.

**Independent Test**: despliegue a staging por el pipeline y escenarios 1–3 de
[quickstart.md](./quickstart.md) con cuentas reales de prueba.

- [ ] T053 [P] [US1] Documentar el procedimiento (bootstrap por entorno, cómo invitar, cómo recuperar el acceso de administrador si se pierde la cuenta) en `infra/RUNBOOK.md` y `README.md`
- [ ] T054 [P] [US1] Anotar en `specs/001-eisenhower-task-manager/spec.md` (FR-001, SC-001, historia 1), `data-model.md` y `plan.md` que el registro abierto queda sustituido por la feature 003 y que ahora existe el documento `users/{uid}`
- [ ] T055 [P] [US2] Integrar los endpoints nuevos en `specs/001-eisenhower-task-manager/contracts/openapi.yaml` a partir de [contracts/access.yaml](./contracts/access.yaml) y verificar que coincide con el contrato exportado por `backend/scripts/export_openapi.py`
- [ ] T056 [US1] Revisión de seguridad final de la feature (incluido el riesgo residual de identidades Google creadas por desconocidos en Identity Platform sin acceso a datos, y el enlace cuenta↔`uid` frente al correo) y registro en `specs/003-user-roles-invitations/security-review-final.md`
- [ ] T057 [US1] (propietario) Validar en staging, ya desplegado por el pipeline, los escenarios 1–6 del [quickstart.md](./quickstart.md) y anotar el resultado en `specs/003-user-roles-invitations/validacion-staging.md`
- [ ] T058 [US1] Repasar el checklist *Definition of Done* de la constitución y marcar la feature como lista para release

---

## Dependencias y orden de ejecución

- **Fase 1** → **Fase 2** → **Fase 3** → **Fase 4**, cada una con su PR fusionada por el
  propietario antes de empezar la siguiente (cada fase sale de `origin/develop`).
- Dentro de cada fase: los tests (primero, en rojo) → dominio/repositorio → servicio → endpoints
  → integración y revisión de seguridad.
- **Historias**: US1 y US4 se entregan juntas en la Fase 1 (cerrar el acceso sin romper a los
  usuarios, con el frontend mínimo); US2 y US3 en la Fase 2 (API) y la Fase 3 (interfaz).
- **Despliegue**: no fusionar la PR de la Fase 1 hasta que T029 esté hecha, porque `develop` se
  despliega a staging al fusionar y el despliegue falla a propósito si falta la variable (T028).
  Ver también [quickstart.md](./quickstart.md).

### Oportunidades de paralelismo

- Fase 1: T001–T008 a la vez; T009, T010, T014, T017, T020, T021, T023 y T024 a la vez.
- Fase 2: T031–T034 a la vez; T037 y T040 en paralelo con el repositorio.
- Fase 3: T043–T046 a la vez; T047 en paralelo con las páginas.
- Fase 4: T053, T054 y T055 a la vez.

## Estrategia de implementación

1. **MVP = Fase 1 completa**: con ella ya no puede entrar nadie sin cuenta, el propietario es
   admin en cada entorno y se pueden sembrar invitaciones a mano si hiciera falta.
2. Fase 2 devuelve la capacidad de invitar por API; Fase 3 la pone en la interfaz.
3. Cada fase se valida en staging antes de promover (Principio IV).

## Notas

- Las tareas de revisión de seguridad son obligatorias por el Principio III y por el FR-019.
- Ningún agente fusiona PRs (Principio VII); las marcadas «(propietario)» son actos humanos.
- Commits en inglés, p. ej. `feat(access): add active-account enforcement`.
