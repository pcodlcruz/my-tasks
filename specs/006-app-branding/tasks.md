---

description: "Lista de tareas de implementación de la feature 006-app-branding"
---

# Tasks: Logo y nuevo nombre visible de la aplicación

**Input**: documentos de diseño de `specs/006-app-branding/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/branding-ui.md](./contracts/branding-ui.md),
[quickstart.md](./quickstart.md)

**Tests**: **obligatorios** (Principio II) en cada fase que toca la interfaz: los unitarios se escriben primero y deben fallar; hay un e2e
corto del flujo visible (inicio de sesión → tablero) y el e2e de accesibilidad existente cubre el contraste. No hay backend, datos ni
infraestructura, así que no hay pytest ni cambios en Terraform.

**Organization**: cada `## Phase N` se entrega en su propia rama `feature/006-app-branding-fase-N` y PR a `develop` (Principio VII). Las
historias son **US1** reconocer la aplicación en el inicio de sesión, **US2** logo y nombre en la pantalla principal, **US3** un único nombre
en toda la web y **US4** el logo en la pestaña y en el acceso denegado.

**Correspondencia con las historias**: las historias P1 (US1, US2) dependen de la imagen del logo, que entrega el propietario; US3 y los
textos de US1 y US2 no. Por eso la **Phase 1 va primero y sin logo** (nombre y mensaje), y el logo llega en la Phase 2. Así el cambio de
nombre puede entregarse mientras el propietario prepara la imagen (research, Riesgo).

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US4); sin etiqueta, la tarea es de soporte o de cierre
- **(propietario)**: acto humano que el agente no puede ni debe hacer (entregar la imagen, aprobar el aspecto, fusionar una PR, validar en
  staging y producción)

## Convenciones

- Todo el cambio vive en `frontend/`; no se toca `backend/`, `infra/` ni `.github/` (research R8).
- Implementación con `mytasks-frontend-developer`. Sin Stitch (research R9): la aprobación visual es con capturas reales.
- Código, comentarios y commits en **inglés**; documentación y PRs en **español**; los textos visibles, en español (Principio IX).
- El nombre solo se escribe en `frontend/src/lib/brand.ts` y en el `<title>` de `frontend/index.html`; ningún otro fichero lo repite como literal.
- Los textos y lugares exactos están en [contracts/branding-ui.md](./contracts/branding-ui.md).
- Antes de empujar: `env VITE_FIREBASE_API_KEY= VITE_FIREBASE_AUTH_DOMAIN= VITE_FIREBASE_PROJECT_ID= VITE_USE_EMULATORS= npm --prefix frontend test`
  (suite completa, reproduce el CI sin `.env`), `npm --prefix frontend run build` y `npm --prefix frontend run lint`.

---

## Phase 1: Nombre y mensaje nuevos (sin logo)

**Purpose**: que toda la web diga «InsertTasks» y que el inicio de sesión lleve el mensaje de propósito, sin esperar a la imagen.

**Goal**: «MyTasks» deja de verse en cualquier texto; el inicio de sesión muestra «InsertTasks» y «Inserta tus tareas y prioriza lo que importa».

**Independent Test**: recorrer inicio de sesión, tablero vacío, acceso denegado y la pestaña, y comprobar el nombre nuevo y que `grep` de
«MyTasks» en `frontend/src` y `frontend/index.html` no devuelve nada.

### Tests (escribir primero; deben fallar)

- [X] T001 [P] [US3] Crear `frontend/tests/unit/lib/brand.test.ts`: `APP_NAME` vale `InsertTasks`, `APP_TAGLINE` vale `Inserta tus tareas y prioriza lo que importa`, y el `<title>` de `frontend/index.html` (leído como fichero, como hace `tests/unit/public/theme-init.test.ts`) coincide con `APP_NAME`
- [X] T002 [P] [US1] Ampliar `frontend/tests/unit/features/auth/LoginPage.test.tsx`: el encabezado de nivel 1 es «InsertTasks», se ve el mensaje de propósito, no aparece «Organiza tus tareas con la matriz de Eisenhower» ni «MyTasks»
- [X] T003 [P] [US3] Ampliar `frontend/tests/unit/features/auth/AccessDeniedPage.test.tsx`: el texto empieza por «InsertTasks es una aplicación privada» y no contiene «MyTasks» (el encabezado «Necesitas una invitación» no cambia)
- [X] T004 [P] [US2] Ampliar `frontend/tests/unit/features/board/BoardPage.test.tsx`: con el tablero vacío el mensaje de bienvenida es «¡Bienvenido a InsertTasks!»
- [X] T005 [P] [US2] Ampliar `frontend/tests/unit/app/AppHeader.test.tsx`: la cabecera muestra el texto «InsertTasks» y no «MyTasks»

### Implementación

- [X] T006 [US3] Crear `frontend/src/lib/brand.ts` con `APP_NAME = 'InsertTasks'` y `APP_TAGLINE = 'Inserta tus tareas y prioriza lo que importa'`, exportadas como constantes tipadas (data-model.md)
- [X] T007 [P] [US3] Cambiar el `<title>` de `frontend/index.html` a `InsertTasks`
- [X] T008 [US1] Usar `APP_NAME` y `APP_TAGLINE` en `frontend/src/features/auth/LoginPage.tsx` (el encabezado y el subtítulo, que sustituye al texto de Eisenhower)
- [X] T009 [US2] Usar `APP_NAME` en el texto de la cabecera de `frontend/src/app/AppHeader.tsx`
- [X] T010 [US3] Usar `APP_NAME` en el texto de `frontend/src/features/auth/AccessDeniedPage.tsx` (contracts/branding-ui.md)
- [X] T011 [US2] Usar `APP_NAME` en el mensaje de bienvenida de `frontend/src/features/board/BoardPage.tsx`
- [X] T012 [US3] Comprobar que no queda «MyTasks» en lo visible: búsqueda en `frontend/src` y `frontend/index.html` sin resultados; `npm --prefix frontend test`, `build` y `lint` en verde

**Checkpoint**: la web dice «InsertTasks» en todas partes y el inicio de sesión lleva el mensaje; todavía sin logo. Entregable por sí solo.

---

## Phase 2: Logo en el inicio de sesión (US1)

**Purpose**: mostrar el logo del propietario sobre el nombre en el inicio de sesión. Decisión del 2026-10-28: la cabecera se queda con solo el texto «InsertTasks» (la insignia no se lee a ese tamaño) y no lleva logo.

**Goal**: el logo se ve en el inicio de sesión, en tema claro y oscuro, en móvil y escritorio, sin saltos de maquetación; la cabecera no lo lleva.

**Independent Test**: abrir el inicio de sesión (sin sesión) y comprobar el logo sobre el nombre; abrir el tablero (con sesión) y comprobar que la cabecera solo tiene el nombre; con la imagen bloqueada el nombre sigue ahí; el propietario aprueba las capturas (SC-005).

**Depende de**: Phase 1 fusionada y T013 (la imagen). Ambas cumplidas.

- [X] T013 (propietario) Entregar la imagen del logo al agente (en el repositorio o por conversación): a ser posible vectorial (SVG), válida sobre fondo claro y oscuro, y optimizada (~50 KB como tope, research R4). Si solo hay imagen de píxeles, con resolución suficiente para pantallas de alta densidad. *Cumplida: entregó un JPEG con el fondo de cuadros horneado; el agente extrajo un PNG transparente y el propietario lo aprobó el 2026-10-28.*
- [X] T014 [US1] Colocar la imagen (el PNG transparente de 384×413 px) en `frontend/src/assets/brand/logo.png` sin rediseñarla (FR-009); si pasa de ~50 KB, optimizarla sin cambiar el diseño. Comprobar con una captura que se distingue sobre el fondo claro y sobre el oscuro de `frontend/src/index.css` y medir el contraste de sus colores principales con el token `surface` de cada tema (valores de `docs/design/check-contrast.py`): al menos 3:1, salvo que el logo lleve su propio fondo (SC-003, research R5); si no llega, **parar y pedir la variante al propietario**

### Tests (escribir primero; deben fallar)

- [X] T015 [P] [US1] Crear `frontend/tests/unit/features/shared/BrandLogo.test.tsx`: renderiza una imagen decorativa (`alt=""`), con `width` y `height` fijos definidos, sin ser anunciada como imagen por un lector de pantalla (FR-006, FR-007)
- [X] T016 [P] [US1] Ampliar `frontend/tests/unit/features/auth/LoginPage.test.tsx`: el logo aparece sobre el nombre en el inicio de sesión y el nombre se anuncia una sola vez (un solo encabezado «InsertTasks»)
- [X] T017 [P] [US2] Ampliar `frontend/tests/unit/app/AppHeader.test.tsx`: la cabecera muestra el texto «InsertTasks» y **no** contiene ninguna imagen de logo (decisión del 2026-10-28)
- [X] T018 [P] [US1] Crear `frontend/tests/e2e/branding.spec.ts` (Playwright, con el emulador como los demás e2e): sin sesión, el inicio de sesión muestra el logo, «InsertTasks» y el mensaje, y el título de la pestaña es «InsertTasks»; con sesión, la cabecera del tablero muestra el nombre y no lleva logo; y en 360 px el botón «Iniciar sesión con Google» queda visible sin desplazarse (FR-008)

### Implementación

- [X] T019 [US1] Crear `frontend/src/features/shared/BrandLogo.tsx`: importa `frontend/src/assets/brand/logo.<ext>`, la pinta con tamaño fijo (`width`/`height` como atributos y como clases de Tailwind) y `alt=""`, con un único tamaño grande (~176 px de ancho; sin prop de tamaño porque no hay variante pequeña); el logo se muestra siempre con `<img>`, nunca como HTML (research R2, R3, R4, R8)
- [X] T020 [US1] Mostrar `BrandLogo` encima del nombre en `frontend/src/features/auth/LoginPage.tsx`, centrado, sin sacar el botón de Google de la vista en 360 px
- [X] T021 [US2] ~~Mostrar `BrandLogo` en `frontend/src/app/AppHeader.tsx`~~ No aplicable por decisión del propietario del 2026-10-28: la cabecera se queda con solo el texto. No se toca `AppHeader.tsx`
- [X] T022 [US1] No aplicable: el logo lleva su propio fondo y se distingue en ambos temas. Era: solo si T014 pidió variante para el tema oscuro: añadir las dos imágenes y alternarlas con `:root[data-theme='dark']` en `frontend/src/index.css` (research R5); si no, esta tarea se cierra como no aplicable
- [X] T023 [US1] Generar capturas locales con Playwright del inicio de sesión y del tablero (este solo para ver que la cabecera sigue sin logo), en tema claro y oscuro y en 360 px y escritorio, y guardarlas en el scratchpad de la sesión (no en el repositorio) para enseñárselas al propietario
- [X] T024 (propietario) Aprobado el 2026-10-28, sin ajustes. Aprobar las capturas de T023 o pedir ajustes de tamaño, posición, espaciado o variante (SC-005); bloquea la PR de la fase, como el punto de control de diseño de la feature 004
- [X] T025 [US1] No aplicable: sin ajustes. Aplicar los ajustes que pida el propietario en T024 y repetir T023 hasta que apruebe
- [X] T026 [US1] Hecho en local salvo `build` (el sandbox lo impide; lo ejecuta el CI). Ejecutar `npm --prefix frontend test`, `build`, `lint`, `npm --prefix frontend run test:e2e` (incluidos `branding.spec.ts` y `a11y.spec.ts`, sin fallos de contraste de texto en claro ni oscuro; el contraste del propio logo no lo comprueba axe, se midió en T014)

**Checkpoint**: el inicio de sesión muestra el logo sobre el nombre y la cabecera solo el nombre; aprobado por el propietario.

---

## Phase 3: Logo en el acceso denegado (US4)

**Purpose**: usar el logo en la pantalla de acceso denegado (decisión Q1 = B del propietario). Decisión del 2026-10-28: el icono de la pestaña **no** cambia, se mantiene `favicon.svg`.

**Goal**: el acceso denegado lleva el logo junto al nombre; la pestaña conserva su icono actual.

**Independent Test**: iniciar sesión con una cuenta sin invitación y comprobar el logo en el acceso denegado.

**Depende de**: Phase 2 fusionada (usa `BrandLogo`).

### Tests (escribir primero; deben fallar)

- [X] T027 [P] [US4] Ampliar `frontend/tests/unit/features/auth/AccessDeniedPage.test.tsx`: el logo aparece encima del encabezado y el nombre se anuncia una sola vez
- [X] T028 [P] [US4] ~~Crear `frontend/tests/unit/public/favicon.test.ts`~~ No aplicable (se mantiene el favicon). Era: el `<link rel="icon">` de `frontend/index.html` apunta a un fichero que existe en `frontend/public/`, con el `type` que corresponde a su formato (como `theme-init.test.ts` lee `public/`)
- [X] T029 [P] [US4] Ampliar `frontend/tests/e2e/access-denied.spec.ts`: la pantalla muestra el logo y «InsertTasks es una aplicación privada»

### Implementación

- [X] T030 [US4] Mostrar `BrandLogo` en `frontend/src/features/auth/AccessDeniedPage.tsx`, encima del encabezado
- [X] T031 [US4] ~~Sustituir el icono~~ No aplicable (se mantiene `favicon.svg`). Era: sustituir el icono: si el logo es **SVG**, reemplazar `frontend/public/favicon.svg` por el logo (mantiene el `<link>` y la regla de nginx); si es **PNG**, añadir `frontend/public/favicon.png`, cambiar el `<link rel="icon">` de `frontend/index.html` a `type="image/png"` y quitar el antiguo `favicon.svg` (research R6)
- [X] T032 [US4] No aplicable (no cambia el icono, no se toca nginx). Era: solo si el icono es PNG: añadir en `frontend/nginx/default.conf` una `location = /favicon.png` con `Cache-Control "public, max-age=86400"` y las cabeceras de seguridad, y su comprobación en `frontend/nginx/tests/test-runtime-config.sh` (sin ella caería en `no-store`); si el icono es SVG, esta tarea se cierra como no aplicable
- [X] T033 [US4] No aplicable (no cambia el icono). Era: comprobar con una captura de la pestaña a tamaño pequeño que el logo se reconoce; si no, **parar y pedir al propietario una versión simplificada** del icono (edge case de la spec)
- [X] T034 (propietario) No aplicable (no cambia el icono). Era: confirmar que el icono de la pestaña se reconoce a tamaño pequeño (o aportar la versión simplificada)
- [X] T035 [US4] Hecho en local salvo `build` (el sandbox lo impide; lo ejecuta el CI). Ejecutar `npm --prefix frontend test`, `build`, `lint`, `npm --prefix frontend run test:e2e` (nginx no cambia, así que no hace falta `test:entrypoint`)

**Checkpoint**: el acceso denegado lleva el logo; las cuatro historias están implementadas con el alcance decidido el 2026-10-28.

---

## Phase 4: Cierre del diseño y documentación

**Purpose**: dejar documentada la marca, repasar la Definition of Done y comprobar la guía de validación.

- [ ] T036 [P] Añadir a `docs/design/DESIGN.md` una sección breve «Logo y nombre» con el nombre, el mensaje, los tamaños (`sm` y `lg`), dónde se usa y la regla de no rediseñarlo (FR-009), para que los diseños futuros lo respeten
- [ ] T037 [P] Repasar el checklist *Definition of Done* de la constitución para la feature completa y registrarlo en `specs/006-app-branding/definition-of-done.md`, marcando como pendientes solo los puntos de la Phase 5
- [ ] T038 Ejecutar los escenarios de la sección A de `quickstart.md` (unitarios, tipos, lint, e2e, entrada de nginx si procede) y corregir lo que haya cambiado durante la implementación en `quickstart.md` y `contracts/branding-ui.md`

**Checkpoint**: la feature está lista para release con su documentación al día.

---

## Phase 5: Release y puesta en servicio (propietario + pipeline)

**Purpose**: llevar la feature a producción y validarla. Mayoría de tareas son del propietario; el agente ayuda con comprobaciones de solo lectura.

**Cómo se ejecuta esta fase** (no es una fase de código): **no se lanza con `/speckit-implement fase 5`** ni abre PR de fase. Es la secuencia
de release de GitFlow más pasos del propietario. La rama es `release/<versión>`, creada desde `origin/develop` **sin commits propios** (el
*ruleset* exige los 9 checks al crearla; un `hotfix/*` o una release con commit propio es rechazada con GH013). El registro va en una PR
documental propia, `feature/006-app-branding-cierre`, a `develop`.

**Goal**: «InsertTasks» y el logo en servicio en producción.

**Independent Test**: escenarios 1–10 de `quickstart.md` en staging y 1–5 en producción.

- [ ] T039 (propietario) Con las fases 1 a 4 fusionadas y el CI de `develop` en verde, validar en `https://staging.inserttask.es` los escenarios 1 a 10 de la sección C de `quickstart.md` (incluidos tema claro y oscuro, logo bloqueado, consola sin errores de CSP, lector de pantalla y **la aprobación del aspecto del logo en staging, SC-005**) y comunicar el resultado al agente
- [ ] T040 Crear `release/<versión>` desde `origin/develop` sin commits propios y abrir la PR a `main` en español, con la lista de cambios, la aprobación visual previa (T024) y la validación de staging con la aprobación del aspecto (T039, SC-005)
- [ ] T041 (propietario) Fusionar la PR de la release; aprobar el `deploy-production` del pipeline y avisar cuando termine; si falla por «versión no validada», no relanzar y avisar al agente
- [ ] T042 (propietario) Repetir los escenarios 1 a 5 de la sección D de `quickstart.md` en `https://inserttask.es` y comunicar el resultado
- [ ] T043 Registrar el resultado en `specs/006-app-branding/validacion-produccion.md` (valores comunicados por el propietario, sin inventar detalle), marcar T037 como cerrada en `definition-of-done.md` y abrir la PR documental `feature/006-app-branding-cierre` a `develop` (la fusiona el propietario)
- [ ] T044 (propietario) Decidir el retro-merge de `main` a `develop` y, si procede, pedir al agente que abra la PR; el agente no la fusiona

**Checkpoint**: feature en producción, validada y documentada.

---

## Dependencies & Execution Order

### Orden de las fases

- **Phase 1**: sin dependencias; no necesita el logo.
- **Phase 2**: necesita la Phase 1 fusionada y la imagen (T013). Incluye una aprobación del propietario (T024) que bloquea su PR.
- **Phase 3**: necesita la Phase 2 fusionada (reutiliza `BrandLogo`).
- **Phase 4**: necesita las fases 1 a 3.
- **Phase 5**: necesita las fases 1 a 4 fusionadas y el CI de `develop` en verde. No es una fase de código.

### Dentro de cada fase

- Los tests de la fase se escriben antes y deben fallar.
- Cada PR espera a que el CI esté en verde antes de pedir la fusión al propietario.
- T014 (¿sirve una sola imagen para los dos temas?) y T033 (¿se reconoce el icono pequeño?) pueden obligar a pedir una variante: se para y se avisa.

### Oportunidades de paralelismo

- Phase 1: T001–T005 en paralelo (ficheros de test distintos); T007 aparte de T006.
- Phase 2: T015–T018 en paralelo.
- Phase 3: T027–T029 en paralelo.
- Phase 4: T036 y T037 en paralelo.
- Mientras el propietario prepara la imagen (T013), la Phase 1 se puede implementar y fusionar.

### Historias y fases

| Historia | Fases | Qué la completa |
|---|---|---|
| US1 Reconocer la aplicación en el inicio de sesión | 1, 2 | T002, T008 (texto) y T014–T022 (logo) |
| US2 Logo y nombre en la pantalla principal | 1, 2 | T004, T005, T009, T011 (texto) y T017, T021 (logo) |
| US3 Un único nombre en toda la web | 1 | T001, T003, T006, T007, T010, T012 |
| US4 Logo en la pestaña y en el acceso denegado | 3 | T027–T034 |

---

## Implementation Strategy

### MVP primero

El MVP útil sin esperar a la imagen es la **Phase 1**: la web ya se llama «InsertTasks» y el inicio de sesión explica su propósito. Se
entrega y se valida en staging antes de que exista el logo.

### Entrega incremental

1. Phase 1 → fusionar → desplegar en staging (nombre y mensaje).
2. El propietario entrega la imagen (T013) → Phase 2 → aprobación de las capturas (T024) → fusionar.
3. Phase 3 (icono y acceso denegado) → fusionar.
4. Phase 4 (documentación) → release y validación (Phase 5).

---

## Notes

- Cada tarea es un cambio pequeño y localizado; ninguna toca más de un fichero de producción salvo T031/T032 (icono y nginx).
- Sin la imagen no se pueden cerrar T014–T026 ni T031; la Phase 1 sí.
- No hay revisión de `mytasks-security-auditor`: no cambia autenticación, autorización ni datos (Principio III). El logo se muestra con `<img>`, nunca como HTML.
