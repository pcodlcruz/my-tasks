# Contrato de interfaz — textos y lugares de la marca

La feature no expone API. Su único «contrato» es lo que ve la persona usuaria, que los tests comprueban. Valores públicos.

## Textos exactos

| Qué | Texto |
|---|---|
| Nombre | `InsertTasks` |
| Mensaje de propósito (solo inicio de sesión) | `Inserta tus tareas y prioriza lo que importa` |
| Bienvenida del tablero vacío | `¡Bienvenido a InsertTasks!` |
| Acceso denegado | `InsertTasks es una aplicación privada. Pide al administrador que te invite con tu cuenta de Google y vuelve a entrar.` (el encabezado «Necesitas una invitación» no cambia) |
| Título de la pestaña | `InsertTasks` |

## Dónde aparece el logo

| Pantalla | Logo | Nombre | Mensaje |
|---|---|---|---|
| Inicio de sesión | Sí, encima del nombre | Sí (encabezado) | Sí, bajo el nombre; sustituye a «Organiza tus tareas con la matriz de Eisenhower» |
| Cabecera de las pantallas con sesión (tablero, historial, papelera, perfil, accesos) | **No** (decisión del 2026-10-28: la insignia no se lee a ese tamaño) | Sí | No |
| Acceso denegado | Sí, encima del encabezado | En el texto | No |
| Pestaña del navegador | **No**: se mantiene el `favicon.svg` actual (decisión del 2026-10-28) | Sí, como título | No |
| Resto (formularios, diálogos, historial, papelera...) | No | No | No |

## Reglas de presentación

- Donde el logo va junto al texto del nombre es **decorativo** (`alt=""`): el nombre se anuncia una sola vez (FR-006).
- El logo es la insignia completa y se muestra siempre grande (~176 px de ancho): un único tamaño, sin variante pequeña.
- El logo tiene **tamaño fijo** antes de cargar (sin saltos, SC-004) y, si no carga, el nombre sigue visible (FR-007).
- Una sola imagen sirve en los dos temas; si no, hay una variante alternada por `data-theme` (research R5).
- En 360 px de ancho, ni el logo ni el nombre empujan fuera de la vista el botón de inicio de sesión ni solapan las acciones de la cabecera.
- «MyTasks» no aparece en ningún texto visible (SC-001).
