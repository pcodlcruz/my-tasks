---

description: "Lista de tareas de implementación de la feature 008-task-card-indicators"
---

# Tasks: Indicadores compactos en la tarjeta de tarea

**Input**: documentos de diseño de `specs/008-task-card-indicators/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/task-card-ui.md](./contracts/task-card-ui.md),
[quickstart.md](./quickstart.md)

**Tests**: **obligatorios** (Principio II).
- Los unitarios (Vitest) se escriben primero y deben fallar.
- Hay un e2e (Playwright) de no solapamiento.
- El axe existente cubre el contraste en claro y oscuro.
- No hay backend, datos ni infraestructura, así que no hay pytest ni cambios en Terraform.

**Organization**:
- Cada `## Phase N` se entrega en su propia rama `feature/008-task-card-indicators-fase-N` y en su
  PR a `develop` (Principio VII).
- Las tres historias (US1 indicadores sin solapamiento, US2 significado de cada indicador y US3
  botón de estrella) tocan el mismo componente (`TaskCard.tsx`). Por eso van **en una sola fase de
  código** (Phase 2), en orden de prioridad y con su etiqueta, para no abrir PRs que choquen entre
  sí (plan, «Fases previstas»).

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US3); sin etiqueta, la tarea es de soporte o de cierre
- **(propietario)**: acto humano que el agente no puede ni debe hacer (aprobar el diseño, exportar
  de Stitch con su token, fusionar una PR, validar en staging y producción)

## Convenciones

- **Ámbito**: el código vive en `frontend/`, y los diseños en `docs/design/`. No se tocan
  `backend/`, `infra/` ni `.github/` (research R9).
- **Skills**: la implementación se hace con `mytasks-frontend-developer` y el diseño con el MCP de
  Stitch (`mcp__stitch__*`).
- **Idioma**: código, comentarios y commits en **inglés**; documentación y PRs en **español**;
  textos visibles y accesibles en español (Principio IX).
- **Contrato**: lo que muestra y anuncia la tarjeta está en
  [contracts/task-card-ui.md](./contracts/task-card-ui.md). Si gana la variante V2 en el diseño, se
  actualiza el contrato antes de la Phase 2.
- **Antes de empujar**:
  - la suite completa sin `.env`, que reproduce el CI:
    `env VITE_FIREBASE_API_KEY= VITE_FIREBASE_AUTH_DOMAIN= VITE_FIREBASE_PROJECT_ID= VITE_USE_EMULATORS= npm --prefix frontend test`
  - `npm --prefix frontend run build`, `npm --prefix frontend run lint` y
    `npm --prefix frontend run format`
  - la batería e2e completa con los emuladores **recién reiniciados**: con el emulador sucio,
    `revoke-access` falla.

---

## Phase 1: Diseño en Stitch (sin código)

**Purpose**: aprobar el nuevo aspecto de la tarjeta antes de escribir código (FR-009).

**Goal**: S3 v4 · Tablero (indicadores), aprobada por el propietario en claro y oscuro,
escritorio y móvil, y densidad normal y compacta, con la variante V1 o V2 elegida (research R6).

**Independent Test**: las pantallas de S3 v4 están en `docs/design/screens/s3-board-v4*/` y
marcadas como **aprobadas** en `docs/design/screens/README.md`.

- [X] T001 Comprobar el acceso al proyecto Stitch «MyTasks» (`projects/13869439670490335529`) con `mcp__stitch__get_project` y `mcp__stitch__list_screens`. Leer `docs/design/DESIGN.md` y `docs/design/screens/README.md`. Añadir a `docs/design/screens/README.md` una sección «Feature 008 · S3 v4 (indicadores)» con los identificadores base de S3 v3 en claro y oscuro (`81117eab…`, `14e9ca56…`) y de S3 v2 móvil (`27a7b42b…`)
- [X] T002 Generar **S3 v4 · Tablero, claro, escritorio, densidad normal** con `mcp__stitch__edit_screens` sobre S3 v3 claro escritorio, cambiando **solo la tarjeta** según [contracts/task-card-ui.md](./contracts/task-card-ui.md):
  - **Iconos antes del título**: 📌, calendario y ★ dorada.
  - **Botones**: las acciones saltan de línea y la de misión pasa a ☆/★.
  - **«Pendiente desde el lun 2»**: en el pie.
  - **Contenido de ejemplo**: una tarjeta con todos los estados y otra con un título de unos 90 caracteres.
  - **Variantes**: V1 (indicador ★ más botón de estrella) y V2 (solo el botón de estrella llena), con `mcp__stitch__generate_variants` si hace falta.
  - **Tooltip**: un estado con el tooltip «Misión del día» abierto.
- [X] T003 Generar desde T002 la **densidad compacta** en escritorio (la tarjeta en una fila, como S3 compacta) y la **versión móvil** a 320–390 px con la maquetación de S3 v2 móvil, en claro
- [X] T004 Generar las versiones **oscuras** de T002 y T003 con los tokens del tema oscuro de `docs/design/DESIGN.md`. Si alguna generación da *timeout*, no repetirla al momento: comprobar después con `mcp__stitch__list_screens`, porque las pantallas aparecen con retraso
- [X] T005 (propietario) Exportar el HTML y el PNG de las pantallas de T002–T004 con `docs/design/export-stitch.py` y su token (`STITCH_ACCESS_TOKEN=$(gcloud auth print-access-token)`, `STITCH_QUOTA_PROJECT=pdlco-mytasks`) a `docs/design/screens/s3-board-v4/`, `s3-board-v4-dark/` y `s3-board-v4-compact/`. Antes, el agente añade a la tabla de `docs/design/screens/README.md` cada pantalla, marcada como **pendiente de aprobación**
- [X] T006 (propietario) **Punto de control humano**: revisar S3 v4 en Stitch y en `docs/design/screens/`, aprobar o pedir cambios, **elegir V1 o V2** (research R6) y anotar el resultado de SC-003 (identificar programada y misión en menos de 5 s). Si pide cambios, se repite la tarea afectada (T002–T004)
- [X] T007 Registrar en `docs/design/screens/README.md` las aprobaciones (identificador de Stitch, fecha y pantalla vigente) y la variante elegida. Si es V2, actualizar [contracts/task-card-ui.md](./contracts/task-card-ui.md) (sin indicador ★ junto al título cuando la tarea está en la misión) y research R6. Incluir en el cuerpo de la PR de la fase la justificación del Principio VIII: no hay skill de diseño en `.claude/skills/`, así que el diseño se hace directamente con el MCP de Stitch, como en las features 004 y 007. Marcar T001–T007 en este fichero

**Checkpoint**: diseño aprobado y contrato cerrado; la Phase 2 puede empezar.

---

## Phase 2: Indicadores en la tarjeta (US1 🎯 MVP, US2 y US3)

**Purpose**: implementar el contrato de la tarjeta aprobado en la Phase 1.

**Depends on**: Phase 1 fusionada (diseño aprobado y variante elegida).

### User Story 1 · Indicadores sin solapamiento (P1) 🎯 MVP

**Goal**: «Programada» y «Misión del día» pasan a ser iconos junto al título, «Pendiente desde» pasa
al pie y nada se solapa en ningún ancho ni densidad.

**Independent Test**: una tarea fijada, programada, pendiente y de la misión, con un título largo, a
320, 768, 1024 y 1280 px, en densidad normal y compacta. Nada se solapa, no hay desplazamiento horizontal y
se ven los dos iconos (quickstart, escenarios 1–4).

#### Tests (escribir primero; deben fallar)

- [ ] T008 [P] [US1] Reescribir el bloque «tareas programadas» de `frontend/tests/unit/features/board/TaskCard.test.tsx` según el contrato:
  - **Indicador**: dentro del párrafo del título hay un elemento con el texto accesible «Programada» (en `sr-only`) y el SVG con `aria-hidden="true"`. Una tarea normal no lleva ni indicador ni hueco.
  - **«Pendiente desde el lun 2»**: está en el pie (el mismo contenedor que la etiqueta de ámbito y «Completar»), no en la cabecera.
  - **Sin `today`**: no hay «Pendiente desde».
  - **Orden de los indicadores**: el `textContent` del título empieza por «Programada» y sigue con «Misión del día» antes del título.
- [ ] T009 [US1] Reescribir en el mismo fichero `frontend/tests/unit/features/board/TaskCard.test.tsx` los casos de la **marca** de misión. Si la tarea está en la misión, el párrafo del título contiene «Misión del día» (en `sr-only`) y una `★` con `aria-hidden="true"`; si no, no. Con la variante V2 (si se eligió en T006), el caso cambia según `contracts/task-card-ui.md`. *Mismo fichero que T008: si se hacen a la vez, que sea en bloques `describe` distintos.*
- [ ] T010 [P] [US1] Añadir a `frontend/tests/e2e/a11y.spec.ts` el test «la tarjeta no solapa nada»:
  - **Datos**: crear una tarea con un título de unos 90 caracteres, fijarla, añadirla a la misión y hacer que sea una programada pendiente. Se crea la programación con una fecha única y se avanza el reloj simulado de `frontend/tests/e2e/fixtures/clock.ts`, igual que en `schedules.spec.ts`; no se usa `page.clock`.
  - **Combinaciones**: anchos 320, 768, 1024 y 1280 px (desde 768, matriz 2×2; 768 es el peor caso), en densidad normal y compacta (Perfil → Densidad).
  - **Comprobación**: las cajas (`boundingBox`) del título, cada indicador, cada botón, «Pendiente desde», la etiqueta de ámbito y «Completar» no se cortan entre sí, y `scrollWidth <= clientWidth`.
  - **SC-002**: la altura del párrafo del título es la misma que la de una segunda tarea con el mismo título y sin estados, en el mismo cuadrante y el mismo ancho.
  - Debe fallar con el código actual **en al menos uno** de los anchos; no se fija cuál de antemano.
  - **Tooltip abierto** (`scrollWidth`): lo añade T017, cuando exista el tooltip.

#### Implementation

- [ ] T011 [US1] Crear `frontend/src/features/board/CardIndicator.tsx`. Recibe `label: string`, el icono como `children` y una `className` opcional para el color:
  - pinta un `<span>` en línea con el icono (`aria-hidden="true"`) y `<span className="sr-only">{label}</span>`;
  - por ahora, sin tooltip: lo añade T016;
  - comentarios en inglés.
- [ ] T012 [US1] Modificar `frontend/src/features/board/TaskCard.tsx` (depende de T011):
  - **Indicadores**: mover «Programada» y «Misión del día» al párrafo del título como `CardIndicator`. El SVG de calendario actual va con `text-text-muted`; `★` con `text-gold`. Orden: 📌 → calendario → ★ → título.
  - **Quitar** los dos `<p>` de marcas de la cabecera.
  - **Cabecera**: deja de depender de `sm:`. El título es `min-w-0 flex-1 break-words`; las acciones, `flex flex-wrap`; el contenedor hace `flex-wrap`. Revisar las clases `compact:` para que, en compacto, siga en una fila cuando cabe (research R1).
  - **Pie**: «Pendiente desde el …» se mueve allí, entre `ScopeBadge` y «Completar», con `text-caption text-text-muted`, y el pie hace `flex-wrap` (research R5).
  - **Reglas** de `isScheduled`, `pendingFrom` e `inMission`: sin cambios (data-model).
- [ ] T013 [US1] Pasar en verde T008–T010. Comprobar que siguen en verde, sin tocarlos, `frontend/tests/e2e/schedules.spec.ts` y `frontend/tests/e2e/start-of-day.spec.ts` (sus `toContainText('Programada' | 'Misión del día' | 'Pendiente desde el lun 2')` leen el `textContent`, research R2)

**Checkpoint**: US1 funciona por sí sola. El botón de misión sigue siendo de texto y los iconos
todavía no tienen tooltip.

### User Story 2 · Entender qué significa cada indicador (P2)

**Goal**: el significado de cada icono aparece al pasar el puntero o al tocarlo, y el lector de
pantalla lo lee.

**Independent Test**: quickstart, escenarios 5, 6 y 8.

#### Tests (escribir primero; deben fallar)

- [ ] T014 [P] [US2] Crear `frontend/tests/unit/features/board/CardIndicator.test.tsx`:
  - **Base**: el texto accesible es el `label`, el icono es `aria-hidden` y el indicador no es enfocable (no tiene `tabIndex`).
  - **Tooltip**: aparece con `hover` y desaparece al salir. Al hacer clic o tocar se abre y se cierra. `Escape` lo cierra. Un clic fuera lo cierra.
  - **Accesibilidad**: el tooltip lleva `aria-hidden="true"`, así que el texto no se lee dos veces.
- [ ] T015 [US2] Ampliar el bloque `S3 v3 · Tarea de la misión` de `frontend/tests/e2e/a11y.spec.ts` con una tarea que también sea programada. Así, el axe en claro y oscuro (`expectNoViolations`) cubre los dos iconos y el tooltip abierto (`hover` sobre el indicador de misión antes de la segunda comprobación), y lo nombra «S3 v4 · Indicadores»

#### Implementation

- [ ] T016 [US2] Añadir el tooltip a `frontend/src/features/board/CardIndicator.tsx` (research R3):
  - **Estado y apertura**: estado local `open`, `onClick` que lo alterna y `onMouseEnter`/`onMouseLeave` (o `group-hover`).
  - **Cierre**: listeners de `keydown` (`Escape`) y `pointerdown` fuera, registrados **solo mientras está abierto**.
  - **Marcado**: el tooltip es un `<span aria-hidden="true">` posicionado sobre el icono, con los tokens de superficie y texto del tema (contraste ≥ 4,5:1, WCAG 1.4.13: no desaparece mientras el puntero está encima).
  - **Sin parada de tabulador**: ni `tabIndex` ni `role` interactivo.
  - **Sin salirse de la tarjeta**: anclado al borde izquierdo del icono, con `max-width` igual al ancho de la tarjeta y `whitespace-nowrap` (research R3), para no crear desplazamiento horizontal a 320 px.
- [ ] T017 [US2] Pasar en verde T014 y T015 y ampliar T010:
  - **Tooltip abierto**: a 320 px, con el tooltip de misión abierto (tocar el icono), sigue cumpliéndose `scrollWidth <= clientWidth`.
  - **Contraste**: la verificación principal es el axe de T015; los iconos deben tener ≥ 3:1 con la superficie de la tarjeta en claro y oscuro (WCAG 1.4.11). Si axe no mide el SVG o la `★`, comprobar a mano los valores de los tokens (`gold`, `text-muted` y `surface`, de `docs/design/DESIGN.md`) con `docs/design/check-contrast.py` y anotar el resultado en la PR. Si `text-gold` no llega en algún tema, usar el token que fije S3 v4.

**Checkpoint**: US1 y US2 funcionan; el botón de misión sigue siendo de texto.

### User Story 3 · Botón de estrella para la misión (P3)

**Goal**: «Añadir/Quitar de la misión» pasa a ser un botón ☆/★ que conserva sus nombres
accesibles, su `disabled` con el motivo y el aviso de error.

**Independent Test**: quickstart, escenario 7.

#### Tests (escribir primero; deben fallar)

- [ ] T018 [US3] Ampliar el bloque «misión del día» de `frontend/tests/unit/features/board/TaskCard.test.tsx`. Se mantienen los casos actuales por nombre (`getByRole('button', { name: 'Añadir a la misión' | 'Quitar de la misión' })`: envío, 5 tareas con `disabled` y descripción, error con aviso, sin progreso no hay botón). Se añade:
  - el botón no tiene texto visible: el nombre va en `sr-only` y el icono, `aria-hidden`;
  - muestra ☆ fuera de la misión y ★ dentro, y tiene `title` igual a su nombre;
  - **no** tiene `aria-pressed` (research R4).

#### Implementation

- [ ] T019 [US3] En `frontend/src/features/board/TaskCard.tsx`, convertir el botón de misión en botón de icono según el contrato:
  - **Icono**: `☆` con `text-text-muted` fuera de la misión y `★` con `text-gold` dentro, con `aria-hidden="true"`.
  - **Nombre**: `<span className="sr-only">` con «Añadir a la misión» o «Quitar de la misión», y `title` con el mismo texto.
  - **Tamaño**: área de al menos 24 × 24 px (`min-h-6 min-w-6` o el equivalente del diseño).
  - **Se conservan**: `disabled`, `aria-describedby` con el `sr-only` «La misión ya tiene 5 tareas.», `toggleMission` y `onError`.
  - **Variante elegida en T006**: con V1, el botón lleva un estilo de botón al pasar el puntero (fondo `hover:bg-surface-alt`) para no confundirse con el indicador. Con V2, quitar el `CardIndicator` de misión del título.
- [ ] T020 [US3] Pasar en verde T018. Comprobar que `frontend/tests/e2e/start-of-day.spec.ts` (`card(page, 'Misión C').getByRole('button', { name: 'Añadir a la misión' })`) y el test de T010 siguen en verde

**Checkpoint**: las tres historias funcionan; la tarjeta coincide con S3 v4.

### Cierre de la fase

- [ ] T021 Ejecutar en local los escenarios 1–8 de [quickstart.md](./quickstart.md), en claro y oscuro y en escritorio y móvil, y comparar con las capturas de S3 v4. Ajustar las clases si algo no coincide y corregir `quickstart.md` o el contrato si algo cambió durante la implementación
- [ ] T022 Ejecutar la batería completa:
  - unitarios sin `.env`, `build`, `lint`, `format`;
  - e2e con los emuladores recién reiniciados, con `XDG_CONFIG_HOME="$TMPDIR/xdg-config"` en el sandbox.
  - Si el e2e de reflujo móvil (`a11y › ninguna pantalla desborda en horizontal en móvil`) falla solo bajo carga, repetirlo aislado y decirlo en la PR.
  - Marcar T008–T022 en este fichero.

---

## Phase 3: Documentación y cierre

**Purpose**: dejar la feature documentada y verificada antes de la release.

**Depends on**: Phase 2 fusionada.

- [ ] T023 [P] Anotar en `specs/007-daily-progress-arcade/contracts/ui-screens.md` (o en el contrato de S3 que esté vigente) y en `docs/design/screens/README.md` que la tarjeta del tablero vigente es la de **S3 v4** (feature 008), y enlazar [contracts/task-card-ui.md](./contracts/task-card-ui.md)
- [ ] T024 [P] Si `README.md` describe las marcas de la tarjeta («Programada», «Misión del día»), actualizarlo para que hable de iconos y del botón de estrella. Si no las describe, no tocarlo y anotarlo en la PR
- [ ] T025 Repasar el checklist *Definition of Done* de la constitución para la feature completa y registrarlo en `specs/008-task-card-indicators/definition-of-done.md`. Deben constar: sin revisión de seguridad porque no se tocaron auth, autorización ni datos (Principio III, research R9); Stitch usado por su MCP sin operaciones en Google Cloud (V); y como pendientes, solo los puntos de la Phase 4. Marcar T023–T025 en este fichero

---

## Phase 4: Release y puesta en servicio (propietario + pipeline)

**Purpose**: llevar los indicadores nuevos de la tarjeta a producción por el pipeline (Principios IV y VI).

**Depends on**: Phases 1–3 fusionadas y el CI de `develop` en verde.

- [ ] T026 (propietario) Validar en `https://staging.inserttask.es` los escenarios 1, 3, 5 y 7 de [quickstart.md](./quickstart.md) con una cuenta real (el 4, «pendiente desde», necesita una programada de un día anterior) y comunicar el resultado al agente
- [ ] T027 Crear `release/<versión>` (propuesta: `1.6.0`, siguiendo el nombre de rama `release/1.5.0` de la 007; **el propietario confirma el número** antes de crearla) desde `origin/develop` sin commits propios y abrir la PR a `main` en español, con la lista de cambios y la validación de staging (T026). No fusionar
- [ ] T028 (propietario) Fusionar la PR de la release, aprobar el `deploy-production` del pipeline y avisar cuando termine. Si falla por «versión no validada», no relanzar y avisar al agente
- [ ] T029 (propietario) Repetir los escenarios 1, 5 y 7 en `https://inserttask.es` y comunicar el resultado
- [ ] T030 Registrar el resultado en `specs/008-task-card-indicators/validacion-produccion.md` (los valores que comunique el propietario, sin inventar detalle), cerrar los pendientes de `definition-of-done.md` y abrir la PR documental `feature/008-task-card-indicators-cierre` a `develop`. No fusionar
- [ ] T031 (propietario) Decidir el retro-merge de `main` a `develop` y, si procede, pedir al agente que abra la PR; el agente no la fusiona

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Stitch)**: sin dependencias; empieza ya. Bloquea la Phase 2 (FR-009).
- **Phase 2 (código)**: depende de la Phase 1 fusionada. Dentro de ella, US1 → US2 → US3.
- **Phase 3 (documentación)**: depende de la Phase 2 fusionada.
- **Phase 4 (release)**: depende de las Phases 1–3 fusionadas y del CI de `develop` en verde.

### User Story Dependencies

- **US1 (P1)**: depende solo del diseño aprobado. Crea `CardIndicator`.
- **US2 (P2)**: añade el tooltip a `CardIndicator` (T011 de US1). Se prueba sola con
  `CardIndicator.test.tsx`.
- **US3 (P3)**: solo cambia el botón de misión de `TaskCard.tsx`. Podría ir antes que US2, pero
  comparte fichero con US1 (T012), así que va después para no pisar cambios.

### Within Phase 2

- Los tests de cada historia (T008–T010, T014–T015, T018) se escriben antes que su implementación y
  deben fallar.
- T011 → T012 (el componente antes de usarlo); T016 después de T011.
- T021 y T022 al final de la fase.

### Parallel Opportunities

- Phase 1: T002 y T003 se pueden lanzar en lotes paralelos en Stitch (como en la 007); T004
  después de T002 y T003.
- Phase 2: T008 (unitarios de `TaskCard`), T010 (e2e) y T014 (unitarios de `CardIndicator`) tocan
  ficheros distintos y pueden escribirse a la vez. T009 y T018 van después de T008 (mismo fichero),
  y T015 después de T010 (mismo fichero), por eso no llevan `[P]`.
- Phase 3: T023 y T024 en paralelo.

---

## Parallel Example: Phase 2 (tests primero)

```bash
# Ficheros de test distintos, a la vez:
Task: "T008/T009 · TaskCard.test.tsx: indicadores en el título y «Pendiente desde» en el pie"
Task: "T010 · a11y.spec.ts: la tarjeta no solapa nada a 320/1280 px × normal/compacta"
Task: "T014 · CardIndicator.test.tsx: texto accesible y tooltip con puntero, toque y Escape"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: diseño aprobado en Stitch.
2. Phase 2, solo US1 (T008–T013): los iconos y el arreglo del solapamiento ya resuelven el problema
   que se reportó.
3. **Validar** con los escenarios 1–4 del quickstart.

### Incremental Delivery

- US2 (tooltip) y US3 (estrella) se añaden en la misma rama de la Phase 2, en commits separados
  (`feat(frontend): ...` por historia), y la PR de la fase sale con las tres.
- Si el propietario quisiera adelantar el arreglo, la PR podría abrirse tras el checkpoint de US1 y
  dejar US2 y US3 en una fase posterior. No es el plan por defecto.

---

## Notes

- Ningún cambio en el backend, los datos ni la infraestructura: no hay pytest nuevos ni revisión de
  `mytasks-security-auditor` (research R9).
- Los e2e existentes buscan textos que siguen en el `textContent` (en `sr-only`). Si alguno falla,
  la causa está en el marcado, no en el test.
- El hook `speckit.git.feature --phase N` puede dejar HEAD en la rama anterior con el índice de
  `develop`. `git switch <rama-fase>` lo arregla sin perder nada.
