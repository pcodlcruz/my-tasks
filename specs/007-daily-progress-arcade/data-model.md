# Data Model: Progreso diario, tareas programadas y gamificación arcade

Firestore (modo nativo). Todo cuelga de `users/{uid}/` y solo lo lee y escribe el backend con el
`uid` del token, igual que las tareas (`firestore.rules` sigue denegando el acceso directo desde
el cliente). Las decisiones están en [research.md](research.md).

**Convenciones**:
- **Día de progreso**: cadena `YYYY-MM-DD`. Es la fecha local de la persona menos 4 h (R3).
- **Instantes**: `timestamp` UTC.
- Un documento que no existe equivale a sus valores por defecto. Ninguna cuenta necesita
  migración: al desplegar, todas empiezan en «PARTIDA NUEVA».

## 1. Ajustes de progreso (amplía `users/{uid}/settings/profile`, feature 004)

| Campo | Tipo | Validación | Por defecto |
|---|---|---|---|
| `daily_goal` | int | 1–20 | 3 |
| `active_weekdays` | array<int> | 1–7 (ISO, 1 = lunes), sin repetir, al menos uno | `[1,2,3,4,5,6,7]` |
| `timezone` | string \| null | uno de `zoneinfo.available_timezones()` | `null` (se usa `Europe/Madrid`) |
| `morning_review` | bool | — | `true` |
| `arcade_mode` | bool | — | `true` |

- No forman parte de `RESETTABLE_FIELDS` (R11).
- Un valor guardado que ya no es válido se lee como su valor por defecto, como el resto del
  perfil (`profile_from_document`).

## 2. Tarea (amplía `users/{uid}/tasks/{taskId}`, feature 001)

| Campo nuevo | Tipo | Significado |
|---|---|---|
| `completed_day` | string \| null | Día de progreso del completado actual. Se pone al completar y se borra al reabrir |
| `points_awarded_on` | string \| null | Día en que la tarea dio sus puntos de tarea. Una vez puesto, no vuelve a dar puntos, salvo si se reabre ese mismo día (entonces se borra) |
| `schedule_id` | string \| null | Programación que la generó |
| `scheduled_for` | string \| null | Ocurrencia (día) de la programación que la generó. Es el «pendiente desde» de FR-023 |

- Todos son opcionales: las tareas existentes los leen como `null`.
- `TaskOut` expone `schedule_id` y `scheduled_for`. `completed_day` y `points_awarded_on` son
  internos.
- `schedule_id` y `scheduled_for` no son editables; el resto de la tarea se comporta igual
  (FR-027).

## 3. Día de progreso (`users/{uid}/progress_days/{día}`)

El identificador del documento es la propia clave del día, así que hay uno como máximo por día.

| Campo | Tipo | Notas |
|---|---|---|
| `date` | string | = id del documento; campo para las consultas por rango |
| `active` | bool | El día de la semana era activo. Se fija al crear el documento |
| `goal` | int | Meta vigente. Se actualiza mientras el día está abierto y se congela al cerrarlo |
| `completed_task_ids` | array<string> | Tareas que cuentan hoy, sin repetir |
| `completed_count` | int | = número de elementos de `completed_task_ids` |
| `mission_task_ids` | array<string> | ≤ 5 |
| `mission_completed_ids` | array<string> | Subconjunto de `mission_task_ids` completado hoy |
| `phase_bonus` | bool | Bonus de fase concedido hoy |
| `mission_bonus` | bool | Bonus de misión concedido hoy |
| `phase_announced`, `mission_announced` | bool | El bonus ya se anunció hoy. Si se pierde con una reapertura y se recupera, solo se vuelve a anunciar si el primer anuncio no se había visto (research R9) |
| `points` | int | Puntos ganados hoy (tareas + extras + bonus); el neto tras reaperturas |
| `review_seen` | bool | Se vio la pantalla de inicio de jornada |
| `closed` | bool | `true` tras el cierre (R6); a partir de ahí no cambia ningún campo |
| `created_at`, `updated_at` | timestamp | |

**Estados**: `abierto` (hoy) → `cerrado` (en la primera puesta al día posterior). El paso es de un
solo sentido.

**Validación**:
- `completed_count ≥ goal` ⇔ meta cumplida.
- Un día cerrado rechaza cualquier escritura: si una transacción lo intenta, es un error de
  programación y se registra.

## 4. Marcador del jugador (`users/{uid}/progress/state`)

| Campo | Tipo | Notas |
|---|---|---|
| `score` | int ≥ 0 | Puntuación acumulada. El nivel se deriva de ella (R8) |
| `max_level_announced` | int | Para no repetir el anuncio de nivel |
| `current_streak` | int | Racha cerrada hasta ayer (R6) |
| `best_streak` | int | |
| `best_day_count` | int | Récord de tareas en un día cerrado |
| `best_day_date` | string \| null | |
| `tasks_scored` | int | Tareas **distintas** que han dado puntos de tarea. Es el «total de tareas distintas completadas» de FR-030 y la base de los logros `tasks_*`; baja si se reabre el mismo día |
| `last_closed_day` | string \| null | Último día cerrado |
| `record_announced_on` | string \| null | Para anunciar «¡NUEVO RÉCORD!» una vez al día |
| `achievements` | map<string, timestamp> | Logro → momento en que se consiguió. Nunca se retira |
| `announcements` | array<object> (≤ 20) | Anuncios pendientes: `{id, kind, value, created_at}`. `kind` ∈ `phase_clear`, `mission_clear`, `level_up`, `achievement`, `new_record` (R9) |
| `notices` | array<object> (≤ 20) | Avisos de programaciones que no cupieron: `{id, schedule_id, day}` |
| `started_at` | timestamp | Primera escritura (inicio de la «partida») |
| `updated_at` | timestamp | |

## 5. Tarea programada (`users/{uid}/schedules/{scheduleId}`)

| Campo | Tipo | Validación |
|---|---|---|
| `title`, `description`, `urgent`, `important`, `scope` | como en `TaskCreate` | mismas reglas (≤ 200 / ≤ 2000 caracteres, obligatorios) |
| `recurrence.kind` | `once` \| `daily` \| `weekly` \| `monthly` | |
| `recurrence.date` | string | solo con `once`; ≥ hoy al crearla o editarla |
| `recurrence.weekdays` | array<int> | solo con `weekly`; 1–7, sin repetir, al menos uno |
| `recurrence.month_day` | int | solo con `monthly`; 1–31 (en un mes más corto, el último día) |
| `status` | `active` \| `paused` \| `finished` | `finished` solo para `once` ya generada |
| `next_occurrence` | string \| null | `null` si está pausada o terminada (R7) |
| `last_task_id` | string \| null | Última tarea generada |
| `last_generated_for` | string \| null | Ocurrencia de esa tarea |
| `created_at`, `updated_at` | timestamp | |

**Estados**:

```text
active ──pausar──▶ paused ──reanudar──▶ active (next_occurrence se recalcula desde hoy)
active ──(once generada)──▶ finished
cualquiera ──eliminar──▶ (borrada; las tareas generadas se quedan)
```

**Límite**: 50 programaciones por persona, contando las terminadas. Al llegar al límite, crear
otra responde 409 `schedule_limit`.

## 6. Relaciones

```text
users/{uid}
├── settings/profile     ── ajustes de progreso (§1)
├── tasks/{taskId}       ── schedule_id ─▶ schedules/{scheduleId}
├── progress/state       ── marcador (§4)
├── progress_days/{día}  ── completed_task_ids, mission_task_ids ─▶ tasks/{taskId}
└── schedules/{id}       ── last_task_id ─▶ tasks/{taskId}
```

## 7. Índices

No hace falta ningún índice compuesto nuevo:
- `schedules where next_occurrence <= hoy`: un solo campo, índice automático.
- `progress_days where date >= from and date <= to order by date`: un solo campo, índice
  automático.
- Las tareas de un día se leen por id.

`firestore.indexes.json` no cambia.

## 8. Retención

Los días de progreso, el marcador y las programaciones se conservan mientras exista la cuenta
(son pocos documentos y pequeños). Una cuenta revocada los conserva por si recupera el acceso. El
borrado de cuentas sigue fuera de alcance, como en la feature 004.
