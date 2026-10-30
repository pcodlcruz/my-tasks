# Implementation Plan: Progreso diario, tareas programadas y gamificación arcade

**Branch**: `feature/007-daily-progress-arcade` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-daily-progress-arcade/spec.md`

## Summary

Hoy la aplicación solo sabe qué tareas están activas, completadas o en la papelera; no hay
noción de «día» ni de constancia. Esta feature añade:

- un **marcador del día** con meta numérica y misión opcional;
- una **pantalla de inicio de jornada** («PULSA START») la primera vez que se abre la aplicación
  cada día;
- **puntos, rachas, niveles, logros y récord** con estética arcade, que encaja con la marca
  «InsertTasks»;
- **tareas programadas** que aparecen solas en el tablero;
- un **historial de progreso** de 12 semanas.

Decisiones clave (detalle y alternativas en [research.md](research.md)):

- **Sin infraestructura nueva** (R1). No hay ningún proceso a las 04:00. Al primer acceso de la
  persona, el backend cierra los días pasados, recalcula la racha y genera las tareas programadas
  vencidas, de forma idempotente, en `GET /api/v1/me/progress` (R2). Una cuenta revocada no
  genera nada porque no puede hacer peticiones.
- **Día de progreso = fecha local menos 4 h**, en la zona horaria IANA guardada en el perfil (R3).
  Única dependencia nueva: `tzdata`.
- **Completar, reabrir y mandar a la papelera** actualizan la tarea, el día y el marcador **en una
  sola transacción** de Firestore (R4). Las reglas de R5 (una vez por día, puntos una vez en la
  vida, bonus que se conceden y se retiran) son funciones puras del dominio.
- **Programaciones sin duplicados**: una transacción por programación vencida, una sola tarea por
  ocurrencia y ninguna nueva mientras la anterior siga activa (R7).
- **Anuncios una sola vez**, guardados en el servidor y confirmados por el cliente (R9).
- **Los ajustes** (meta, días activos, zona horaria, inicio de jornada, modo arcade) amplían el
  perfil de la feature 004 (R11).
- **Diseño primero en Stitch**, con punto de control humano (R14).
- **Revisión de seguridad** por cambio del modelo de datos (R16).

**Glosario**:

| Término | Significado |
|---|---|
| Día de progreso | El día de 04:00 a 03:59 (`Day`, `YYYY-MM-DD`) |
| Marcador | `progress/state` |
| Programación | Tarea programada, `schedules/{id}` |
| Tarea generada | Tarea normal con `schedule_id` |
| Puesta al día | El *catch-up* de R1 |

## Technical Context

**Language/Version**: Python 3.13 en el backend (`pyproject.toml`) y TypeScript estricto con React
18+ en el frontend.

**Primary Dependencies**:
- Ya presentes: FastAPI, Pydantic, `google-cloud-firestore` y `pillow`; TanStack Query, Zustand y
  el router actual.
- **Una dependencia nueva de backend: `tzdata`** (datos IANA para `zoneinfo`), fijada en `uv.lock`.
- Una fuente autoalojada (Press Start 2P, OFL); sin dependencias npm nuevas.

**Storage**:
- Firestore (modo nativo).
- Campos nuevos en `users/{uid}/settings/profile` y en `users/{uid}/tasks/{id}`.
- Documentos y colecciones nuevos: `users/{uid}/progress/state`, `users/{uid}/progress_days/{día}`
  y `users/{uid}/schedules/{id}`.
- Sin migración y sin índices compuestos nuevos ([data-model.md](data-model.md) §7).

**Testing**:
- pytest:
  - unitarios de dominio: día de progreso, reglas R5, cierre R6, repeticiones R7, niveles y
    logros;
  - integración por endpoint contra los emuladores, con aislamiento entre cuentas, transacciones
    concurrentes y reloj inyectado (R15).
- Vitest: marcador, diálogo, celebraciones, formularios y hooks.
- Playwright: flujos de US1–US5 con `page.clock` y `X-Test-Now`, axe en claro y oscuro, y reflujo
  a 320 px.

**Target Platform**: Cloud Run (API y web) en staging y producción; emuladores en local. Sin
cambios de despliegue, de variables ni de `infra/`.

**Project Type**: aplicación web (frontend + backend), como las features anteriores.

**Performance Goals**:
- El marcador refleja un completado en < 1 s (SC-002).
- La puesta al día en un día normal cuesta ~3 lecturas: marcador, día de hoy y la consulta de
  programaciones vencidas, normalmente vacía.
- El peor caso son 84 días sin cerrar y 50 programaciones, acotado.
- `test_performance.py` (p95 < 300 ms) se sigue cumpliendo.

**Constraints**:
- `uid` solo del token.
- Validación cerrada en el servidor (`extra = forbid`) de los ajustes, la misión y las
  programaciones.
- Ningún valor de juego se acepta del cliente (FR-032).
- Límites: 50 programaciones, 5 tareas por misión, 84 días por consulta y 20 anuncios o avisos.
- Contraste AA en ambos temas, movimiento reducido respetado y cabecera que cabe a 320 px.
- La CSP no cambia (`font-src 'self'` ya cubre la fuente).

**Scale/Scope**:
- Una administradora y un puñado de invitadas; ~1 documento de día por persona y día.
- 3 pantallas nuevas (`/progreso`, `/programadas` y el diálogo de inicio de jornada), 2 versiones
  nuevas (tablero y perfil) y 1 formulario nuevo.
- 13 endpoints nuevos y 3 contratos ampliados (`TaskOut`, `ProfileOut` y `ProfileUpdateIn`).

## Constitution Check

*GATE: debe pasar antes de la Fase 0. Reevaluado tras el diseño de la Fase 1: sigue cumpliéndose.*

| Principio | Evaluación |
|---|---|
| **I. Simplicidad** | ✅ Con complejidad justificada (ver *Complexity Tracking*). Se evitan Cloud Scheduler, *jobs* e identidades nuevas (R1), los índices compuestos (R7 y §7), una colección de catálogo (R8) y la comparación de estados en el cliente (R9). Fuera de alcance, según la spec: notificaciones, tabla de récords, sonidos, comodines y repeticiones complejas. |
| **II. Tests por niveles** | ✅ Unitarios de todas las reglas de dominio (R3, R5–R8, R10). Integración por cada endpoint nuevo y por los cambios en `complete`, `reopen`, `trash`, `PATCH /me/profile` y el listado del tablero, incluidos 401, 403, 404, 409 y 422, el aislamiento y la concurrencia. E2E de cada flujo principal (US1–US5) con reloj controlado (R15). Ver [quickstart.md](quickstart.md). |
| **III. Seguridad de aplicación** | ✅ `get_active_user` en todos los endpoints; `uid` del token; Pydantic con listas cerradas; sin secretos; `tzdata` fijado. La cabecera `X-Test-Now` solo tiene efecto en `APP_ENV=local`, con un test que lo comprueba (R15). **Revisión `mytasks-security-auditor` obligatoria** (modelo de datos nuevo) en las fases 2, 6 y 7 y en la final (R16). |
| **IV. Paridad de entornos** | ✅ Sin cambios de infraestructura ni de variables: el comportamiento es idéntico en los tres entornos, salvo la cabecera de reloj, que solo existe en `local` (desarrollo y tests, nunca en staging ni producción). Se valida en staging antes de producción. |
| **V. Identidad de agente / MCP** | ✅ Ninguna operación en Google Cloud. El MCP de Stitch no es Google Cloud. La alternativa de Cloud Scheduler, que habría exigido confirmación de infraestructura, queda descartada en R1. |
| **VI. Despliegue por pipeline** | ✅ Solo el pipeline despliega; no hay pasos manuales nuevos. |
| **VII. Revisión humana** | ✅ Una PR de diseño y una por fase; las fusiona el propietario. |
| **VIII. Agentes y skills** | ✅ `mytasks-backend-developer`, `mytasks-frontend-developer` y `mytasks-security-auditor`. **Excepción justificada**: ningún skill cubre el diseño en Stitch; se hace a mano con su MCP, como en la 001 y la 004 (R14). |
| **IX. Idioma** | ✅ Documentación e interfaz en español; código y commits en inglés (Conventional Commits). |

**Resultado**: sin violaciones. No quedan `NEEDS CLARIFICATION`.

## Project Structure

### Documentation (this feature)

```text
specs/007-daily-progress-arcade/
├── plan.md              # Este fichero
├── research.md          # Decisiones R1–R16
├── data-model.md        # Ajustes, campos de la tarea, día de progreso, marcador y programaciones
├── quickstart.md        # 21 escenarios de validación
├── contracts/
│   ├── progress.yaml    # /me/progress*, /schedules*, y ampliaciones de TaskOut y ProfileOut
│   └── ui-screens.md    # S3 v3, S3-c, S7 v2, S8, S9, S10, S11 y la cabecera
├── checklists/requirements.md
└── tasks.md             # Lo genera /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml / uv.lock                      # + tzdata (versión fijada)
├── src/mytasks_api/
│   ├── clock.py                                  # NUEVO: Clock inyectable; X-Test-Now solo en local (R15)
│   ├── domain/progress.py                        # NUEVO: day_key, reglas R5, cierre R6, niveles, logros y anuncios
│   ├── domain/recurrence.py                      # NUEVO: siguiente ocurrencia (once/daily/weekly/monthly), día 31
│   ├── domain/profile.py                         # + daily_goal, active_weekdays, timezone, morning_review, arcade_mode
│   ├── domain/task.py                            # + completed_day, points_awarded_on, schedule_id, scheduled_for
│   ├── repositories/progress_repository.py       # NUEVO: transacciones tarea + día + marcador; cierre; días por rango
│   ├── repositories/schedule_repository.py       # NUEVO: CRUD y generación transaccional (R7)
│   ├── repositories/task_repository.py           # transiciones con gancho de progreso; campos nuevos
│   ├── services/progress_service.py              # NUEVO: puesta al día, misión, inicio de jornada, confirmaciones, estadísticas
│   ├── services/schedule_service.py              # NUEVO
│   ├── services/task_service.py                  # complete/reopen/trash delegan en la transacción con progreso
│   ├── schemas/progress.py, schemas/schedule.py  # NUEVO
│   ├── schemas/profile.py, schemas/task.py       # campos nuevos
│   ├── routers/progress.py, routers/schedules.py # NUEVO
│   ├── factory.py                                # routers y errores 409 schedule_limit / schedule_finished, 422 mission_invalid_task
│   └── logging_config.py                         # eventos progress_* y schedule_*, sin títulos de tareas
└── tests/
    ├── unit/domain/                              # test_progress_day_key, test_progress_rules, test_progress_close, test_recurrence, test_levels_achievements
    ├── unit/services/                            # test_progress_service, test_schedule_service
    └── integration/                              # test_progress, test_progress_transitions, test_progress_mission, test_progress_days,
                                                  # test_progress_isolation, test_schedules, test_schedule_generation, test_test_clock_header

frontend/
├── src/
│   ├── assets/fonts/press-start-2p.woff2         # NUEVO (OFL) + licencia
│   ├── index.css                                 # @font-face, tokens arcade claro/oscuro, movimiento reducido
│   ├── api/progress.ts, api/schedules.ts         # NUEVO: hooks (useProgress, useSetMission, useMarkReviewSeen, useAck, useProgressDays, useStats, useSchedules…)
│   ├── api/tasks.ts, api/profile.ts, types.ts    # campos nuevos; invalidar el progreso tras completar o reabrir
│   ├── app/App.tsx                               # rutas /progreso y /programadas; el tablero espera a la puesta al día
│   ├── app/AppHeader.tsx                         # pestañas nuevas que caben a 320 px
│   ├── features/progress/                        # NUEVO: DayScoreboard, EnergyBar, StartOfDayDialog, MissionPicker, Celebrations,
│   │                                             #        ProgressPage, ProgressCalendar, DayDetail, StatsPanel, TrophyRoom
│   ├── features/schedules/                       # NUEVO: SchedulesPage, ScheduleForm, recurrenceLabel.ts
│   ├── features/board/BoardPage.tsx, TaskCard.tsx # marcador; marcas de misión y de programada; «pendiente desde»
│   └── features/profile/ProgressSettings.tsx     # NUEVO: sección «Progreso y juego», detección de la zona horaria
└── tests/
    ├── unit/                                     # marcador, barra, diálogo, celebraciones, formulario de programación, etiquetas de repetición
    └── e2e/                                      # progress-day, start-of-day, mission, arcade, schedules, progress-history, a11y y reflujo

docs/design/
├── DESIGN.md                                     # + estética arcade (tipografía, tokens y celebraciones)
└── screens/                                      # + versiones aprobadas y README con las vigentes

specs/001-eisenhower-task-manager/contracts/openapi.yaml   # integrar progress.yaml (fase de cierre)
```

**Structure Decision**: se mantiene la estructura existente: el backend en capas
`domain → repositories → services → routers` y el frontend por `features/`. El progreso y las
programaciones son módulos nuevos en cada capa. El código existente que cambia es:
- las tres transiciones de tarea que afectan al progreso (completar, reabrir y papelera);
- los esquemas de tarea y perfil;
- el tablero, la cabecera y la página de perfil.

## Fases de entrega

Una PR por fase, de menor a mayor riesgo, cada una desplegable por separado (Principio VII). Las
dependencias exactas las fija `/speckit-tasks`.

| Fase | Contenido | Historia | Nota |
|---|---|---|---|
| 1 | **Diseño en Stitch** de [ui-screens.md](contracts/ui-screens.md) + estética arcade en `DESIGN.md` + exportación a `docs/design/screens/` | — | Punto de control humano: el propietario aprueba antes de la Fase 3. Sin código. |
| 2 | **Backend del progreso**: `Clock` y `X-Test-Now`, `tzdata`, ajustes del perfil, campos de la tarea, dominio R3/R5/R6/R8/R10, transacción de completar, reabrir y papelera, `GET /me/progress`, `POST review`, `PUT today/mission`, `POST ack` | base de US1–US3 | Puede ir en paralelo a la Fase 1. **Revisión de seguridad**. |
| 3 | **Marcador del día**: tokens y fuente arcade, `DayScoreboard` y barra de energía en el tablero, sección «Progreso y juego» del perfil y detección de la zona horaria | US1 | Necesita 1 y 2. MVP. |
| 4 | **Inicio de jornada y misión**: `StartOfDayDialog`, `MissionPicker` y marcas de misión en las tarjetas | US2 | |
| 5 | **Arcade**: puntuación y nivel en el marcador, celebraciones con confirmación, modo arcade desactivable y movimiento reducido | US3 | |
| 6 | **Tareas programadas**: `domain/recurrence.py`, repositorio y servicio con generación transaccional, endpoints `/schedules*`, avisos de límite, `/programadas`, `ScheduleForm` y marcas de «programada» y «pendiente desde» | US4 | **Revisión de seguridad** específica. |
| 7 | **Historial de progreso**: `GET /me/progress/days`, `/days/{day}` y `/stats`, `/progreso` con calendario, detalle, estadísticas y sala de trofeos | US5 | **Revisión de seguridad** (endpoints de lectura nuevos). |
| 8 | **Cierre**: `progress.yaml` integrado en el contrato de la 001, README y RUNBOOK, revisión de seguridad final y *Definition of Done* | — | |
| 9 | **Release y validación** (propietario): staging con los escenarios de la quickstart, release y producción | — | Sin PR de fase. |

## Complexity Tracking

| Elemento | Por qué es necesario | Alternativa más simple descartada |
|---|---|---|
| Dependencia `tzdata` | El día de progreso depende de la zona horaria IANA (R3), y la imagen de *buildpacks* no garantiza los datos del sistema. | Desfase fijo en el perfil: falla con el cambio de horario. |
| Transacción de tres documentos (tarea, día y marcador) | Única forma de cumplir SC-006 y FR-006 ante reintentos y pestañas concurrentes (R4). | Escrituras separadas: estados a medias, completados contados dos veces o ninguna. |
| `GET` con efectos idempotentes | Evita infraestructura programada (R1) sin obligar al cliente a llamar a `sync` antes de cada lectura (R2). | Cloud Scheduler o un `POST /sync` previo: infraestructura nueva, o dos viajes y datos sin cerrar si el cliente se salta uno. |
| Anuncios guardados en el servidor | «Se anuncia una sola vez» con varios dispositivos (R9). | Comparar en el cliente el estado anterior con el nuevo: repite o pierde anuncios entre dispositivos y recargas. |
| Cabecera `X-Test-Now` (solo `local`) | E2E de cambio de día, racha y repeticiones (Principio II) (R15). | Solo unitarios: deja los flujos de la US2 y la US4 sin e2e. Cambiar el reloj del contenedor: no reproducible en CI. |
| Fuente autoalojada | Estética arcade (FR-020) sin relajar la CSP. | Google Fonts: exige ampliar `font-src` y `style-src` a otro origen. |
