---

description: "Lista de tareas de implementación de la feature 007-daily-progress-arcade"
---

# Tasks: Progreso diario, tareas programadas y gamificación arcade

**Input**: documentos de diseño de `specs/007-daily-progress-arcade/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/progress.yaml](./contracts/progress.yaml),
[contracts/ui-screens.md](./contracts/ui-screens.md), [quickstart.md](./quickstart.md)

**Tests**: **obligatorios** por el Principio II (NON-NEGOTIABLE). Se escriben primero y deben fallar
antes de implementar:
- unitarios para el dominio, los servicios y la lógica de interfaz;
- integración por cada endpoint nuevo o modificado, contra los emuladores;
- e2e con Playwright por cada flujo principal.

**Organization**: las fases siguen el orden del plan (Fases 1 a 9). Cada `## Phase N` se entrega en
su propia rama `feature/007-daily-progress-arcade-fase-N` y en su PR a `develop` (Principio VII),
salvo la Fase 9, que hace el propietario. Cada tarea lleva la historia a la que sirve:

| Etiqueta | Historia |
|---|---|
| **US1** | Marcador del día y meta |
| **US2** | Inicio de jornada y misión |
| **US3** | Puntuación, rachas, niveles y logros |
| **US4** | Tareas programadas |
| **US5** | Historial de progreso |

**Cómo se reparte el trabajo y por qué este orden**:

- La **Fase 1 (diseño en Stitch)** no tiene código y necesita al propietario en un punto de
  control. Nadie empieza código de interfaz (Fases 3 a 7) hasta que esté aprobada (FR-035).
- La **Fase 2 (backend del progreso)** cambia `complete`, `reopen` y `trash`, que ahora también
  escriben el progreso, pero la respuesta de esas rutas no cambia. El tablero actual sigue
  funcionando igual, así que `develop` sigue desplegable. Puede ir en paralelo a la Fase 1.
- Cada fase de interfaz deja la aplicación **completa y usable**: ningún control aparece sin su
  endpoint, y los e2e existentes, que son un check obligatorio, siguen en verde.
- Las programaciones (Fase 6) tienen backend propio y van en su propia fase, con revisión de
  seguridad específica.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes).
- **[Story]**: historia a la que pertenece (US1…US5). Sin etiqueta, la tarea es de soporte o de
  cierre.
- **(propietario)**: acto humano que el agente no puede ni debe hacer, incluida toda fusión de PR.
  Un agente nunca ejecuta `merge`.

## Convenciones

- **Estructura**: `backend/`, `frontend/` y `docs/design/` (ver plan.md, *Source Code*).
- **Tests de backend**: `backend/tests/unit/…` e `integration/…`, contra los emuladores.
- **Tests de frontend**: unitarios en `frontend/tests/unit/…` y e2e en `frontend/tests/e2e/…`.
  Comandos: `npm --prefix frontend run test` y `npm --prefix frontend run test:e2e`.
- **Idioma**: código y comentarios en **inglés**; documentación, interfaz y PRs en **español**;
  commits en inglés con Conventional Commits (Principio IX).
- **Skills** (Principio VIII):
  - backend con `mytasks-backend-developer`;
  - frontend con `mytasks-frontend-developer`;
  - revisiones con `mytasks-security-auditor`;
  - el diseño en Stitch lo hace el agente a mano con el MCP de Stitch, porque ningún skill lo
    cubre (excepción justificada, research R14).
- **Sin Google Cloud**: esta feature **no** requiere ninguna operación del agente sobre Google
  Cloud, ni cambios de `infra/`, de IAM, de variables de despliegue o de
  `firestore.indexes.json`.
- **Valores de juego** (research R8): 100 por tarea, 500 de fase, 50 extra de misión y 300 de
  misión cumplida; 10 niveles; 12 logros.
- **Día de progreso**: de 04:00 a 03:59 en la zona horaria del perfil (`Day`, `YYYY-MM-DD`).
- Los identificadores `T###` se asignan en orden de ejecución.

---

## Phase 1: Diseño en Stitch (sin código)

**Purpose**: diseñar las pantallas nuevas y las versiones nuevas de las aprobadas, y conseguir la
aprobación del propietario antes de escribir código de interfaz. Las pantallas aprobadas **no se
modifican ni se borran**: cada cambio es una versión nueva (FR-036).

**Goal**: el propietario ha aprobado lo siguiente, y `docs/design/` lo refleja:
- S3 v3 (tablero con marcador, misión y programadas), con la celebración S3-c;
- S8 (inicio de jornada), S9 (progreso), S10 (programadas) y S11 (formulario de programación);
- S7 v2 (perfil con «Progreso y juego») y la cabecera nueva;
- todas en claro y oscuro y en escritorio y móvil, según
  [contracts/ui-screens.md](./contracts/ui-screens.md).

**Independent Test**:
- Abrir `docs/design/screens/README.md` y comprobar que cada pantalla vigente tiene su
  identificador de Stitch, su fecha de aprobación, y su HTML y captura versionados.
- `docs/design/check-contrast.py` no devuelve ningún par por debajo de AA con los tokens arcade
  nuevos.

> **Stitch es lento e irregular** (feature 004: de 6 s a 21 min por pantalla, con indexado tardío).
> Se genera por **orden de prioridad**: S3 v3 claro → S8 → S7 v2 → S3 v3 oscuro → S10 → S11 → S9 →
> S3-c → variantes móviles y oscuras restantes. Un timeout no implica que no se generara: antes de
> reintentar, se mira con `list_screens`. Si Stitch devuelve un lienzo `DESKTOP` para una variante
> móvil oscura, se acepta como **solo color**. Si una pantalla falla tras los reintentos, se avisa en
> el punto de control en lugar de bloquear la fase.

- [X] T001 Comprobar el acceso al proyecto Stitch «MyTasks» con `mcp__stitch__get_project` y `mcp__stitch__list_screens`, leer `docs/design/DESIGN.md` y `docs/design/screens/README.md`, y anotar en `docs/design/screens/README.md` una sección «Feature 007 · pantallas nuevas y versiones» con los identificadores de las bases vigentes (S3 v2, S3 compacta, S4 v2 y S7, en claro y oscuro y en escritorio y móvil) *Hecho: bases vigentes en `docs/design/screens/README.md` § Feature 007.*
- [X] T002 Añadir a `docs/design/DESIGN.md` una sección «Estética arcade»:
  - tipografía «Press Start 2P», solo para cifras y rótulos cortos;
  - tokens nuevos en claro y oscuro: barra de energía (segmento lleno, vacío y extra), oro de logros y racha en juego, con los mismos nombres semánticos que `frontend/tailwind.config.ts`;
  - patrón de celebración no modal y su versión con movimiento reducido;
  - regla de no comunicar estados solo por color.

  Después, ampliar `docs/design/check-contrast.py` con los pares nuevos y pegar su salida en `DESIGN.md`, con 0 pares por debajo de AA.
- [X] T003 Añadir los tokens arcade al *design system* de Stitch sin tocar los aprobados (como *asset* aparte si `update_design_system` cambiaría el modo de color, igual que T003 de la feature 004) y anotar el identificador en `docs/design/screens/README.md` *Hecho sin tocar los sistemas: los tokens arcade van en cada prompt (Stitch admite un solo modo de color por sistema y `update_design_system` recalcula `namedColors`); ver README § Design systems (T003).*
- [X] T004 Generar **S3 v3 · Tablero** claro en escritorio y móvil a partir de S3 v2, según `contracts/ui-screens.md`:
  - marcador «HOY 2/3» con barra de energía, racha con «en juego», y puntuación y nivel;
  - botón para reabrir el inicio de jornada;
  - marcas de misión y de programada, y «pendiente desde»;
  - en cada tarjeta activa, un botón para añadirla o quitarla de la misión, deshabilitado con 5 tareas en la misión (FR-004);
  - aviso de programación que no cupo;
  - cabecera con «Tablero · Progreso · Programadas · Historial · Papelera» que cabe a 320 px con «Accesos».

  Registrar los identificadores en `docs/design/screens/README.md`.
- [X] T005 Generar **S8 · Inicio de jornada («PULSA START»)** claro en escritorio y móvil: resultado del último día activo, racha, meta de hoy, «Hacer ahora», programadas de hoy, selector de misión (hasta 5), botón «Empezar», estado sin tareas y estado «PARTIDA NUEVA»
- [X] T006 Generar **S7 v2 · Perfil** claro en escritorio y móvil con la sección «Progreso y juego»: meta 1–20, días activos (7 casillas, al menos uno), zona horaria con «Detectada: … · Usar esta», interruptores del inicio de jornada y del modo arcade, y la nota de que «Restablecer» no cambia esta sección
- [X] T007 Generar las versiones **oscuras** de S3 v3, S8 y S7 v2 (escritorio y móvil) con los tokens de T002–T003
- [X] T008 Generar **S10 · Tareas programadas** y **S11 · Formulario de programación** en claro y oscuro y en escritorio y móvil:
  - S10: lista con repetición en lenguaje natural, estado y próxima aparición; acciones de editar, pausar o reanudar y eliminar, con la confirmación que aclara que las tareas generadas se quedan; estado vacío; aviso al llegar a 50;
  - S11: los campos de S4 v2 más «Repetición» (fecha única, diaria, días de la semana o día del mes) con «Próxima aparición: …» y errores en línea.
- [X] T009 Generar **S9 · Progreso** en claro y oscuro y en escritorio y móvil:
  - calendario de 12 semanas con leyenda (meta cumplida, no activo, futuro y hoy, distinguibles sin color);
  - detalle del día;
  - estadísticas;
  - sala de trofeos con 12 logros, conseguidos con su fecha y bloqueados con su condición;
  - estado vacío del primer día.
- [X] T010 Generar **S3-c · Celebración** sobre S3 v3 (claro y oscuro): «¡FASE SUPERADA! +500», «¡MISIÓN CUMPLIDA! +300», «¡SUBES DE NIVEL! Nivel 3 · Jugador», «Logro: Primera moneda» y «¡NUEVO RÉCORD!», más su versión estática para movimiento reducido. Añadir también la variante de S3 v3 **sin modo arcade** (sin puntuación ni nivel)
- [x] T011 *(2026-10-31: exportadas por el propietario con `docs/design/export-stitch.py` y su propio token; ver `docs/design/screens/README.md`)* Exportar el HTML y la captura PNG de cada pantalla generada (T004–T010) a `docs/design/screens/<id>/` (`desktop.html`, `desktop.png`, `mobile.html` y `mobile.png`, como las existentes) y marcarlas como **pendientes de aprobación** en la tabla de `docs/design/screens/README.md`
- [x] T012 (propietario) *(2026-10-31: las 24 aprobadas en una sola ronda; S3 v3 claro móvil usa la maquetación de S3 v2 móvil)* **Punto de control humano**: revisar en Stitch y en `docs/design/screens/` las pantallas de T004–T010 y la salida de `check-contrast.py`, y aprobar o pedir cambios. Si pide cambios, se repite el paso afectado. Si el propietario lo decide, se puede aprobar en dos rondas:
  - **ronda 1**, antes de la Fase 3: S3 v3, S7 v2 y la cabecera;
  - **ronda 2**, antes de cada fase que la use: S8 antes de la Fase 4, S3-c antes de la 5, S10 y S11 antes de la 6, y S9 antes de la 7.
- [x] T013 Registrar las aprobaciones en `docs/design/screens/README.md` (identificador de Stitch, fecha y **pantalla vigente** de cada una; las aprobadas anteriores siguen intactas) y marcar el avance de esta fase en este fichero

**Checkpoint**: diseños aprobados (o la ronda 1) y registrados. La Fase 2 no depende del diseño.

**Avance (2026-10-31)**:
- **Hecho (T001–T010)**: tokens arcade con 0 pares por debajo de AA, y las 24 pantallas
  generadas en Stitch, con sus identificadores en `docs/design/screens/README.md`.
- **Hecho (T011–T013)**: el propietario aprobó las 24 pantallas en una sola ronda; HTML y PNG
  exportados a `docs/design/screens/` con `docs/design/export-stitch.py`, ejecutado por el
  propietario con su token.
- **S3 v3 claro móvil** salió como lienzo de escritorio: la maquetación móvil vigente es la de
  S3 v2 móvil, por decisión del propietario.
- **Fase 1 terminada.**

---

## Phase 2: Backend del progreso (base de US1, US2 y US3)

**Purpose**: calcular y servir el progreso diario, la misión, los puntos, las rachas, los niveles,
los logros y los anuncios en el servidor, con la puesta al día perezosa (research R1, R2) y
transacciones de tres documentos (R4).

**Agente y revisión**: `mytasks-backend-developer`; revisión con `mytasks-security-auditor`.

**Goal**:
- Con los emuladores y una cuenta activa, `GET /api/v1/me/progress` devuelve el marcador de hoy.
- Completar, reabrir y mandar a la papelera actualizan el progreso según R5.
- `PUT /api/v1/me/progress/today/mission`, `POST /api/v1/me/progress/review` y
  `POST /api/v1/me/progress/ack` funcionan.
- `PATCH /api/v1/me/profile` acepta los ajustes nuevos.
- `TaskOut` y el resto de respuestas existentes no cambian.

**Independent Test**: con el reloj inyectado:
- completar 3 tareas da `completed_count = 3`, `goal_met = true`, `score = 800` y anuncios
  `phase_clear` y `achievement:first_coin`, `achievement:stage_clear`;
- reabrir una el mismo día deja 2/3, `score = 200` y sin bonus;
- pasar al día siguiente cierra el día y sube la racha a 1;
- con otra cuenta, todo devuelve solo sus datos, y una cuenta revocada recibe 403.

### Tests de la Fase 2 (escribirlos primero; deben fallar)

- [X] T014 [P] Tests unitarios del reloj en `backend/tests/unit/test_clock.py`:
  - `SystemClock` devuelve UTC con zona;
  - `get_clock` usa `X-Test-Now` solo si `APP_ENV=local`;
  - con otro `APP_ENV`, la cabecera se ignora y se registra un aviso;
  - un valor sin zona o mal formado devuelve 422 en `local`.
- [X] T015 [P] [US1] Tests unitarios del día de progreso en `backend/tests/unit/domain/test_progress_day_key.py`:
  - `day_key(now, tz)` con el corte a las 04:00 (03:59 → día anterior; 04:00 → nuevo día; 00:30 → día anterior);
  - zonas `Europe/Madrid`, `America/New_York` y `Pacific/Auckland`;
  - las noches de cambio de horario de marzo y octubre;
  - `is_active(day, weekdays)` con ISO 1 = lunes.
- [X] T016 [P] [US1] Tests unitarios de las reglas de completado en `backend/tests/unit/domain/test_progress_rules.py`, una prueba por fila de la tabla de research R5:
  - completar una tarea nunca puntuada: +1 y +100;
  - completar una ya puntuada otro día: +1 y 0;
  - reabrir hoy: −1, −100 solo si se puntuó hoy, y se retira el bonus de fase si se deja de cumplir;
  - reabrir otro día: sin cambio;
  - papelera de una completada: sin cambio.

  Además:
  - bonus de fase una vez al día y también en día no activo, sin tocar la racha (Clarification Q4);
  - subir la meta tras cumplirla no retira el bonus ya ganado;
  - completar y reabrir N veces da el mismo neto que una (SC-006).
- [X] T017 [P] [US2] Tests unitarios de la misión en `backend/tests/unit/domain/test_progress_mission_domain.py` (no `test_progress_mission.py`: chocaría con el de integración):
  - máximo 5 tareas, sin repetidas, solo activas;
  - +50 por tarea de misión completada hoy y +300 al cumplirla, una vez al día;
  - marcar o desmarcar no da ni quita puntos;
  - papelera de una tarea de la misión: sale de ella y la misión se reevalúa;
  - una misión vacía nunca se cumple;
  - reabrir una tarea de la misión retira su extra y el bonus si ya no se cumple.
- [X] T018 [P] [US3] Tests unitarios del cierre de días en `backend/tests/unit/domain/test_progress_close.py` (research R6):
  - en un día activo, cumplir la meta sube la racha y no cumplirla, o no tener actividad, la pone a 0;
  - un día no activo no cambia la racha;
  - la mejor racha y el récord se actualizan al cerrar;
  - los días sin documento se crean con la meta y los días activos vigentes;
  - con más de 84 días sin cerrar, solo se crean los últimos 84 y la racha queda a 0 si alguno saltado era activo;
  - cerrar dos veces no cambia nada (idempotencia);
  - un día cerrado nunca se modifica (FR-006).
- [X] T019 [P] [US3] Tests unitarios de niveles, logros y anuncios en `backend/tests/unit/domain/test_levels_achievements.py`:
  - tabla de 10 niveles con sus umbrales y nombres (research R8);
  - el nivel se deriva de la puntuación;
  - `level_up` se anuncia una sola vez aunque se pierda y se recupere el nivel (`max_level_announced`);
  - los 12 logros con su condición exacta, que no se retiran nunca;
  - el anuncio `new_record` siempre que el día supera el récord, una vez al día, y nunca si no hay ningún día anterior cerrado con actividad;
  - el **logro** `new_record` solo si además el día tiene ≥ 5 tareas;
  - anuncios acotados a 20 (se descartan los más antiguos);
  - retirar un bonus elimina su anuncio si sigue pendiente.
- [X] T020 [P] [US1] Tests unitarios de los ajustes nuevos del perfil en `backend/tests/unit/domain/test_profile_domain.py`:
  - valores por defecto (`daily_goal` 3, siete días, `timezone` `null`, `morning_review` y `arcade_mode` activos);
  - `daily_goal` 1–20;
  - `active_weekdays` 1–7, sin repetir y no vacía;
  - `timezone` dentro de `zoneinfo.available_timezones()`;
  - un valor guardado inválido se lee como el valor por defecto;
  - `RESETTABLE_FIELDS` no incluye ninguno de los nuevos.
- [X] T021 [P] Tests unitarios del servicio de progreso en `backend/tests/unit/services/test_progress_service.py`, con un repositorio falso:
  - la puesta al día cierra los días y no hace nada si ya está al día;
  - `show_review` = activado + día activo + no visto hoy;
  - `streak` = racha cerrada + 1 si hoy es activo y ya se cumplió la meta, y `streak_at_stake`;
  - `arcade: null` y `announcements` vacíos con el modo arcade desactivado, aunque se sigan calculando;
  - `last_day` = el último día activo cerrado.
- [X] T022 [US1] Tests de integración de `GET /api/v1/me/progress` en `backend/tests/integration/test_progress.py`, contra el emulador y con el reloj sobrescrito:
  - 401 sin token; 403 (`access_denied`) sin cuenta y con la cuenta revocada;
  - cuenta nueva: `today`, meta 3, 0 completadas, `show_review: true` y racha 0;
  - `Cache-Control: no-store`;
  - repetir la llamada no cambia nada;
  - tras cambiar de día, el día anterior queda `closed: true` en Firestore.
- [X] T023 [US1] Tests de integración de las transiciones con progreso en `backend/tests/integration/test_progress_transitions.py`:
  - `POST /tasks/{id}/complete`, `/reopen`, `/trash` y `/restore` aplican las reglas de R5 sobre los documentos `progress_days/{día}` y `progress/state`;
  - el cuerpo de respuesta sigue siendo el `TaskOut` actual;
  - completar y reabrir 10 veces da un neto de una;
  - dos `complete` concurrentes de la misma tarea solo cuentan una (`asyncio.gather`; la transacción reintenta);
  - una tarea completada antes del despliegue y reabierta no resta nada.
- [X] T024 [P] [US2] Tests de integración de la misión y del inicio de jornada en `backend/tests/integration/test_progress_mission.py`:
  - `PUT /me/progress/today/mission` con 0–5 tareas activas devuelve 200;
  - con 6 tareas, repetidas, completadas, en la papelera, inexistentes o de otra cuenta devuelve 422 `mission_invalid_task`, y no se guarda nada;
  - `POST /me/progress/review` deja `show_review: false` y es idempotente;
  - un día no activo devuelve `show_review: false`;
  - con `morning_review` desactivado, `show_review: false`.
- [X] T025 [P] [US3] Tests de integración de los anuncios en `backend/tests/integration/test_progress_announcements.py`:
  - `POST /me/progress/ack` elimina los ids indicados e ignora los desconocidos;
  - un cuerpo vacío o con más de 20 ids devuelve 422;
  - un anuncio confirmado no reaparece al recuperar el bonus el mismo día;
  - el cierre de un día con racha 3 genera `achievement:streak_3`.
- [X] T026 [P] [US1] Tests de integración de los ajustes en `backend/tests/integration/test_profile.py`:
  - `PATCH /me/profile` acepta `daily_goal`, `active_weekdays`, `timezone`, `morning_review` y `arcade_mode`;
  - devuelve 422 con una meta de 0 o 21, días vacíos o repetidos, una zona inventada o `null` en cualquiera salvo `timezone`;
  - un 422 no guarda nada;
  - `DELETE /me/profile` no los restablece;
  - cambiar la zona horaria recalcula `today` y no toca los días cerrados.
- [X] T027 [P] Tests de aislamiento en `backend/tests/integration/test_progress_isolation.py`:
  - dos cuentas no ven ni modifican el progreso, la misión ni los anuncios de la otra;
  - ningún parámetro del cliente (cuerpo, consulta o ruta) apunta a otro `uid`;
  - ningún endpoint acepta `score`, `streak`, `level` ni `achievements` (422 por campo extra);
  - una cuenta revocada conserva sus datos tras reactivarla.
- [X] T028 [P] Test de integración de la cabecera de reloj en `backend/tests/integration/test_test_clock_header.py`: con `APP_ENV=local`, `X-Test-Now` mueve `today`; con `APP_ENV=staging` (settings sobrescritos), no tiene ningún efecto y se registra el aviso
- [X] T029 [P] Tests de los eventos de registro en `backend/tests/unit/test_logging_config.py` y `backend/tests/integration/test_audit_logging.py`:
  - `progress_day_closed`, `progress_mission_set` y `progress_ack` llevan solo `uid`, `day` y recuentos;
  - nunca títulos ni descripciones de tareas.

### Implementación de la Fase 2

- [X] T030 Añadir `tzdata` a `backend/pyproject.toml` (versión mínima fijada) y regenerar `backend/uv.lock` con `uv lock`; comprobar que `zoneinfo.ZoneInfo("Europe/Madrid")` funciona sin datos del sistema (`PYTHONTZPATH=` vacío)
- [X] T031 Implementar `backend/src/mytasks_api/clock.py`, hasta que pasen T014 y T028:
  - protocolo `Clock` y `SystemClock`;
  - dependencia `get_clock(request, settings)`, que solo atiende `X-Test-Now` con `APP_ENV=local`.
- [X] T032 [US1] Ampliar `backend/src/mytasks_api/domain/profile.py` con `daily_goal`, `active_weekdays`, `timezone`, `morning_review` y `arcade_mode` (validación, valores por defecto, `profile_from_document` tolerante), y `backend/src/mytasks_api/schemas/profile.py` (`ProfileOut` y `ProfileUpdateIn` con `extra="forbid"`; `timezone` se valida contra `zoneinfo.available_timezones()`), hasta que pase T020
- [X] T033 [US1] Crear `backend/src/mytasks_api/domain/progress.py` con la base, hasta que pase T015:
  - `DEFAULT_TIMEZONE = "Europe/Madrid"` y `DAY_START_HOUR = 4`;
  - `day_key` e `is_active`;
  - las constantes de puntos de research R8;
  - los dataclasses `ProgressDay` y `PlayerState` de data-model §3 y §4, con `*_from_document`.
- [X] T034 [US1] Añadir a `backend/src/mytasks_api/domain/progress.py` las funciones puras `apply_complete`, `apply_reopen` y `apply_trash`, que reciben la tarea, el día y el marcador y devuelven los tres actualizados más los anuncios (research R5), hasta que pase T016
- [X] T035 [US2] Añadir a `backend/src/mytasks_api/domain/progress.py` `set_mission` y la evaluación de misión cumplida (research R10), hasta que pase T017
- [X] T036 [US3] Añadir a `backend/src/mytasks_api/domain/progress.py`, hasta que pasen T018 y T019:
  - `close_days(state, days, settings, today)` (research R6);
  - la tabla `LEVELS`, `level_for(score)` y el catálogo `ACHIEVEMENTS` con sus condiciones;
  - la gestión acotada de `announcements` (research R9).
- [X] T037 [US1] Añadir `completed_day` y `points_awarded_on` a `Task` en `backend/src/mytasks_api/domain/task.py` y a la lectura y escritura de `backend/src/mytasks_api/repositories/task_repository.py` (opcionales, `null` en las tareas existentes), sin exponerlos en `TaskOut`
- [X] T038 [US1] Crear `backend/src/mytasks_api/repositories/progress_repository.py`:
  - lectura del marcador y de un día;
  - transacción `run_task_transition(uid, task_id, transition, now, settings)`, que lee y escribe la tarea, el día de hoy y el marcador en una sola `@firestore.async_transactional` (research R4);
  - transacción de cierre de días;
  - escritura de la misión, de `review_seen` y de las confirmaciones.
- [X] T039 [US1] Hacer que `complete_task`, `reopen_task` y `trash_task` de `backend/src/mytasks_api/services/task_service.py` usen `run_task_transition` con el reloj y los ajustes del perfil. `restore_task` y `delete_task` no tocan el progreso, y la comprobación del límite de 500 no cambia. Hasta que pase T023
- [X] T040 [US1] Crear `backend/src/mytasks_api/services/progress_service.py` (con `get_progress_service`), hasta que pasen T021, T024 y T025:
  - puesta al día;
  - armado de `ProgressOut` (`streak`, `streak_at_stake`, `show_review`, `arcade`, `last_day`, `announcements`, `notices` vacío hasta la Fase 6);
  - misión, inicio de jornada y confirmaciones.
- [X] T041 [US1] Crear `backend/src/mytasks_api/schemas/progress.py` (`ProgressOut`, `MissionIn`, `AckIn`, `ProgressDayOut`, `AnnouncementOut` y `NoticeOut`, todos los de entrada con `extra="forbid"`), conforme a `contracts/progress.yaml`
- [X] T042 [US1] Crear `backend/src/mytasks_api/routers/progress.py` y registrarlo en `backend/src/mytasks_api/factory.py`, junto con el error 422 `mission_invalid_task`. Hasta que pasen T022, T024–T027:
  - rutas `GET /api/v1/me/progress` (con `Cache-Control: no-store`), `POST /review`, `PUT /today/mission` y `POST /ack`;
  - todas con `Depends(get_active_user)`, de modo que el `uid` sale solo del token.
- [X] T043 Añadir los eventos `progress_day_closed`, `progress_mission_set` y `progress_ack` a `backend/src/mytasks_api/logging_config.py` (lista cerrada de campos) y emitirlos desde el servicio, hasta que pase T029
- [X] T044 Ampliar `backend/tests/integration/test_performance.py` para que la medición del tablero incluya antes `GET /api/v1/me/progress`, y comprobar que el p95 sigue por debajo de 300 ms con `pytest -m perf`
- [X] T045 Verificar que `GET /openapi.json` coincide con las rutas de progreso de `contracts/progress.yaml` y con los campos nuevos de `ProfileOut`, ampliando `backend/tests/unit/test_export_openapi.py`; corregir el contrato o el código hasta que coincidan
- [X] T046 Ejecutar `ruff check`, `ruff format --check`, `mypy` y toda la suite de backend con los emuladores, y dejarlos en verde
- [X] T047 Revisión de seguridad de la Fase 2 con `mytasks-security-auditor` y registrar el informe en `specs/007-daily-progress-arcade/security-review-fase-2.md`. Corregir en esta misma PR lo que marque como medio o superior. Puntos a revisar:
  - autorización en cada endpoint y aislamiento por `uid`;
  - ningún valor de juego aceptado del cliente;
  - `X-Test-Now` solo en `local`;
  - el `GET` con efectos es idempotente;
  - límites (5, 20 y 84);
  - registros sin datos de tareas.
- [X] T048 Marcar T014–T047 como hechas en este fichero y anotar el avance de la fase

**Checkpoint**: la API de progreso funciona de extremo a extremo con los emuladores. El tablero, el
historial y la papelera se comportan como antes para quien no mira el progreso.

**Avance (2026-10-31)**: Fase 2 completa (T014–T048).
- **Tests**: 788 en verde, entre unitarios e integración contra los emuladores. `pytest -m perf`
  también: `GET /me/progress` p95 9 ms; `complete` 24 ms y `reopen` 28 ms.
- **Calidad**: `ruff check`, `ruff format` y `mypy` en verde.
- **Seguridad**: informe en [security-review-fase-2.md](./security-review-fase-2.md). Sin críticos
  ni altos; MED-001 corregido en la PR; LOW-001 a LOW-003 al backlog. LOW-002 avisa de que los e2e
  del navegador necesitarán `X-Test-Now` en el CORS solo en local.
- **Desviaciones**:
  - Los tests se escribieron justo después del código, no antes. Todos cubren lo pedido.
  - Al escribirlos apareció una incoherencia con research R9: un bonus ya anunciado, perdido y
    recuperado el mismo día no debe volver a celebrarse. Se resolvió con `phase_announced` y
    `mission_announced` en el día de progreso.
  - La misión admite también las tareas de la misión ya completadas hoy, para poder añadir otras
    sin quitarlas.

---

## Phase 3: Ver mi progreso de hoy frente a una meta diaria (US1) 🎯 MVP

**Purpose**: mostrar el marcador del día en el tablero y permitir elegir la meta, los días activos
y la zona horaria. Agente: `mytasks-frontend-developer`. Necesita las Fases 1 (ronda 1: S3 v3, S7
v2 y la cabecera) y 2 fusionadas.

**Goal**: el tablero muestra «HOY n/meta» con la barra de energía y la racha; se actualiza al
completar o reabrir sin recargar; y la sección «Progreso y juego» de «Perfil» cambia la meta, los
días activos y la zona horaria. La puntuación, el nivel y las celebraciones arcade llegan en la
Fase 5; en esta fase solo se muestra la celebración mínima de meta cumplida (US1.3).

**Independent Test**: escenarios 1, 2 (solo el progreso), 3, 4 y 19 de
[quickstart.md](./quickstart.md).

### Tests de la Fase 3 (escribirlos primero; deben fallar)

- [ ] T049 [P] [US1] Tests unitarios de los hooks en `frontend/tests/unit/api/progress.test.ts`:
  - `useProgress` (consulta `GET /me/progress`, `staleTime` 0, vuelve a pedirla al volver a la pestaña);
  - completar o reabrir una tarea invalida `progress` y `tasks`;
  - un error de red deja el último valor y marca el error.
- [ ] T050 [P] [US1] Tests unitarios del marcador en `frontend/tests/unit/features/progress/DayScoreboard.test.tsx` y `EnergyBar.test.tsx`:
  - 0/3, 2/3, 3/3 (fase superada) y 5/3 (segmentos extra);
  - racha y «en juego»;
  - texto accesible («2 de 3 tareas completadas hoy»);
  - aviso discreto si falla la carga (FR-034).
- [ ] T051 [P] [US1] Tests unitarios de la sección «Progreso y juego» en `frontend/tests/unit/features/profile/ProgressSettings.test.tsx`:
  - meta 1–20;
  - no se pueden desmarcar todos los días;
  - se detecta la zona horaria con `Intl` y se envía la primera vez que el perfil no tiene ninguna;
  - si la detectada es distinta de la guardada, «Usar esta» la cambia y nunca se cambia sola;
  - un error al guardar vuelve al valor anterior con un aviso.
- [ ] T052 [US1] Test e2e `frontend/tests/e2e/progress-day.spec.ts`, con los emuladores, `page.clock` y `X-Test-Now`:
  - cuenta nueva con «HOY 0/3»;
  - completar 3 tareas: 3/3 sin recargar y la celebración de meta cumplida;
  - reabrir una: 2/3;
  - pasar a las 04:01: «HOY 0/3»;
  - cambiar la meta a 5 en «Perfil»: «HOY 0/5».

### Implementación de la Fase 3

- [ ] T053 [P] [US1] Añadir la fuente «Press Start 2P» (`frontend/src/assets/fonts/press-start-2p.woff2` y su `OFL.txt`) y su `@font-face` con `font-display: swap` en `frontend/src/index.css`, junto con los tokens arcade de T002 como variables CSS en claro y oscuro, conectados en `frontend/tailwind.config.ts`
- [ ] T054 [US1] Añadir los tipos `ProgressOut`, `ProgressDayOut`, `AnnouncementOut` y `NoticeOut` a `frontend/src/api/types.ts` y crear `frontend/src/api/progress.ts` con `useProgress`, hasta que pase T049. En `frontend/src/api/tasks.ts`, invalidar `progress` tras completar, reabrir y mandar a la papelera
- [ ] T055 [US1] Crear `frontend/src/features/progress/EnergyBar.tsx` y `frontend/src/features/progress/DayScoreboard.tsx` según S3 v3, hasta que pase T050:
  - la cifra con la fuente pixel y el texto accesible con la normal;
  - región `aria-live="polite"` para «¡FASE SUPERADA!».
- [ ] T056 [US1] Integrar el marcador en `frontend/src/features/board/BoardPage.tsx`:
  - pedir `useProgress` **antes** que el tablero, de modo que la puesta al día ocurre primero;
  - si el progreso falla, el tablero se carga igual (FR-034).
- [ ] T057 [US1] Añadir los campos nuevos al perfil en `frontend/src/api/profile.ts` y crear `frontend/src/features/profile/ProgressSettings.tsx` (meta, días activos, zona horaria con detección; los interruptores del inicio de jornada y del modo arcade llegan en las Fases 4 y 5) en `frontend/src/features/profile/ProfilePage.tsx`, hasta que pase T051
- [ ] T058 [US1] Cambiar la cabecera de `frontend/src/app/AppHeader.tsx` según la cabecera aprobada en T012, aunque las pestañas «Progreso» y «Programadas» se añadan en las Fases 6 y 7: dejar la estructura preparada para que quepan a 320 px con «Accesos»
- [ ] T059 [US1] Ampliar `frontend/tests/e2e/a11y.spec.ts`: axe sin incumplimientos AA en el tablero con el marcador y en «Perfil» con «Progreso y juego», en claro y oscuro, y reflujo a 320 px con la cuenta de administrador
- [ ] T060 Ejecutar `npm --prefix frontend run lint`, `typecheck`, `test` y `test:e2e` (con los emuladores; e2e lanzado solo, sin tuberías) y dejarlos en verde, y marcar T049–T060 como hechas en este fichero

**Checkpoint**: US1 completa y desplegable; es el **MVP** de la feature.

---

## Phase 4: Revisión de inicio de jornada («PULSA START») y misión (US2)

**Purpose**: mostrar la pantalla de inicio de jornada una vez al día y permitir elegir la misión.
Agente: `mytasks-frontend-developer`. Necesita la Fase 3 fusionada y S8 aprobada.

**Goal**:
- La primera apertura de un día activo muestra S8, que no vuelve a salir ese día en ningún
  dispositivo.
- Se puede reabrir desde el marcador.
- Se puede elegir hasta 5 tareas de misión, que se distinguen en el tablero.
- Se puede desactivar en «Perfil».

**Independent Test**: escenarios 5 y 6 de [quickstart.md](./quickstart.md).

### Tests de la Fase 4 (escribirlos primero; deben fallar)

- [ ] T061 [P] [US2] Tests unitarios en `frontend/tests/unit/features/progress/StartOfDayDialog.test.tsx` y `MissionPicker.test.tsx`:
  - el diálogo se abre si `show_review` es `true`, con el foco atrapado; Escape y «Empezar» llaman a `markReviewSeen` y devuelven el foco;
  - estados «PARTIDA NUEVA» y sin tareas activas;
  - el selector impide más de 5 tareas y solo ofrece tareas activas;
  - un 422 del servidor muestra el error y conserva la selección.
- [ ] T062 [P] [US2] Tests unitarios de la misión en el tablero en `frontend/tests/unit/features/board/TaskCard.test.tsx`:
  - icono y texto «Misión del día», con un nombre accesible que no dependa del color;
  - el botón «Añadir a la misión» / «Quitar de la misión» llama a `useSetMission` con la lista actual más o menos la tarea;
  - el botón está deshabilitado, con su motivo, cuando la misión ya tiene 5 tareas;
  - un 422 muestra el error y deja la misión como estaba.
- [ ] T063 [US2] Test e2e `frontend/tests/e2e/start-of-day.spec.ts`:
  - primera apertura a las 04:01 con S8, y «Empezar» lleva al tablero;
  - al recargar no sale, y en un segundo contexto de navegador con la misma cuenta tampoco;
  - se reabre desde el marcador;
  - elegir 2 tareas de misión: se ven marcadas, y completarlas muestra 2/2;
  - añadir una tercera desde el tablero: la misión pasa a 2/3;
  - con el inicio de jornada desactivado, o en un día no activo, no sale.

### Implementación de la Fase 4

- [ ] T064 [US2] Añadir `useMarkReviewSeen` y `useSetMission` a `frontend/src/api/progress.ts`; ambos actualizan la caché de `progress` con la respuesta
- [ ] T065 [US2] Crear `frontend/src/features/progress/MissionPicker.tsx` y `frontend/src/features/progress/StartOfDayDialog.tsx` según S8, hasta que pase T061:
  - diálogo modal accesible con `useRestoreFocus`;
  - contenido: resultado de `last_day`, racha, meta, «Hacer ahora» y programadas de hoy (las programadas se muestran vacías hasta la Fase 6).
- [ ] T066 [US2] Abrir el diálogo desde `frontend/src/app/App.tsx` (o `BoardPage.tsx`) cuando `show_review` sea `true`, y añadir a `DayScoreboard.tsx` el botón que lo reabre y el recuento de la misión
- [ ] T067 [US2] Marcar las tareas de la misión y añadir el botón para añadirlas o quitarlas de la misión en `frontend/src/features/board/TaskCard.tsx` (con `useSetMission`), hasta que pase T062
- [ ] T068 [US2] Añadir el interruptor «Mostrar el inicio de jornada» a `frontend/src/features/profile/ProgressSettings.tsx`
- [ ] T069 [US2] Ampliar `frontend/tests/e2e/a11y.spec.ts` con el diálogo S8 abierto, en claro y oscuro
- [ ] T070 Ejecutar lint, typecheck, unitarios y e2e del frontend en verde, y marcar T061–T070 como hechas en este fichero

**Checkpoint**: US1 y US2 funcionan juntas y por separado.

---

## Phase 5: Puntuación, rachas, niveles y logros arcade (US3)

**Purpose**: mostrar la puntuación y el nivel, celebrar los anuncios una sola vez y permitir
desactivar el modo arcade. Agente: `mytasks-frontend-developer`. Necesita la Fase 3 fusionada y
S3-c aprobada. Es independiente de la Fase 4, pero ambas tocan `DayScoreboard.tsx`, así que se
fusionan una detrás de otra.

**Goal**:
- El marcador muestra la puntuación y el nivel.
- Cada anuncio («¡FASE SUPERADA!», «¡MISIÓN CUMPLIDA!», «¡SUBES DE NIVEL!», logro, «¡NUEVO
  RÉCORD!») se muestra una sola vez en un aviso no modal y se confirma.
- Con el movimiento reducido, sin animación.
- El modo arcade se puede desactivar en «Perfil».

**Independent Test**: escenarios 7, 8 y 9 de [quickstart.md](./quickstart.md).

### Tests de la Fase 5 (escribirlos primero; deben fallar)

- [ ] T071 [P] [US3] Tests unitarios en `frontend/tests/unit/features/progress/Celebrations.test.tsx`:
  - muestra en cola los anuncios de `progress.announcements`;
  - cada uno se cierra solo en unos 3 s o con el botón, y se confirma con `POST /ack` una sola vez;
  - con `prefers-reduced-motion: reduce`, sin la clase de animación;
  - nunca atrapa el foco;
  - los textos son los de la spec.
- [ ] T072 [P] [US3] Tests unitarios del marcador arcade en `frontend/tests/unit/features/progress/DayScoreboard.test.tsx`: puntuación, nivel con nombre y puntos para el siguiente; con `arcade: null`, sin puntuación ni nivel, pero con meta, progreso y racha
- [ ] T073 [US3] Test e2e `frontend/tests/e2e/arcade.spec.ts`:
  - completar la primera tarea: «Logro: Primera moneda» y +100;
  - completar la tercera: «¡FASE SUPERADA!»;
  - con dos contextos de navegador, cada anuncio se ve en uno solo;
  - desactivar el modo arcade: sin puntuación ni celebraciones;
  - reactivarlo: la puntuación incluye lo ganado entretanto;
  - con `reducedMotion: 'reduce'`, la celebración es estática.

### Implementación de la Fase 5

- [ ] T074 [US3] Añadir `useAcknowledge` a `frontend/src/api/progress.ts` (confirma anuncios y avisos)
- [ ] T075 [US3] Crear `frontend/src/features/progress/Celebrations.tsx` según S3-c (región `aria-live="polite"`, cola, cierre automático y confirmación) y montarlo en `frontend/src/app/App.tsx`, con la regla `@media (prefers-reduced-motion: reduce)` en `frontend/src/index.css`, hasta que pase T071
- [ ] T076 [US3] Añadir la puntuación, el nivel y la progresión al siguiente nivel a `frontend/src/features/progress/DayScoreboard.tsx`, ocultos con `arcade: null`, hasta que pase T072. Quitar la celebración mínima de la Fase 3, que ahora sustituye `Celebrations`
- [ ] T077 [US3] Añadir el interruptor «Modo arcade» a `frontend/src/features/profile/ProgressSettings.tsx`
- [ ] T078 [US3] Ampliar `frontend/tests/e2e/a11y.spec.ts` con una celebración visible y con el modo arcade desactivado, en claro y oscuro
- [ ] T079 Ejecutar lint, typecheck, unitarios y e2e del frontend en verde, y marcar T071–T079 como hechas en este fichero

**Checkpoint**: US1, US2 y US3 funcionan; la gamificación arcade está completa salvo el historial.

---

## Phase 6: Tareas programadas que aparecen solas en el tablero (US4)

**Purpose**: crear, editar, pausar y eliminar programaciones, y generar sus tareas sin duplicados
en la puesta al día (research R7).

**Agentes**: `mytasks-backend-developer` para el backend y `mytasks-frontend-developer` para la
interfaz; revisión con `mytasks-security-auditor`.

**Necesita**: las Fases 2 y 3 fusionadas, y S10 y S11 aprobadas.

**Goal**:
- `/programadas` lista, crea, edita, pausa, reanuda y elimina programaciones.
- El día que toca, la tarea está en el tablero con su marca la primera vez que se abre, sin
  duplicados, con «pendiente desde» si la anterior sigue activa.
- El límite de 500 tareas activas se respeta con aviso, y el de 50 programaciones con 409.

**Independent Test**: escenarios 11 a 17 de [quickstart.md](./quickstart.md).

### Tests del backend de la Fase 6 (escribirlos primero; deben fallar)

- [ ] T080 [P] [US4] Tests unitarios de las repeticiones en `backend/tests/unit/domain/test_recurrence.py`:
  - `next_occurrence(rule, after)` y `latest_due(rule, upto)` para `once`, `daily`, `weekly` (varios días, cruzando semana) y `monthly`;
  - el día 31 en meses de 30 días y en febrero, incluidos los bisiestos;
  - editar hoy incluye hoy si no se generó nada hoy;
  - reanudar calcula desde hoy;
  - `once` con fecha pasada se rechaza;
  - independiente de los días activos (Clarification Q3).
- [ ] T081 [P] [US4] Tests unitarios del servicio en `backend/tests/unit/services/test_schedule_service.py`, con un repositorio falso:
  - generación de una sola tarea con `scheduled_for` = la última ocurrencia vencida;
  - no se genera nada si la última tarea sigue activa;
  - se genera si la última está completada, en la papelera o purgada;
  - `once` pasa a `finished`;
  - con 500 tareas activas no se crea nada y se añade un aviso a `notices`;
  - pausada, `next_occurrence = null`.
- [ ] T082 [US4] Tests de integración del CRUD en `backend/tests/integration/test_schedules.py`:
  - 401 y 403 como en el resto de la API;
  - crear con cada tipo de repetición devuelve 201;
  - 422 con campos de texto inválidos (iguales a los de `TaskCreate`), repetición mal formada, días vacíos o repetidos, `month_day` 0 o 32, fecha pasada o campo extra;
  - la número 51 devuelve 409 `schedule_limit`;
  - `PATCH`, `pause` y `resume` (idempotentes) y `DELETE`;
  - 409 `schedule_finished` al editar o reanudar una terminada;
  - 404 si la programación es de otra cuenta o el id tiene una forma inválida.
- [ ] T083 [US4] Tests de integración de la generación en `backend/tests/integration/test_schedule_generation.py`, con el reloj sobrescrito:
  - `GET /me/progress` genera la tarea del día con `schedule_id` y `scheduled_for` en `TaskOut`;
  - semanal lunes y miércoles sin completar: sin duplicado el miércoles;
  - 4 días sin entrar con una diaria: una sola tarea;
  - dos `GET /me/progress` concurrentes: una sola tarea;
  - con 500 tareas activas, un aviso en `notices` que `POST /ack` elimina;
  - eliminar una programación deja la tarea generada;
  - una cuenta revocada no genera nada y, al reactivarla, se genera solo la ocurrencia más reciente;
  - completar una tarea generada desbloquea `achievement:scheduled_done`.
- [ ] T084 [P] [US4] Tests de aislamiento de las programaciones en `backend/tests/integration/test_progress_isolation.py`: ninguna cuenta lista, edita, pausa ni borra las de otra; la generación solo crea tareas en la cuenta propietaria

### Implementación del backend de la Fase 6

- [ ] T085 [US4] Crear `backend/src/mytasks_api/domain/recurrence.py` (tipos de repetición, `next_occurrence`, `latest_due` y la validación de fecha única ≥ hoy), hasta que pase T080
- [ ] T086 [US4] Añadir `schedule_id` y `scheduled_for` a `Task` en `backend/src/mytasks_api/domain/task.py`, a `task_repository.py` (incluida la creación de una tarea generada) y a `TaskOut` en `backend/src/mytasks_api/schemas/task.py`, siempre presentes (`null` en las normales) y no editables
- [ ] T087 [US4] Crear `backend/src/mytasks_api/schemas/schedule.py` (`ScheduleIn`, `ScheduleUpdateIn` y `ScheduleOut`, con `Recurrence` discriminado por `kind`; `extra="forbid"`; el texto con las reglas de `TaskCreate`), conforme a `contracts/progress.yaml`
- [ ] T088 [US4] Crear `backend/src/mytasks_api/repositories/schedule_repository.py`:
  - CRUD bajo `users/{uid}/schedules`;
  - recuento para el límite de 50;
  - consulta `next_occurrence <= hoy`;
  - transacción de generación por programación (research R7).
- [ ] T089 [US4] Crear `backend/src/mytasks_api/services/schedule_service.py` (con `get_schedule_service`) y llamar a `generate_due` desde la puesta al día de `progress_service.py`, guardando los avisos en `progress/state.notices` y devolviéndolos en `ProgressOut`, hasta que pasen T081 y T083
- [ ] T090 [US4] Crear `backend/src/mytasks_api/routers/schedules.py` (`GET`/`POST /api/v1/schedules`, `PATCH`/`DELETE /{id}`, `POST /{id}/pause` y `/{id}/resume`, con `Depends(get_active_user)` y validación del id como en `routers/tasks.py`) y registrarlo en `backend/src/mytasks_api/factory.py` con los errores 409 `schedule_limit` y `schedule_finished`, hasta que pasen T082 y T084
- [ ] T091 [US4] Añadir los eventos `schedule_created`, `schedule_updated`, `schedule_deleted`, `schedule_generated` y `schedule_skipped_limit` a `backend/src/mytasks_api/logging_config.py` (solo `uid`, `schedule_id` y `day`) y ampliar `backend/tests/unit/test_logging_config.py`
- [ ] T092 [US4] Ampliar `backend/tests/unit/test_export_openapi.py` con las rutas de `/schedules` y los campos nuevos de `TaskOut`, y repetir `ruff`, `mypy`, la suite de backend y `pytest -m perf` en verde

### Tests del frontend de la Fase 6 (escribirlos primero; deben fallar)

- [ ] T093 [P] [US4] Tests unitarios de las etiquetas en `frontend/tests/unit/features/schedules/recurrenceLabel.test.ts`: «Una vez · 5 nov», «Cada día», «Lunes y miércoles», «Día 31 de cada mes (o el último)», y fechas en español
- [ ] T094 [P] [US4] Tests unitarios en `frontend/tests/unit/features/schedules/ScheduleForm.test.tsx` y `SchedulesPage.test.tsx`:
  - los campos y errores de S4 reutilizados;
  - el selector de repetición con la vista previa de la próxima aparición;
  - una fecha pasada se rechaza en el cliente y en el servidor;
  - pausar, reanudar y eliminar con confirmación;
  - el estado vacío;
  - el aviso al llegar a 50 y el 409.
- [ ] T095 [P] [US4] Tests unitarios de las marcas en `frontend/tests/unit/features/board/TaskCard.test.tsx` y del aviso en `DayScoreboard.test.tsx`: la marca «Programada»; «Pendiente desde el lun 3» si `scheduled_for` es anterior a hoy; el aviso de programación que no cupo, con su botón para cerrarlo (confirmación)
- [ ] T096 [US4] Test e2e `frontend/tests/e2e/schedules.spec.ts`:
  - crear una semanal (lunes y miércoles) y una de fecha única para mañana;
  - avanzar al lunes 04:01: la tarea está en su cuadrante con la marca, y en S8 entre las programadas de hoy;
  - el miércoles, sin completarla, «pendiente desde el lunes» y sin duplicado;
  - pausar y eliminar desde `/programadas`.

### Implementación del frontend de la Fase 6

- [ ] T097 [US4] Añadir los tipos de programación y los campos nuevos de `TaskOut` a `frontend/src/api/types.ts` y crear `frontend/src/api/schedules.ts` (`useSchedules`, `useCreateSchedule`, `useUpdateSchedule`, `usePauseSchedule`, `useResumeSchedule` y `useDeleteSchedule`; cada mutación invalida `schedules` y `progress`)
- [ ] T098 [US4] Crear `frontend/src/features/schedules/recurrenceLabel.ts`, `ScheduleForm.tsx` (reutilizando los campos de `frontend/src/features/task-form/TaskForm.tsx` y `taskFormSchema.ts`) y `SchedulesPage.tsx` según S10 y S11, hasta que pasen T093 y T094
- [ ] T099 [US4] Añadir la ruta `/programadas` en `frontend/src/app/App.tsx` y la pestaña «Programadas» en `frontend/src/app/AppHeader.tsx`, que tiene que caber a 320 px con «Accesos»
- [ ] T100 [US4] Mostrar la marca de programada y «pendiente desde» en `frontend/src/features/board/TaskCard.tsx` (y en `frontend/src/features/shared/TaskBadges.tsx` si aplica), el aviso de `notices` en `DayScoreboard.tsx`, y las programadas de hoy en `StartOfDayDialog.tsx`, hasta que pase T095
- [ ] T101 [US4] Ampliar `frontend/tests/e2e/a11y.spec.ts` con `/programadas` y el formulario, en claro y oscuro, y el reflujo de la cabecera a 320 px
- [ ] T102 Ejecutar lint, typecheck, unitarios y e2e del frontend en verde
- [ ] T103 Revisión de seguridad de la Fase 6 con `mytasks-security-auditor` y registrar el informe en `specs/007-daily-progress-arcade/security-review-fase-6.md`. Corregir en esta misma PR lo que marque como medio o superior. Puntos a revisar:
  - validación cerrada de las repeticiones;
  - límites de 50 y 500;
  - generación solo en la cuenta propietaria y no para cuentas revocadas;
  - ausencia de duplicados con concurrencia;
  - registros sin títulos.
- [ ] T104 Marcar T080–T103 como hechas en este fichero y anotar el avance de la fase

**Checkpoint**: las cuatro primeras historias funcionan; las programaciones no necesitan
infraestructura.

---

## Phase 7: Historial de progreso por días (US5)

**Purpose**: consultar el calendario de 12 semanas, el detalle de cada día, las estadísticas y la
sala de trofeos.

**Agentes**: `mytasks-backend-developer` para los tres endpoints de lectura y
`mytasks-frontend-developer` para `/progreso`.

**Necesita**: la Fase 2 fusionada y S9 aprobada. Si la Fase 5 está fusionada, se ven el nivel y los
logros; si no, la página funciona sin ellos.

**Goal**:
- `/progreso` muestra 12 semanas con meta cumplida, no activos y futuros distinguibles sin
  depender del color.
- El detalle de un día lista sus tareas (sin las de la papelera).
- Estadísticas: mejor día, rachas y total; con el modo arcade, nivel, puntuación y sala de trofeos.

**Independent Test**: escenario 18 de [quickstart.md](./quickstart.md).

### Tests de la Fase 7 (escribirlos primero; deben fallar)

- [ ] T105 [P] [US5] Tests de integración en `backend/tests/integration/test_progress_days.py`:
  - `GET /me/progress/days?from&to` devuelve los días por orden ascendente;
  - 422 con `from > to`, un rango de más de 84 días o una fecha mal formada;
  - `GET /me/progress/days/{day}`: tareas sin las de la papelera ni las purgadas, 404 si no hay documento o la forma no es válida;
  - `GET /me/progress/stats`: el catálogo completo de 12 logros con `unlocked_at`, y `arcade: null` con el modo desactivado;
  - cambiar la meta no altera los días pasados (US5.4);
  - aislamiento entre cuentas.
- [ ] T106 [P] [US5] Tests unitarios en `frontend/tests/unit/features/progress/ProgressCalendar.test.tsx`, `DayDetail.test.tsx`, `StatsPanel.test.tsx` y `TrophyRoom.test.tsx`:
  - 84 celdas con intensidad por recuento y leyenda;
  - estados distinguibles por icono o texto además del color;
  - navegación por teclado entre los días;
  - el detalle del día seleccionado;
  - el estado vacío del primer día;
  - la sala de trofeos oculta con el modo arcade desactivado.
- [ ] T107 [US5] Test e2e `frontend/tests/e2e/progress-history.spec.ts`: con 3 días de actividad simulada con `X-Test-Now` (uno con la meta cumplida, uno sin ella y uno no activo), `/progreso` los muestra distinguibles; seleccionar uno lista sus tareas; la sala de trofeos muestra «Primera moneda» con su fecha

### Implementación de la Fase 7

- [ ] T108 [US5] Añadir a `backend/src/mytasks_api/repositories/progress_repository.py` la consulta de días por rango y la lectura por ids de las tareas de un día (`get_all` en bloques). Añadir a `progress_service.py` y `routers/progress.py` las rutas `GET /api/v1/me/progress/days`, `/days/{day}` y `/stats`, con `ProgressDayDetailOut` y `StatsOut` en `schemas/progress.py`. Hasta que pase T105
- [ ] T109 [US5] Ampliar `backend/tests/unit/test_export_openapi.py` con las tres rutas y repetir `ruff`, `mypy` y la suite de backend en verde
- [ ] T110 [US5] Añadir `useProgressDays`, `useProgressDay` y `useStats` a `frontend/src/api/progress.ts`, y crear `frontend/src/features/progress/ProgressPage.tsx`, `ProgressCalendar.tsx`, `DayDetail.tsx`, `StatsPanel.tsx` y `TrophyRoom.tsx` según S9, hasta que pase T106
- [ ] T111 [US5] Añadir la ruta `/progreso` en `frontend/src/app/App.tsx` y la pestaña «Progreso» en `frontend/src/app/AppHeader.tsx` (reflujo a 320 px con «Accesos»)
- [ ] T112 [US5] Ampliar `frontend/tests/e2e/a11y.spec.ts` con `/progreso` en claro y oscuro
- [ ] T113 Revisión de seguridad de la Fase 7 con `mytasks-security-auditor` y registrar el informe en `specs/007-daily-progress-arcade/security-review-fase-7.md`. Corregir en esta misma PR lo que marque como medio o superior. Puntos a revisar:
  - autorización en `/me/progress/days`, `/days/{day}` y `/stats`;
  - el `uid` sale solo del token;
  - el detalle de un día solo lee tareas de la propia cuenta, sin las de la papelera ni las purgadas;
  - el límite de 84 días;
  - un día de otra cuenta, o que no existe, da el mismo 404.
- [ ] T114 Ejecutar lint, typecheck, unitarios y e2e del frontend en verde, y marcar T105–T114 como hechas en este fichero

**Checkpoint**: las cinco historias funcionan.

---

## Phase 8: Documentación y cierre

**Purpose**: dejar el contrato, la documentación y los diseños coherentes con lo construido, y
cerrar la revisión de seguridad. Agentes: `mytasks-backend-developer`,
`mytasks-frontend-developer` y `mytasks-security-auditor`.

**Goal**: contrato único, documentación al día, revisión de seguridad final y *Definition of Done*
repasada.

**Independent Test**: el contrato de 001 contiene los endpoints de progreso y de programaciones y
coincide con `GET /openapi.json`; el `README.md` y `docs/design/screens/README.md` describen lo
vigente.

- [ ] T115 [P] Integrar `contracts/progress.yaml` en `specs/001-eisenhower-task-manager/contracts/openapi.yaml` (versión 1.4.0: `/me/progress*`, `/schedules*`, los campos nuevos de `TaskOut` y `ProfileOut`, y los errores 409 y 422 nuevos), comprobarlo contra `GET /openapi.json` y dejar en `contracts/progress.yaml` la nota de que ya está integrado
- [ ] T116 [P] Actualizar `README.md` (qué ofrecen el progreso, la misión, el modo arcade y las programadas; el día que empieza a las 04:00; que no hay variables nuevas) e `infra/RUNBOOK.md` con una sección breve:
  - no hay cambios de infraestructura;
  - dónde viven `progress/state`, `progress_days` y `schedules`;
  - cómo corregir a mano una racha o una programación atascada;
  - que `X-Test-Now` solo existe en local.
- [ ] T117 [P] Anotar en `specs/001-eisenhower-task-manager/data-model.md`, `spec.md` y `plan.md`, y en `specs/004-user-profile-settings/data-model.md`, que la feature 007 amplía la tarea y el perfil y añade el progreso y las programaciones. Comprobar que `docs/design/screens/README.md` indica la pantalla vigente de cada una
- [ ] T118 Ejecutar los escenarios 1–21 de [quickstart.md](./quickstart.md) en local y corregir `quickstart.md` y los contratos si algo cambió durante la implementación
- [ ] T119 Revisión de seguridad **final** de la feature con `mytasks-security-auditor` (estado acumulado de los hallazgos de las Fases 2, 6 y 7, la cabecera de reloj y la documentación) y registrar el informe en `specs/007-daily-progress-arcade/security-review-final.md`
- [ ] T120 Repasar el checklist *Definition of Done* de la constitución para la feature completa y registrarlo en `specs/007-daily-progress-arcade/definition-of-done.md`, marcando como pendientes solo los puntos de la Fase 9
- [ ] T121 Marcar T115–T120 como hechas en este fichero

**Checkpoint**: la feature queda lista para staging.

---

## Phase 9: Release y puesta en servicio (propietario + pipeline)

**Purpose**: validar en staging, publicar la release y validar en producción. Sin PR de fase: lo
hacen el propietario y el pipeline, y el agente solo abre la PR de release y la documental de
cierre.

- [ ] T122 (propietario) Con las Fases 1 a 8 fusionadas y el CI de `develop` en verde, validar en `https://staging.inserttask.es` los escenarios 1, 3, 5, 6, 8, 11, 12, 18 y 21 de [quickstart.md](./quickstart.md) con cuentas reales y comunicar el resultado al agente. Para los cambios de día se espera al día siguiente real: `X-Test-Now` no existe en staging
- [ ] T123 Crear `release/<versión>` desde `origin/develop` sin commits propios y abrir la PR a `main` en español, con la lista de cambios y la validación de staging (T122)
- [ ] T124 (propietario) Fusionar la PR de la release, aprobar el `deploy-production` del pipeline y avisar cuando termine. Si falla por «versión no validada», no relanzar y avisar al agente
- [ ] T125 (propietario) Repetir los escenarios 1, 5, 11 y 21 en `https://inserttask.es` y comunicar el resultado
- [ ] T126 Registrar el resultado en `specs/007-daily-progress-arcade/validacion-produccion.md` (los valores que comunique el propietario, sin inventar detalle), cerrar los puntos pendientes de `definition-of-done.md` y abrir la PR documental `feature/007-daily-progress-arcade-cierre` a `develop` (la fusiona el propietario)
- [ ] T127 (propietario) Decidir el retro-merge de `main` a `develop` y, si procede, pedir al agente que abra la PR; el agente no la fusiona

---

## Dependencies & Execution Order

### Orden de las fases

| Fase | Necesita | Nota |
|---|---|---|
| 1 (diseño) | — | Termina en el punto de control T012 |
| 2 (backend) | — | **Puede ir en paralelo a la Fase 1** |
| 3 (US1, MVP) | Fase 1 (ronda 1) aprobada y Fase 2 fusionada | |
| 4 (US2) | Fase 3 y S8 | Independiente de la 5, pero ambas tocan `DayScoreboard.tsx` y `ProgressSettings.tsx`: se fusionan una detrás de otra |
| 5 (US3) | Fase 3 y S3-c | |
| 6 (US4) | Fases 2 y 3, y S10 y S11 | Usa `StartOfDayDialog.tsx` si la Fase 4 ya está; si no, T100 deja esa parte para cuando llegue |
| 7 (US5) | Fase 2 y S9 | Mejor después de la 5, para ver los logros |
| 8 (cierre) | Todas las anteriores | |
| 9 (release) | Fase 8 | |

```text
Fase 1 (diseño) ──┐
                  ├──▶ Fase 3 (US1, MVP) ──┬──▶ Fase 4 (US2) ──┐
Fase 2 (backend) ─┘                        ├──▶ Fase 5 (US3) ──┼──▶ Fase 8 ──▶ Fase 9
                                           ├──▶ Fase 6 (US4) ──┤
                                           └──▶ Fase 7 (US5) ──┘   (mejor después de la 5)
```

### Dentro de cada fase

- Los tests se escriben primero y deben fallar antes de implementar.
- Orden de trabajo:
  - backend: dominio → repositorio → servicio → esquemas → router;
  - frontend: API → hooks → componentes → páginas → e2e.
- Las tareas de revisión de seguridad y de marcado de avance cierran cada fase. Una PR no se abre
  hasta que la suite de su fase está en verde.

### Oportunidades de paralelismo

- Las Fases 1 y 2 completas, en dos ramas distintas.
- Dentro de la Fase 2: T014–T021 (unitarios, ficheros distintos) y después T024–T029. T032 y T033
  pueden empezar a la vez.
- Dentro de la Fase 6, el backend (T080–T092) y los tests del frontend (T093–T095) en paralelo: el
  frontend se prueba con la API simulada hasta T097.
- En la Fase 8, T115–T117.

### Ejemplo de paralelismo (Fase 2)

```bash
# Tests unitarios de dominio, a la vez:
Task: "T015 test_progress_day_key.py"
Task: "T016 test_progress_rules.py"
Task: "T017 test_progress_mission.py"
Task: "T018 test_progress_close.py"
Task: "T019 test_levels_achievements.py"
Task: "T020 test_profile_domain.py (ajustes nuevos)"
```

## Implementation Strategy

### MVP primero

1. Las Fases 1 y 2 en paralelo: diseño aprobado y API de progreso.
2. Fase 3: **parar y validar** US1 (marcador y meta) en staging. Es útil por sí sola.
3. Las Fases 4 y 5, en el orden que convenga: cada una añade motivación sin romper la anterior.
4. Fase 6 (programadas): la más costosa, con revisión de seguridad propia.
5. Fase 7 (historial), Fase 8 y la validación del propietario antes de producción.

### Riesgos conocidos

- **MCP de Stitch inestable** (Fase 1): se mitiga con la prioridad de generación, `list_screens`
  antes de reintentar, la aprobación en dos rondas si el propietario la quiere, y un aviso en el
  punto de control si una pantalla no sale.
- **Cabecera estrecha** (Fases 3, 6 y 7): la cabecera ya desbordó con «InsertTasks» en la feature
  006 y ahora gana dos pestañas. El e2e de reflujo a 320 px con la cuenta de administrador es
  obligatorio en cada fase que la toca.
- **Transacciones concurrentes** (Fases 2 y 6): tests con `asyncio.gather` sobre el emulador. Si
  el emulador no reproduce la contención, se complementan con los tests de reintento con
  repositorio falso, como `test_profile_repository_retry.py`.
- **Cambio de día en staging** (Fase 9): `X-Test-Now` no existe fuera de local; el cambio de día se
  valida esperando al día real o cambiando la zona horaria en «Perfil».
- **Contraste de los tokens arcade** (Fases 1 y 3): `check-contrast.py` en el diseño y axe en ambos
  temas en los e2e.
