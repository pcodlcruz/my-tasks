---

description: "Lista de tareas de implementación de la feature 001-eisenhower-task-manager"
---

# Tasks: Gestión de tareas con matriz de Eisenhower

**Input**: documentos de diseño de `specs/001-eisenhower-task-manager/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml),
[contracts/ui-screens.md](./contracts/ui-screens.md), [quickstart.md](./quickstart.md)

**Tests**: **obligatorios** por el Principio II de la constitución (NON-NEGOTIABLE). Cada historia
incluye tests unitarios de dominio/servicio y componentes, un test de integración por endpoint
contra los emuladores de Firebase y un flujo e2e con Playwright. Los tests se escriben primero y
deben fallar antes de implementar.

**Organization**: las tareas se agrupan por historia de usuario para que cada una se pueda
implementar y probar como un incremento independiente.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1…US5)
- Cada descripción incluye la ruta exacta del fichero

## Convenciones

- Aplicación web: `backend/src/mytasks_api/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`
  (estructura de [plan.md § Project Structure](./plan.md#project-structure)).
- **Skills (Principio VIII)**: las tareas de `backend/` se hacen con `mytasks-backend-developer`,
  las de `frontend/` con `mytasks-frontend-developer` y la revisión final con
  `mytasks-security-auditor`. El diseño en Stitch no lo cubre ningún skill: se hace manualmente
  con el MCP de Stitch y se justifica en la PR.
- Identificadores, código y comentarios en inglés; textos de la interfaz en español.
- Autenticación: **solo "Iniciar sesión con Google"** vía Firebase Auth; el sistema no almacena
  contraseñas ([research.md § R1](./research.md#r1-mecanismo-de-autenticación-y-registro)).
- **Ninguna tarea opera sobre Google Cloud** (Principio V): todo corre contra los emuladores con
  el project id `demo-mytasks`.
- **Entrega por fases**: cada fase es una rama y una PR a `develop`
  (`feature/001-eisenhower-task-manager-fase-N`), que se implementa con
  `/speckit-implement fase N` y solo ejecuta las tareas de esa fase. Antes se fusiona la PR de
  diseño (`feature/001-eisenhower-task-manager`, con estos documentos). Cada PR de fase deja
  `develop` con todos los tests en verde.

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: inicializar los dos proyectos, los emuladores y la configuración de Firestore.

- [X] T001 Crear la estructura de directorios del plan (`backend/src/mytasks_api/{domain,schemas,repositories,services,routers}/`, `backend/tests/{unit,integration}/`, `frontend/`, `docs/design/screens/`) y ampliar `.gitignore` con `node_modules/`, `.venv/`, `dist/`, `playwright-report/`, `test-results/` y los datos/logs de los emuladores (`*-debug.log`, `.firebase/`)
- [X] T002 Inicializar el backend con `uv` en `backend/pyproject.toml` (Python ≥ 3.12; dependencias: `fastapi`, `pydantic>=2`, `pydantic-settings`, `google-cloud-firestore`, `firebase-admin`, `uvicorn[standard]`; dev: `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy`), con la configuración de `ruff`, `mypy --strict` y `pytest` (`asyncio_mode = "auto"`, marcadores `unit`/`integration`) en el mismo fichero, y generar `backend/uv.lock`
- [X] T003 [P] Inicializar el frontend con Vite + React 18 + TypeScript estricto en `frontend/package.json`, `frontend/tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess: true`) y `frontend/vite.config.ts` (configuración de Vitest con `jsdom` incluida); dependencias: `react-router-dom`, `@tanstack/react-query`, `zustand`, `firebase`; dev: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`; generar `frontend/package-lock.json`
- [X] T004 [P] Configurar ESLint (con `eslint-plugin-jsx-a11y` y `eslint-plugin-react-hooks`) y Prettier en `frontend/eslint.config.js` y `frontend/.prettierrc`, con los scripts `lint`, `format`, `test` y `test:e2e` en `frontend/package.json`
- [X] T005 [P] Instalar y configurar Tailwind CSS en `frontend/tailwind.config.ts`, `frontend/postcss.config.js` y `frontend/src/index.css` (los tokens del diseño se añaden en la Fase 2)
- [X] T006 [P] Configurar la Firebase Emulator Suite en `firebase.json` (Auth en 9099, Firestore en 8080, UI en 4000, rutas a `firestore.rules` y `firestore.indexes.json`) y fijar el project id `demo-mytasks` en `.firebaserc`
- [X] T007 [P] Escribir `firestore.rules` denegando todo acceso directo desde clientes (`allow read, write: if false;`) — [research.md § R2](./research.md#r2-modelo-de-almacenamiento-en-firestore-y-aislamiento-por-usuario)
- [X] T008 [P] Declarar en `firestore.indexes.json` los tres índices compuestos del grupo de colecciones `tasks` de [data-model.md § Vistas y consultas](./data-model.md#vistas-y-consultas)
- [X] T009 [P] Crear `backend/.env.example` con `GOOGLE_CLOUD_PROJECT=demo-mytasks`, `FIRESTORE_EMULATOR_HOST=localhost:8080`, `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` y `CORS_ORIGINS=http://localhost:5173` (sin secretos)
- [X] T010 [P] Crear `frontend/.env.example` con `VITE_API_BASE_URL=http://localhost:8000`, `VITE_FIREBASE_PROJECT_ID=demo-mytasks`, `VITE_FIREBASE_API_KEY=fake-api-key`, `VITE_FIREBASE_AUTH_DOMAIN=localhost` y `VITE_USE_EMULATORS=true`

---

## Phase 2: Diseño de interfaz en Stitch (bloquea solo el frontend)

**Purpose**: diseñar y aprobar las 5 pantallas de [contracts/ui-screens.md](./contracts/ui-screens.md)
antes de implementar el frontend ([research.md § R7](./research.md#r7-diseño-de-interfaz-con-stitch-petición-del-usuario)).
Avanza en paralelo con la Fase 3 y con las tareas de backend de las historias.

- [X] T011 Redactar el design system en `docs/design/DESIGN.md`: paleta con un color por cuadrante que cumpla contraste WCAG 2.1 AA (y siempre con etiqueta de texto, nunca solo color), tipografía, espaciado, radios, estados (foco, hover, deshabilitado, error) y el botón "Iniciar sesión con Google" según las guías de marca de Google
- [X] T012 Crear el proyecto Stitch "MyTasks" y su design system a partir de `docs/design/DESIGN.md` con el MCP de Stitch (`create_project`, `create_design_system_from_design_md`), y anotar el id del proyecto en `docs/design/screens/README.md`
- [X] T013 [P] Generar en Stitch la pantalla S1 Iniciar sesión (escritorio y móvil) con sus estados: inicial, cargando, error con "Reintentar" y aviso "Tu sesión ha caducado" — destino `docs/design/screens/s1-login/`
- [X] T014 [P] Generar en Stitch la pantalla S3 Tablero (escritorio 2×2 y móvil apilado con "Hacer ahora" primero) con cabecera y navegación, filtro de ámbito, tarjetas con fijada/insignia de ámbito, estados vacío por cuadrante, bienvenida, cargando (esqueleto) y error — destino `docs/design/screens/s3-board/`
- [X] T015 [P] Generar en Stitch la pantalla S4 Formulario de tarea (modal de crear y editar) con contadores, interruptores, ámbito sin preselección, vista previa del cuadrante y errores en línea — destino `docs/design/screens/s4-task-form/`
- [ ] T016 [P] Generar en Stitch la pantalla S5 Historial con acciones "Reabrir" y "Mover a la papelera", "Cargar más" y estado vacío — destino `docs/design/screens/s5-history/` — **diferida**: 14 intentos de `generate_screen_from_text` (9 escritorio, 5 móvil) dieron timeout del MCP de Stitch; el propietario decidió no bloquear el resto de la fase por esto (ver `docs/design/screens/README.md`). Se retoma como tarea aparte.
- [X] T017 [P] Generar en Stitch la pantalla S6 Papelera con "se eliminará en N días", "Restaurar", "Eliminar definitivamente" con diálogo de confirmación, aviso fijo de 30 días y estado vacío — destino `docs/design/screens/s6-trash/`
- [X] T018 **Punto de control humano**: pedir al propietario que revise las 5 pantallas en Stitch, aplicar los cambios que pida y registrar la aprobación (pantalla, id de Stitch y fecha) en `docs/design/screens/README.md`. **No se empieza ninguna tarea de frontend de las historias sin esta aprobación.** — hecho sobre S1, S3, S4 y S6 (4 de 5; S5 excluida a propósito, ver T016)
- [X] T019 Exportar el HTML y la captura PNG (escritorio y móvil) de cada pantalla aprobada a `docs/design/screens/<s1-login|s3-board|s4-task-form|s5-history|s6-trash>/` — s5-history pendiente de T016
- [X] T020 Trasladar los tokens del design system aprobado (colores de cuadrante, tipografía, espaciado) a `frontend/tailwind.config.ts`

**Checkpoint**: 4 de 5 pantallas aprobadas y exportadas (S1, S3, S4, S6); el frontend de esas historias puede empezar. S5 Historial (US5) queda pendiente como tarea aparte antes de implementar esa historia en frontend.

---

## Phase 3: Foundational (prerrequisitos bloqueantes)

**Purpose**: núcleo que necesitan todas las historias: configuración, verificación del ID token,
acceso a Firestore por usuario, manejo de errores y cliente de la API.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta completar esta fase.

### Tests de la base

- [X] T021 Crear `backend/tests/conftest.py`: aborta con un mensaje claro si los emuladores no responden o si el project id no empieza por `demo-`; cliente de Firestore contra el emulador; limpieza entre tests con `DELETE /emulator/v1/projects/demo-mytasks/databases/(default)/documents` y `DELETE /emulator/v1/projects/demo-mytasks/accounts`; fábrica `google_user(email)` que inicia sesión en el emulador de Auth con una cuenta de Google ficticia (`accounts:signInWithIdp`, `providerId=google.com`, `id_token` = JSON sin firmar con `sub`, `email` y `email_verified`) y devuelve `uid` e ID token; fábrica `seed_task(uid, **fields)` que escribe directamente en `users/{uid}/tasks`; `httpx.AsyncClient` sobre la app FastAPI
- [X] T022 [P] Test unitario del cálculo del cuadrante (las 4 combinaciones de `urgent`/`important` → `do_now`/`schedule`/`delegate`/`eliminate`) en `backend/tests/unit/domain/test_quadrant.py`
- [X] T023 [P] Test de integración de `GET /healthz` (200 `{"status":"ok"}` sin token) y de `GET /api/v1/tasks/{taskId}` (200 con la tarea propia sembrada, con `quadrant` calculado; 404 si no existe; 404 si `purge_at <= ahora`) en `backend/tests/integration/test_tasks_get.py`

### Implementación de la base

- [X] T024 Implementar `Settings` con `pydantic-settings` (project id, hosts de los emuladores, `CORS_ORIGINS`) en `backend/src/mytasks_api/config.py`
- [X] T025 [P] Implementar el dominio puro en `backend/src/mytasks_api/domain/task.py`: enums `Scope`, `Quadrant`, `Status`; función `quadrant_for(urgent, important)`; dataclass `Task` con todos los campos de [data-model.md](./data-model.md); constante `TRASH_RETENTION = timedelta(days=30)`; excepciones `TaskNotFoundError` e `InvalidTransitionError`
- [X] T026 [P] Implementar los esquemas Pydantic de respuesta `TaskOut` (con `quadrant` derivado) y `TaskPage`, y el esquema `ErrorOut` (`code`, `message`, `details`) según [openapi.yaml](./contracts/openapi.yaml) en `backend/src/mytasks_api/schemas/task.py`
- [X] T027 Implementar la dependencia de autenticación en `backend/src/mytasks_api/auth.py`: inicializa `firebase_admin` con el project id (usa el emulador si `FIREBASE_AUTH_EMULATOR_HOST` está definido), lee `Authorization: Bearer`, verifica con `auth.verify_id_token`, devuelve `CurrentUser(uid, email)` y responde 401 `unauthenticated` si falta o no es válido; el `uid` nunca se acepta del cliente
- [X] T028 Implementar `TaskRepository` en `backend/src/mytasks_api/repositories/task_repository.py`: cliente de Firestore, referencia a colección construida **solo** como `users/{uid}/tasks`, conversión documento ↔ `Task` (fechas en UTC) y `get(uid, task_id)` que devuelve `None` si no existe o si `purge_at <= ahora`
- [X] T029 Implementar `TaskService.get_task(uid, task_id)` (lanza `TaskNotFoundError`) en `backend/src/mytasks_api/services/task_service.py`
- [X] T030 Implementar el router con `GET /api/v1/tasks/{taskId}` (validación de `taskId` 1–128 caracteres) en `backend/src/mytasks_api/routers/tasks.py`
- [X] T031 Implementar la app FastAPI en `backend/src/mytasks_api/main.py`: CORS desde `Settings`, `GET /healthz`, registro del router y manejadores de error que devuelven `ErrorOut` con mensajes en español (401 `unauthenticated`, 404 `not_found`, 409 `invalid_transition`, 422 `validation_error` con `details`)
- [X] T032 [P] Definir los tipos del contrato (`Task`, `TaskCreate`, `TaskUpdate`, `TaskPage`, `Scope`, `Quadrant`, `Status`, `ApiError`) y las etiquetas en español de cuadrantes y ámbitos en `frontend/src/api/types.ts`
- [X] T033 [P] Inicializar Firebase (solo Auth) en `frontend/src/lib/firebase.ts` a partir de las variables `VITE_*`, con `connectAuthEmulator` cuando `VITE_USE_EMULATORS=true`
- [X] T034 Implementar `apiClient` en `frontend/src/lib/apiClient.ts`: `fetch` a `VITE_API_BASE_URL` con `Authorization: Bearer <getIdToken()>`, parseo de `ApiError` y, ante un 401, cierre de sesión y redirección a `/login?reason=expired`
- [X] T035 [P] Test unitario de `apiClient` (añade el token, convierte errores en `ApiError`, gestiona el 401) en `frontend/tests/unit/lib/apiClient.test.ts`
- [X] T036 Crear `frontend/src/main.tsx` y `frontend/src/app/App.tsx` con `QueryClientProvider` y el router (`/login`, `/`, `/historial`, `/papelera`) con componentes de marcador de posición
- [X] T037 Configurar Playwright en `frontend/playwright.config.ts` (`webServer` que arranca emuladores, backend y frontend) y el helper `frontend/tests/e2e/fixtures/auth.ts` que inicia sesión con una cuenta de Google ficticia del emulador (`signInWithCredential(GoogleAuthProvider.credential('{"sub":…,"email":…,"email_verified":true}'))`)

**Checkpoint**: base lista; `uv run pytest` y `npm test` pasan con los tests de esta fase.

---

## Phase 4: User Story 1 - Acceder con Google y ver solo mis tareas (Priority: P1) 🎯 MVP

**Goal**: una persona inicia sesión con su cuenta de Google (la primera vez se crea su cuenta),
entra a su tablero vacío y nunca puede ver ni modificar tareas de otra cuenta.

**Independent Test**: iniciar sesión con dos cuentas de Google ficticias distintas: cada una ve su
tablero vacío con los 4 cuadrantes; la cuenta B recibe `404` al pedir una tarea de A; sin token,
la API responde `401` y la interfaz redirige a `/login` (quickstart pasos 1–4).

### Tests de User Story 1 ⚠️

> Escribir primero y comprobar que fallan.

- [X] T038 [P] [US1] Test de integración de autenticación: sin cabecera, con token mal formado y con token caducado/no válido → 401 `unauthenticated` en `GET /api/v1/tasks/{taskId}`; con token válido del emulador → no es 401, en `backend/tests/integration/test_auth.py`
- [X] T039 [P] [US1] Test de integración de aislamiento: la cuenta B pide por id una tarea sembrada de A → 404 (idéntico a una tarea inexistente, sin revelar que existe); volver a iniciar sesión con la misma cuenta de Google devuelve el mismo `uid`, en `backend/tests/integration/test_isolation.py`
- [X] T040 [P] [US1] Test de componente de `LoginPage` (botón "Iniciar sesión con Google", estado cargando, ventana cerrada sin error, error genérico con "Reintentar", aviso "Tu sesión ha caducado" con `?reason=expired`) en `frontend/tests/unit/features/auth/LoginPage.test.tsx`
- [X] T041 [P] [US1] Test de componente de `ProtectedRoute` (sin sesión redirige a `/login` conservando la ruta de origen; con sesión muestra el contenido) en `frontend/tests/unit/app/ProtectedRoute.test.tsx`
- [X] T042 [P] [US1] Test e2e: primer acceso con Google → tablero vacío con los 4 cuadrantes; acceso directo a `/historial` sin sesión → `/login` y, tras entrar, vuelve a `/historial`; cerrar sesión → `/login`, en `frontend/tests/e2e/us1-access.spec.ts`

### Implementación de User Story 1

- [X] T043 [US1] Implementar el hook `useSession` (estado de `onAuthStateChanged`, `signInWithGoogle()` con `signInWithPopup` + `GoogleAuthProvider` con los *scopes* básicos, `signOut()`) en `frontend/src/features/auth/useSession.ts`
- [X] T044 [US1] Implementar la pantalla S1 `LoginPage` siguiendo `docs/design/screens/s1-login/` en `frontend/src/features/auth/LoginPage.tsx` (tras entrar, redirige a la ruta de origen o a `/`)
- [X] T045 [US1] Implementar `ProtectedRoute` y aplicarlo a `/`, `/historial` y `/papelera` en `frontend/src/app/ProtectedRoute.tsx` y `frontend/src/app/App.tsx`
- [X] T046 [US1] Implementar la cabecera común con navegación (Tablero / Historial / Papelera), nombre/foto o email del usuario de Google y "Cerrar sesión" en `frontend/src/app/AppHeader.tsx`
- [X] T047 [US1] Implementar el componente `Quadrant` (título con etiqueta de texto, contador y estado vacío explícito — FR-009) en `frontend/src/features/board/Quadrant.tsx` y la primera versión de `BoardPage` con los 4 cuadrantes vacíos en orden canónico (2×2 en escritorio, apilados con "Hacer ahora" primero en móvil) en `frontend/src/features/board/BoardPage.tsx`, según `docs/design/screens/s3-board/`

**Checkpoint**: US1 funciona y se prueba sola (MVP de acceso).

---

## Phase 5: User Story 2 - Capturar una tarea y verla clasificada (Priority: P2)

**Goal**: crear una tarea con título, descripción, urgencia, importancia y ámbito, y verla al
instante en el cuadrante que le corresponde.

**Independent Test**: crear una tarea por cada combinación de urgente/importante y comprobar que
aparece en "Hacer ahora" / "Planificar" / "Delegar" / "Eliminar"; guardar con descripción de solo
espacios o título de 201 caracteres se rechaza (quickstart pasos 5–6).

### Tests de User Story 2 ⚠️

- [X] T048 [P] [US2] Tests unitarios de validación de `TaskCreate` (recorte de espacios, vacío tras recortar, 200/2000 caracteres, `extra="forbid"`, `scope` obligatorio sin valor por defecto) en `backend/tests/unit/schemas/test_task_create.py`
- [X] T049 [P] [US2] Tests unitarios de `TaskService.create_task` y `list_board` con un repositorio falso (valores por defecto `pinned=false`, `status=active`, `in_trash=false`, `created_at` del servidor) en `backend/tests/unit/services/test_task_service_create.py`
- [X] T050 [P] [US2] Test de integración de `POST /api/v1/tasks` (201 con `quadrant` correcto para las 4 combinaciones; 422 por título/descripción vacíos o solo espacios, longitudes superadas, campos extra y `scope` ausente; 401 sin token) en `backend/tests/integration/test_tasks_create.py`
- [X] T051 [P] [US2] Test de integración de `GET /api/v1/tasks?view=board` (solo tareas activas fuera de la papelera del usuario autenticado, `next_cursor` null; 422 si falta `view`) en `backend/tests/integration/test_tasks_list_board.py`
- [X] T052 [P] [US2] Test de componente de `TaskForm` en modo crear (contadores, interruptores, ámbito sin preselección, vista previa "Irá a: …", errores en línea, no envía si no es válido) en `frontend/tests/unit/features/task-form/TaskForm.test.tsx`
- [X] T053 [P] [US2] Test e2e: crear una tarea por cada combinación y verla en su cuadrante sin recargar; intentar guardar con descripción "   " muestra el error, en `frontend/tests/e2e/us2-create.spec.ts`

### Implementación de User Story 2

- [X] T054 [US2] Añadir el esquema `TaskCreate` (recorte de espacios, longitudes, `extra="forbid"`) en `backend/src/mytasks_api/schemas/task.py`
- [X] T055 [US2] Añadir `create(uid, data)` y `list_board(uid, scope=None)` (`status == active` y `in_trash == false`) en `backend/src/mytasks_api/repositories/task_repository.py`
- [X] T056 [US2] Añadir `create_task` y `list_board` (orden por `created_at` ascendente) en `backend/src/mytasks_api/services/task_service.py`
- [X] T057 [US2] Añadir `POST /api/v1/tasks` (201) y `GET /api/v1/tasks?view=board` en `backend/src/mytasks_api/routers/tasks.py`
- [X] T058 [P] [US2] Implementar los hooks `useBoardTasks` y `useCreateTask` (invalida el tablero al crear) en `frontend/src/api/tasks.ts`
- [X] T059 [P] [US2] Implementar la validación del formulario compartida con el contrato (recorte, obligatorios, límites, ámbito obligatorio) en `frontend/src/features/task-form/taskFormSchema.ts`
- [X] T060 [US2] Implementar el modal S4 `TaskForm` en modo crear, accesible (foco atrapado, `Esc` cierra, errores asociados a sus campos), siguiendo `docs/design/screens/s4-task-form/` en `frontend/src/features/task-form/TaskForm.tsx`
- [X] T061 [US2] Implementar `TaskCard` (título, insignia de ámbito) en `frontend/src/features/board/TaskCard.tsx` y conectar `BoardPage` a `useBoardTasks` con el botón "Nueva tarea", repartiendo las tareas por `quadrant`, en `frontend/src/features/board/BoardPage.tsx`

**Checkpoint**: US1 y US2 funcionan; se pueden crear tareas y verlas clasificadas.

---

## Phase 6: User Story 3 - Ver el estado de todas mis tareas de un vistazo (Priority: P3)

**Goal**: tablero completo: estados vacíos y bienvenida, orden con fijadas primero, fijar/desfijar
y edición de tareas activas que las mueve de cuadrante sin recargar.

**Independent Test**: con tareas en varios cuadrantes, cada una aparece en el suyo; un cuadrante
vacío se muestra con su indicación; editar la urgencia mueve la tarea; fijar la más reciente la
pone primera y desfijarla la devuelve a su sitio (quickstart pasos 7–8).

### Tests de User Story 3 ⚠️

- [X] T062 [P] [US3] Tests unitarios de dominio: orden del tablero (fijadas primero y luego `created_at` ascendente — FR-008a) y regla "solo se edita/fija una tarea activa fuera de la papelera", en `backend/tests/unit/domain/test_board_order_and_edit.py`
- [X] T063 [P] [US3] Tests unitarios de `TaskUpdate` (actualización parcial, `minProperties: 1`, mismas reglas de longitud y recorte, `extra="forbid"`) en `backend/tests/unit/schemas/test_task_update.py`
- [X] T064 [P] [US3] Test de integración de `PATCH /api/v1/tasks/{taskId}` (edita campos y recalcula `quadrant`; `pinned` se conserva al cambiar de cuadrante; fijar/desfijar; 409 si está completada o en la papelera; 404 si es de otro usuario; 422 por cuerpo vacío o no válido) en `backend/tests/integration/test_tasks_update.py`
- [X] T065 [P] [US3] Ampliar el test de integración del tablero con el orden fijadas primero + `created_at` ascendente en `backend/tests/integration/test_tasks_list_board.py`
- [X] T066 [P] [US3] Test de componente de `BoardPage` (4 cuadrantes siempre visibles, estado vacío por cuadrante, bienvenida sin tareas, esqueleto de carga, error con "Reintentar") en `frontend/tests/unit/features/board/BoardPage.test.tsx`
- [X] T067 [P] [US3] Test e2e: editar una tarea de "Planificar" marcándola urgente la mueve a "Hacer ahora"; fijar y desfijar la tarea más reciente de un cuadrante, en `frontend/tests/e2e/us3-board.spec.ts`

### Implementación de User Story 3

- [X] T068 [US3] Añadir al dominio `sort_board(tasks)` y `ensure_editable(task)` (lanza `InvalidTransitionError`) en `backend/src/mytasks_api/domain/task.py`
- [X] T069 [US3] Añadir el esquema `TaskUpdate` en `backend/src/mytasks_api/schemas/task.py`
- [X] T070 [US3] Añadir `update(uid, task_id, fields)` en una transacción que relee el estado ([research.md § R6](./research.md#r6-concurrencia)) en `backend/src/mytasks_api/repositories/task_repository.py`
- [X] T071 [US3] Añadir `update_task` (con `ensure_editable` y `updated_at`) y aplicar `sort_board` en `list_board` en `backend/src/mytasks_api/services/task_service.py`
- [X] T072 [US3] Añadir `PATCH /api/v1/tasks/{taskId}` en `backend/src/mytasks_api/routers/tasks.py`
- [X] T073 [P] [US3] Implementar los hooks `useUpdateTask` y `useTogglePin` con actualización optimista del tablero en `frontend/src/api/tasks.ts`
- [X] T074 [US3] Añadir el modo editar a `TaskForm` (precarga los valores y usa `useUpdateTask`) en `frontend/src/features/task-form/TaskForm.tsx`
- [X] T075 [US3] Añadir a `TaskCard` el indicador de fijada y las acciones "Fijar/Desfijar" y "Editar" en `frontend/src/features/board/TaskCard.tsx`
- [X] T076 [US3] Completar `BoardPage` con bienvenida sin tareas, esqueleto de carga y error con "Reintentar" en `frontend/src/features/board/BoardPage.tsx`

**Checkpoint**: US1–US3 funcionan; el tablero da visibilidad completa.

---

## Phase 7: User Story 4 - Distinguir tareas laborales de personales (Priority: P4)

**Goal**: filtrar el tablero por "Todas / Laboral / Personal" con un clic; el ámbito es obligatorio
al crear y editable después, con reflejo inmediato en el filtro.

**Independent Test**: con tareas de ambos ámbitos, el filtro "Laboral" muestra solo las laborales,
"Personal" solo las personales y "Todas" todas; no se puede crear una tarea sin ámbito
(quickstart pasos 9–10).

### Tests de User Story 4 ⚠️

- [ ] T077 [P] [US4] Test de integración de `GET /api/v1/tasks?view=board&scope=work|personal` (devuelve solo ese ámbito; sin `scope` devuelve todas; 422 por un `scope` no válido) en `backend/tests/integration/test_tasks_list_board_scope.py`
- [ ] T078 [P] [US4] Test de componente de `ScopeFilter` y del store (tres opciones exclusivas, un clic, estado conservado al navegar) en `frontend/tests/unit/features/board/ScopeFilter.test.tsx`
- [ ] T079 [P] [US4] Test e2e: filtrar por "Laboral" y volver a "Todas"; cambiar el ámbito de una tarea la saca del filtro activo sin recargar; crear sin ámbito no deja guardar, en `frontend/tests/e2e/us4-scope.spec.ts`

### Implementación de User Story 4

- [ ] T080 [US4] Aplicar el filtro `scope ==` en la consulta de `list_board` en `backend/src/mytasks_api/repositories/task_repository.py` y aceptar el parámetro `scope` para `view=board` en `backend/src/mytasks_api/routers/tasks.py`
- [ ] T081 [P] [US4] Implementar el store de Zustand con el filtro de ámbito (`all | work | personal`) en `frontend/src/stores/uiStore.ts`
- [ ] T082 [US4] Implementar `ScopeFilter` (grupo de opciones accesible) en `frontend/src/features/board/ScopeFilter.tsx`, integrarlo en `BoardPage` y pasar el ámbito a `useBoardTasks` (clave de consulta por ámbito) en `frontend/src/features/board/BoardPage.tsx` y `frontend/src/api/tasks.ts`

**Checkpoint**: US1–US4 funcionan.

---

## Phase 8: User Story 5 - Completar tareas y consultar su historial (Priority: P5)

**Goal**: completar y reabrir tareas, consultar el historial, mover a la papelera, restaurar y
borrar definitivamente, con purgado a los 30 días.

**Independent Test**: completar una tarea la saca del tablero y la muestra en el historial;
reabrirla la devuelve; moverla a la papelera y restaurarla la devuelve a su vista original; borrarla
definitivamente la elimina de todas las vistas; una tarea con `purge_at` vencido no aparece
(quickstart pasos 11–15).

### Tests de User Story 5 ⚠️

- [ ] T083 [P] [US5] Tests unitarios de las transiciones de dominio (completar, reabrir, mover a papelera, restaurar, borrar definitivamente) con sus estados de origen válidos e inválidos, y cálculo de `purge_at = trashed_at + 30 días`, según la tabla de [data-model.md § Estados y transiciones](./data-model.md#estados-y-transiciones), en `backend/tests/unit/domain/test_transitions.py`
- [ ] T084 [P] [US5] Test de integración de `POST /api/v1/tasks/{taskId}/complete` (200 con `completed_at`; 409 si ya está completada o en la papelera; 404 de otro usuario) en `backend/tests/integration/test_tasks_complete.py`
- [ ] T085 [P] [US5] Test de integración de `POST /api/v1/tasks/{taskId}/reopen` (200 con `completed_at` null y el cuadrante original; 409 si está activa o en la papelera) en `backend/tests/integration/test_tasks_reopen.py`
- [ ] T086 [P] [US5] Test de integración de `POST /api/v1/tasks/{taskId}/trash` (200 con `trashed_at` y `purge_at`; conserva `status`; 409 si ya está en la papelera) en `backend/tests/integration/test_tasks_trash.py`
- [ ] T087 [P] [US5] Test de integración de `POST /api/v1/tasks/{taskId}/restore` (vuelve a activa o completada según su `status`; 409 si no está en la papelera; 404 si `purge_at <= ahora`) en `backend/tests/integration/test_tasks_restore.py`
- [ ] T088 [P] [US5] Test de integración de `DELETE /api/v1/tasks/{taskId}` (204 si está en la papelera y el documento desaparece; 409 si no está en la papelera; 404 de otro usuario) en `backend/tests/integration/test_tasks_delete.py`
- [ ] T089 [P] [US5] Test de integración de `GET /api/v1/tasks?view=history` (completadas fuera de la papelera por `completed_at` desc, paginación con `cursor`/`limit` y `next_cursor`, 422 por `limit` fuera de 1–100) en `backend/tests/integration/test_tasks_list_history.py`
- [ ] T090 [P] [US5] Test de integración de `GET /api/v1/tasks?view=trash` (solo en la papelera con `purge_at > ahora`, orden `trashed_at` desc, paginación; una tarea con `purge_at` en el pasado no se lista y cualquier operación sobre ella da 404 — FR-014b, SC-008) en `backend/tests/integration/test_tasks_list_trash.py`
- [ ] T091 [P] [US5] Tests de componente de `HistoryPage` y `TrashPage` (campos mostrados, sin acción de editar en historial, botones "Reabrir" y "Mover a la papelera" en cada fila del historial, botón "Restaurar" en cada fila de la papelera, "Cargar más", estados vacíos, "se eliminará en N días", confirmación de borrado definitivo) en `frontend/tests/unit/features/history/HistoryPage.test.tsx` y `frontend/tests/unit/features/trash/TrashPage.test.tsx`
- [ ] T092 [P] [US5] Test e2e: completar → historial; reabrir → tablero; mover a la papelera una activa y una completada y restaurarlas; "Deshacer" del aviso; borrar definitivamente con confirmación; cerrar sesión y volver a entrar conserva el estado (FR-015), en `frontend/tests/e2e/us5-lifecycle.spec.ts`

### Implementación de User Story 5

- [ ] T093 [US5] Añadir al dominio las transiciones puras `complete`, `reopen`, `move_to_trash`, `restore` y `ensure_purgeable` (lanzan `InvalidTransitionError`) en `backend/src/mytasks_api/domain/task.py`
- [ ] T094 [US5] Añadir al repositorio `apply_transition(uid, task_id, fn)` en transacción que relee el estado, `delete(uid, task_id)` transaccional, y `list_history`/`list_trash` paginados por cursor opaco (orden `completed_at` desc y `purge_at` desc; la papelera filtra `purge_at > ahora`) en `backend/src/mytasks_api/repositories/task_repository.py`
- [ ] T095 [US5] Añadir al servicio `complete_task`, `reopen_task`, `trash_task`, `restore_task`, `delete_task`, `list_history` y `list_trash` en `backend/src/mytasks_api/services/task_service.py`
- [ ] T096 [US5] Añadir `POST /complete`, `/reopen`, `/trash`, `/restore`, `DELETE /api/v1/tasks/{taskId}` y las vistas `history`/`trash` (con `cursor` y `limit`) a `GET /api/v1/tasks` en `backend/src/mytasks_api/routers/tasks.py`
- [ ] T097 [P] [US5] Implementar los hooks `useCompleteTask`, `useReopenTask`, `useTrashTask`, `useRestoreTask`, `useDeleteTask`, `useHistory` y `useTrash` (paginación con `useInfiniteQuery`; invalidan tablero, historial y papelera) en `frontend/src/api/tasks.ts`
- [ ] T098 [P] [US5] Implementar el sistema de avisos (*toast*) accesible (`aria-live`) con acción opcional ("Deshacer") en `frontend/src/app/Toaster.tsx`
- [ ] T099 [US5] Añadir a `TaskCard` las acciones "Completar" y "Mover a la papelera" (aviso con "Deshacer" que llama a restaurar) en `frontend/src/features/board/TaskCard.tsx`
- [ ] T100 [US5] Implementar la pantalla S5 `HistoryPage` según `docs/design/screens/s5-history/` en `frontend/src/features/history/HistoryPage.tsx`
- [ ] T101 [US5] Implementar la pantalla S6 `TrashPage` con diálogo de confirmación accesible según `docs/design/screens/s6-trash/` en `frontend/src/features/trash/TrashPage.tsx`
- [ ] T102 [US5] Gestionar el `409` en todas las mutaciones mostrando "La tarea cambió en otra ventana" y refrescando los datos en `frontend/src/lib/apiClient.ts` y `frontend/src/api/tasks.ts`

**Checkpoint**: las 5 historias funcionan y se prueban de forma independiente.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: calidad transversal, revisión de seguridad obligatoria y validación final.

- [ ] T103 [P] Pasar `ruff check`, `ruff format --check` y `mypy --strict` sin errores en `backend/`
- [ ] T104 [P] Pasar `npm run lint`, `tsc --noEmit` y Prettier sin errores en `frontend/`
- [ ] T105 [P] Revisión de accesibilidad WCAG 2.1 AA (navegación por teclado, foco visible, contraste, etiquetas, cuadrantes no distinguidos solo por color) con `@axe-core/playwright` en `frontend/tests/e2e/a11y.spec.ts`
- [ ] T106 [P] Comprobar el objetivo de rendimiento (p95 < 300 ms por endpoint con ~500 tareas activas sembradas en el emulador) con un test marcado `perf` en `backend/tests/integration/test_performance.py`
- [ ] T107 [P] Escribir el `README.md` de la raíz en español: qué es la aplicación, requisitos y arranque en local (enlazando [quickstart.md](./quickstart.md)) y cómo ejecutar los tests
- [ ] T108 Revisión de seguridad con `mytasks-security-auditor` (obligatoria: toca autenticación, autorización y modelo de datos — Principio III): verificación del ID token, aislamiento por `uid`, `firestore.rules`, validación de entradas, CORS, ausencia de secretos y *scopes* de Google; guardar el informe en `specs/001-eisenhower-task-manager/security-review.md`
- [ ] T109 Corregir los hallazgos de la revisión de seguridad y volver a pasar todos los tests
- [ ] T110 Ejecutar la validación manual completa de [quickstart.md](./quickstart.md) (pasos 1–16 y comprobación visual frente a `docs/design/screens/`) y anotar el resultado en `specs/001-eisenhower-task-manager/quickstart.md`

---

## Dependencies & Execution Order

### Dependencias entre fases

- **Setup (Fase 1)**: sin dependencias.
- **Diseño en Stitch (Fase 2)**: depende de T005 (Tailwind) solo para su última tarea; el resto
  puede empezar ya. **Bloquea el frontend** de todas las historias (punto de control humano).
- **Foundational (Fase 3)**: depende de Setup. **Bloquea todas las historias.**
- **Historias (Fases 4–8)**: dependen de Foundational; su parte de frontend depende además de la
  aprobación de la Fase 2.
- **Polish (Fase 9)**: depende de todas las historias.

### Dependencias entre historias

- **US1 (P1)**: solo depende de Foundational. Aporta la sesión, las rutas protegidas, la
  cabecera y el tablero vacío que usan las demás.
- **US2 (P2)**: depende de US1 en el frontend (sesión y `BoardPage`); su backend es independiente.
- **US3 (P3)**: depende de US2 (necesita tareas creadas, `TaskForm` y `TaskCard`).
- **US4 (P4)**: depende de US2 (el ámbito ya se pide al crear); es independiente de US3.
- **US5 (P5)**: depende de US2 (necesita tareas y `TaskCard`); es independiente de US3 y US4.

### Dentro de cada historia

- Tests primero, comprobando que fallan.
- Dominio → esquemas → repositorio → servicio → router en el backend.
- Hooks de la API → componentes → integración en páginas en el frontend.
- Varias tareas tocan el mismo fichero (`task_repository.py`, `task_service.py`,
  `routers/tasks.py`, `frontend/src/api/tasks.ts`, `TaskCard.tsx`, `BoardPage.tsx`): esas no
  llevan `[P]` entre sí y se hacen en el orden listado.

### Oportunidades de paralelismo

- Setup: todas las `[P]` a la vez tras la estructura y el `pyproject.toml`.
- Diseño: las 5 pantallas de Stitch en paralelo; toda la Fase 2 en paralelo con la Fase 3 y con
  el backend de las historias.
- Foundational: dominio, esquemas y el código base del frontend en paralelo.
- Tras US2: US3, US4 y US5 pueden avanzar en paralelo en el backend (ficheros compartidos
  aparte); en el frontend, US4 y US5 tocan ficheros distintos salvo `BoardPage`, `TaskCard` y
  `api/tasks.ts`.
- En cada historia, todos los tests `[P]` a la vez.

---

## Parallel Example: User Story 5

```bash
# Todos los tests de integración de US5 a la vez (un fichero por endpoint):
Task: "Test de integración de POST /complete en backend/tests/integration/test_tasks_complete.py"
Task: "Test de integración de POST /reopen en backend/tests/integration/test_tasks_reopen.py"
Task: "Test de integración de POST /trash en backend/tests/integration/test_tasks_trash.py"
Task: "Test de integración de POST /restore en backend/tests/integration/test_tasks_restore.py"
Task: "Test de integración de DELETE en backend/tests/integration/test_tasks_delete.py"
Task: "Test de integración de view=history en backend/tests/integration/test_tasks_list_history.py"
Task: "Test de integración de view=trash en backend/tests/integration/test_tasks_list_trash.py"

# Piezas de frontend independientes:
Task: "Hooks de transiciones e historial/papelera en frontend/src/api/tasks.ts"
Task: "Sistema de avisos en frontend/src/app/Toaster.tsx"
```

---

## Implementation Strategy

### MVP primero (solo US1)

0. PR de diseño fusionada en `develop`.
1. PR de la Fase 1 (Setup); después, PRs de la Fase 3 (Foundational) y de la Fase 2 (Stitch),
   que pueden abrirse a la vez.
2. Aprobación de las pantallas por el propietario (dentro de la PR de la Fase 2).
3. PR de la Fase 4 (US1): acceso con Google, aislamiento y tablero vacío.
4. **Parar y validar** con los pasos 1–4 de [quickstart.md](./quickstart.md).

### Entrega incremental (una PR por fase)

1. Setup + Foundational + Diseño → base lista.
2. US1 → validar → primer incremento (acceso).
3. US2 → validar → ya se capturan y clasifican tareas.
4. US3 → validar → tablero completo (valor central de la aplicación).
5. US4 → validar → filtro por ámbito.
6. US5 → validar → ciclo de vida completo.
7. Polish y revisión de seguridad.

Cada paso es una PR a `develop` que abre el hook `speckit.git.pr` al terminar la fase y que
fusiona el propietario antes de empezar la fase siguiente (salvo las fases paralelas).

Todo se valida en local contra los emuladores; esta feature no despliega nada
([research.md § R11](./research.md#r11-fuera-de-alcance-de-esta-feature-explícito)).

---

## Notes

- `[P]` = ficheros distintos y sin dependencias pendientes.
- La etiqueta `[USn]` enlaza cada tarea con su historia para trazabilidad.
- Commits en inglés con Conventional Commits, tras cada tarea o grupo lógico.
- Ninguna tarea ejecuta `gcloud`, `gsutil` ni `bq`, ni usa credenciales reales de Google Cloud.
