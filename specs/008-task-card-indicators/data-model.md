# Data Model: Indicadores compactos en la tarjeta de tarea

**Feature**: [spec.md](./spec.md) | **Fecha**: 2026-11-03

Esta feature **no cambia el modelo de datos**: ni Firestore ni la API ni los tipos del cliente.
Solo cambia cómo se pinta la tarjeta, a partir de datos que ya existen.

## Datos que usa la tarjeta (sin cambios)

| Dato | Origen | Para qué |
|---|---|---|
| `Task.pinned` | `GET /tasks` (feature 001) | Chincheta 📌 junto al título (sin cambios). |
| `Task.schedule_id` | `GET /tasks` (feature 007) | Indicador «Programada»: se pinta si no es `null`. |
| `Task.scheduled_for` | `GET /tasks` (feature 007) | «Pendiente desde el …» si es anterior a `today`. |
| `mission.task_ids` | `GET /me/progress` (feature 007) | Indicador «Misión del día» y estado del botón de estrella. |
| `today` (día de progreso) | `GET /me/progress` (feature 007) | Saber si una programada está pendiente. |

## Estado derivado en la tarjeta

| Estado | Regla (FR-006, sin cambios) |
|---|---|
| `isScheduled` | `task.schedule_id !== null` |
| `pendingFrom` | `isScheduled && scheduled_for !== null && today !== undefined && scheduled_for < today` → `scheduled_for`; si no, `null` |
| `inMission` | `missionTaskIds?.includes(task.id) ?? false` |
| `missionFull` | `(missionTaskIds?.length ?? 0) >= 5` |
| Botón de estrella visible | `missionTaskIds !== undefined` (el progreso cargó) |

## Estado local nuevo (solo de interfaz)

- **Tooltip abierto** (`CardIndicator`): un booleano por indicador. Se abre al tocar y se cierra
  al tocar fuera o con `Escape`. No se guarda en ningún sitio ni se comparte entre tarjetas.
