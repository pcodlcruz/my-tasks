# Contrato de interfaz: tarjeta de tarea del tablero (S3 v4)

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) | **Fecha**: 2026-11-03

Este contrato describe lo que la tarjeta muestra y anuncia, y lo comprueban los tests. El aspecto
exacto (tamaños, espaciado, colores) lo fija el diseño aprobado en Stitch (S3 v4, research R7).
**Variante elegida: V2** (research R6, aprobada por el propietario el 2026-11-04): la misión se
indica solo con el botón de estrella de las acciones; no hay ★ junto al título.

## Estructura

```text
┌────────────────────────────────────────────────────────────┐
│ [📌][📅] Título de la tarea (salta de línea si no cabe)     │  ← cabecera: título con indicadores
│                       Fijar · Editar · [☆/★] · Papelera    │  ← acciones (flex-wrap; bajan si no caben)
│────────────────────────────────────────────────────────────│
│ (Trabajo)   Pendiente desde el lun 2          [Completar]  │  ← pie (flex-wrap)
└────────────────────────────────────────────────────────────┘
```

Si hay sitio, en escritorio y en compacto las acciones pueden ir en la misma fila que el título.
Lo obligatorio es que nada se solape (FR-002).

## Indicadores junto al título (FR-001, FR-003, FR-004, FR-006)

| Indicador | Cuándo | Icono (visible, `aria-hidden`) | Texto accesible (`sr-only`) | Tooltip |
|---|---|---|---|---|
| Fijada (sin cambios) | `task.pinned` | 📌 | (como hoy) | (como hoy, `title="Fijada"`) |
| Programada | `task.schedule_id !== null` | SVG de calendario (el actual) | `Programada` | `Programada` |

- **Orden**: 📌 → 📅 → título. El lector de pantalla lee, por ejemplo, «Programada Preparar la
  demo».
- **Misión del día (V2)**: no tiene indicador junto al título, ni en escritorio ni en móvil ni en
  compacto. La estrella llena (`text-gold`) del botón de las acciones es el indicador; su nombre
  accesible y su `title` («Quitar de la misión») cumplen FR-004. Si el progreso no carga, no hay
  botón y, por tanto, tampoco marca de misión (FR-006, como hoy).
- **Sin la condición** no se pinta el indicador ni se deja un hueco (US1, escenario 5).
- **Tooltip**: aparece al pasar el puntero y no se va mientras el puntero esté encima del icono o
  del propio tooltip. Al tocar se abre o se cierra, y se cierra al tocar fuera o con `Escape`.
  Lleva `aria-hidden="true"` (el texto ya lo da el `sr-only`). No es una parada del tabulador.
- **Contraste**: el icono, al menos 3:1 con el fondo de la tarjeta en claro y oscuro (WCAG
  1.4.11); el tooltip, al menos 4,5:1.

## «Pendiente desde» (FR-005)

- **Lugar**: el pie, después de la etiqueta de ámbito.
- **Texto exacto**: `Pendiente desde el <pendingSince(scheduled_for)>` (p. ej. `Pendiente desde
  el lun 2`).
- **Cuándo**: si es programada, se sabe `today` y `scheduled_for < today`.

## Botón de estrella de la misión (FR-007, FR-008)

| Estado | Icono | Nombre accesible | `title` | Habilitado |
|---|---|---|---|---|
| Fuera de la misión, con hueco | ☆ contorno, `text-text-muted` | `Añadir a la misión` | `Añadir a la misión` | sí |
| Fuera de la misión, con 5 tareas | ☆ contorno, atenuado | `Añadir a la misión` | `Añadir a la misión` | no; `aria-describedby` → «La misión ya tiene 5 tareas.» |
| En la misión | ★ llena, `text-gold` | `Quitar de la misión` | `Quitar de la misión` | sí |
| Mientras se envía | el que corresponda, atenuado | el que corresponda | igual | no |
| Progreso no cargado | no se pinta | — | — | — |

- **Sin `aria-pressed`**: el estado lo dice la etiqueta (research R4).
- **Qué envía**: la misión completa con la tarea añadida o quitada. Si el servidor la rechaza,
  muestra el aviso de `missionErrorMessage` y nada cambia (como hoy).
- **Tamaño**: área de pulsación de al menos 24 × 24 px.
- **Las otras acciones** («Fijar/Desfijar», «Editar», «Mover a la papelera») no cambian.

## Ausencia de solapamiento (FR-002, SC-001)

A 320, 768, 1024 y 1280 px (desde 768, en la matriz 2×2), con densidad normal y compacta y con
una tarea que tiene todos los estados y un título largo:
- las cajas del título, cada indicador, cada acción, «Pendiente desde», la etiqueta de ámbito y
  «Completar» no se cortan entre sí;
- `document.documentElement.scrollWidth <= clientWidth` (sin desplazamiento horizontal), también
  con un tooltip abierto a 320 px;
- la altura de la línea del título con iconos es la misma que la de una tarjeta igual sin iconos
  (SC-002).
