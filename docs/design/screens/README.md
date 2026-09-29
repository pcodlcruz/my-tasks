# Pantallas aprobadas en Stitch

**Proyecto Stitch**: `projects/13869439670490335529` ("MyTasks")
**Design system**: `assets/ec957f11ef474eb58336b8af664aaa2e` (generado desde [../DESIGN.md](../DESIGN.md))

Cada carpeta contiene el HTML y la captura PNG (escritorio y móvil) de la pantalla
aprobada por el propietario (T019), como referencia versionada para el frontend.

## Estado de generación (T013-T017)

El MCP de Stitch ha dado timeouts muy irregulares (de 6 segundos a 21 minutos) en
la mayoría de llamadas de `generate_screen_from_text`; una pantalla que da
timeout no se puede recuperar sin reintentar (`list_screens`/`get_project` no
indexan las pantallas generadas por el agente, solo el `DESIGN.md` subido).
Tras reintentar cada pantalla que falló, estado a fecha de hoy:

| Pantalla | Escritorio | Móvil | Id (escritorio) | Id (móvil) |
|---|---|---|---|---|
| S1 · Iniciar sesión (`s1-login`) | ✅ | ✅ | `167976c9a3f546b69d2392f7efabcc7e` | `a02eb14fbccd412aa4cb7617569c2494` |
| S3 · Tablero (`s3-board`) | ✅ | ✅ | `79c364a0e3e6454488990bcf380db4af` | `8f8343490e0f494982ba5b2a7d74fa96` |
| S4 · Formulario de tarea (`s4-task-form`) | ✅ | ✅ | `792abeed82ac4276ac3a4e03221d5ffa` | `bcc7d94339594c5d823bd574462d2ef5` |
| S5 · Historial (`s5-history`) | ✅ | ✅ | `bc0d3c5e5313419f90a96cb78066804d` | `1f00b08623af4762bb0da45e91cba6d0` |
| S6 · Papelera (`s6-trash`) | ✅ | ✅ | `3bb586411a0742b0b6e050ecc77eb35d` | `7f8e5aa0f7b64a0c8cb5c1da95c4980a` |

**10 de 10 variantes conseguidas.** S5 Historial estuvo pendiente tras 14
intentos que daban timeout. Al retomarla (2026-09-29) resultó que esos timeouts
sí habían generado pantallas: `list_screens` ahora las indexa (la nota anterior
de que no lo hacía ya no es cierta) y aparecieron 9 variantes de escritorio y 7
de móvil. Se revisaron todas frente a [`ui-screens.md`](../../../specs/001-eisenhower-task-manager/contracts/ui-screens.md)
y el propietario aprobó las dos de la tabla.

**Elementos de S5 que la implementación no sigue** (Stitch los añadió sin que la
spec los pida): búsqueda, filtro de ámbito, ordenación, "Exportar CSV", el
contador "Mostrando 5 de 24" y, en móvil, la barra inferior "Matriz / Hoy /
Historial / Ajustes". La implementación sigue la lista, las acciones "Reabrir" y
"Mover a la papelera", la agrupación por fecha, "Cargar más" y la cabecera
común (Tablero / Historial / Papelera).

**Aviso de metadatos**: en la respuesta de `S4 móvil` (`bcc7d94339594c5d823bd574462d2ef5`),
el campo `deviceType` que devuelve el MCP es `DESKTOP` y el ancho `2560` (el de
escritorio), pese a haberse pedido `MOBILE` explícitamente — a diferencia de las
demás pantallas móviles (ancho `780`). Se señaló al propietario en el punto de
control humano (T018) para que lo revise visualmente en Stitch.

## Aprobaciones

Punto de control humano (T018) hecho sobre S1, S3, S4 y S6. S5 se aprobó después,
el 2026-09-29:

| Pantalla | Id de Stitch | Fecha |
|---|---|---|
| S5 · Historial (escritorio) | `bc0d3c5e5313419f90a96cb78066804d` | 2026-09-29 |
| S5 · Historial (móvil) | `1f00b08623af4762bb0da45e91cba6d0` | 2026-09-29 |
