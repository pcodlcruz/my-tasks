# Data Model: Gestión de tareas con matriz de Eisenhower

**Feature**: `001-eisenhower-task-manager` | **Fecha**: 2026-09-27 | **Research**: [research.md](./research.md)

## Usuario

No se persiste como documento propio (ver [research.md § R2](./research.md#r2-modelo-de-almacenamiento-en-firestore-y-aislamiento-por-usuario)).
Su identidad es el `uid` que emite Firebase Authentication al iniciar sesión con Google. El sistema
no almacena contraseñas: las credenciales las custodia Google.

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `uid` | string | ID token verificado | Único; nunca se acepta desde el cliente |
| `email` | string | Cuenta de Google (vía Firebase Auth) | Solo lectura; se muestra en la cabecera |
| `displayName`, `photoURL` | string, opcional | Cuenta de Google (vía Firebase Auth) | Solo en el frontend, para la cabecera; no se persisten |

## Tarea

**Ruta en Firestore**: `users/{uid}/tasks/{taskId}` (`taskId` autogenerado por Firestore).

### Campos persistidos

| Campo (Firestore) | Tipo | Obligatorio | Reglas de validación | Req. |
|---|---|---|---|---|
| `title` | string | sí | Se recortan espacios; 1–200 caracteres tras recortar | FR-004 |
| `description` | string | sí | Se recortan espacios; 1–2000 caracteres tras recortar | FR-004 |
| `urgent` | bool | sí | — | FR-005 |
| `important` | bool | sí | — | FR-005 |
| `scope` | enum `work` \| `personal` | sí | Sin valor por defecto: el cliente debe enviarlo | FR-007 |
| `pinned` | bool | sí | Por defecto `false` | FR-008b |
| `status` | enum `active` \| `completed` | sí | Por defecto `active` | FR-012, FR-013a |
| `in_trash` | bool | sí | Por defecto `false` | FR-014 |
| `created_at` | timestamp (UTC) | sí | Lo fija el servidor; inmutable | FR-008a |
| `updated_at` | timestamp (UTC) | sí | Lo fija el servidor en cada escritura | — |
| `completed_at` | timestamp (UTC) \| null | condicional | No nulo ⇔ `status == completed` | FR-013 |
| `trashed_at` | timestamp (UTC) \| null | condicional | No nulo ⇔ `in_trash == true` | FR-014 |
| `purge_at` | timestamp (UTC) \| null | condicional | `trashed_at + 30 días`; campo de la política TTL | FR-014b |

Etiquetas en la interfaz: `work` → "Laboral", `personal` → "Personal".

### Campo derivado (no persistido)

`quadrant` se calcula en el dominio a partir de `urgent` e `important` (FR-006, [R5](./research.md#r5-cuadrante-derivado)):

| `urgent` | `important` | `quadrant` | Etiqueta en la interfaz |
|---|---|---|---|
| true | true | `do_now` | Hacer ahora |
| false | true | `schedule` | Planificar |
| true | false | `delegate` | Delegar |
| false | false | `eliminate` | Eliminar |

### Estados y transiciones

El estado lógico combina `status` e `in_trash`. `in_trash` es ortogonal a `status` para que al
restaurar la tarea vuelva a su estado anterior (FR-014a).

```text
               complete                      trash
   ┌────────┐ ─────────► ┌───────────┐ ──────────────┐
   │ Activa │            │ Completada│               ▼
   └────────┘ ◄───────── └───────────┘         ┌───────────┐  purge (manual o
     │   ▲       reopen                        │ Papelera  │ ─ purge_at ≤ ahora) ─► (eliminada
     │   └──────────── restore ─────────────── │ (conserva │                        para siempre)
     └────────────── trash ──────────────────► │  status)  │
                                               └───────────┘
```

| Transición | Estado de origen válido | Efecto | Si el origen no es válido |
|---|---|---|---|
| editar | activa, fuera de la papelera | Actualiza campos; el cuadrante se recalcula; `pinned` se conserva | `409` |
| fijar / desfijar | activa, fuera de la papelera | `pinned = true/false` | `409` |
| completar | activa, fuera de la papelera | `status=completed`, `completed_at=ahora` | `409` |
| reabrir | completada, fuera de la papelera | `status=active`, `completed_at=null` | `409` |
| mover a papelera | cualquiera fuera de la papelera | `in_trash=true`, `trashed_at=ahora`, `purge_at=ahora+30d` | `409` |
| restaurar | en la papelera y `purge_at > ahora` | `in_trash=false`, `trashed_at=null`, `purge_at=null` | `409` |
| borrar definitivamente | en la papelera | Borra el documento | `409` |

**Límite de tareas activas (FR-016)**: un usuario no puede tener más de 500 tareas con
`status == active` e `in_trash == false`. Crear, reabrir y restaurar una tarea que estaba activa
comprueban el recuento y responden `409 task_limit_reached` si ya se alcanzó; restaurar una
completada no lo comprueba. Es un tope «blando»: el recuento y la escritura no son atómicos, así
que dos altas simultáneas podrían pasarse por muy poco.

Toda transición se hace en una transacción de Firestore que relee el estado ([R6](./research.md#r6-concurrencia)).
Una tarea con `purge_at <= ahora` se trata como inexistente (`404`) en cualquier lectura u
operación ([R3](./research.md#r3-papelera-con-purgado-a-los-30-días-fr-014b)).

### Vistas y consultas

| Vista | Filtro | Orden | Paginación |
|---|---|---|---|
| Tablero | `status=active`, `in_trash=false`, `scope` opcional | `pinned` desc, `created_at` asc (en servicio) | No (≤ ~500 activas) |
| Historial | `status=completed`, `in_trash=false` | `completed_at` desc | Cursor |
| Papelera | `in_trash=true`, `purge_at > ahora` | `purge_at` desc (equivale a `trashed_at` desc, ya que `purge_at = trashed_at + 30d`, y evita ordenar por un campo distinto del filtrado por rango) | Cursor |

Índices compuestos (`firestore.indexes.json`, grupo de colecciones `tasks`):

1. `status` ASC, `in_trash` ASC, `scope` ASC (tablero filtrado por ámbito)
2. `status` ASC, `in_trash` ASC, `completed_at` DESC (historial)
3. `in_trash` ASC, `purge_at` DESC (papelera)

Los índices exactos se validan contra el emulador y la consola de índices durante la
implementación; si una consulta no necesita índice compuesto, se elimina de la lista.
