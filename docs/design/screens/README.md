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

---

# Feature 004 · versiones nuevas (perfil, tema oscuro, densidad compacta)

**Fuente**: [specs/004-user-profile-settings/contracts/ui-screens.md](../../../specs/004-user-profile-settings/contracts/ui-screens.md).
Las pantallas aprobadas de la feature 001 (tabla de arriba) **no se modifican ni se borran**
(FR-028): cada cambio es una versión nueva, y esta sección registra cuál es la **vigente** una
vez que el propietario la aprueba (T013, T014).

## Línea base (T001, 2026-10-23)

Proyecto Stitch `projects/13869439670490335529` comprobado con `get_project` y `list_screens`.

| Pantalla aprobada (001) | Escritorio | Móvil |
|---|---|---|
| S1 · Iniciar sesión | `167976c9a3f546b69d2392f7efabcc7e` | `a02eb14fbccd412aa4cb7617569c2494` |
| S3 · Tablero | `79c364a0e3e6454488990bcf380db4af` | `8f8343490e0f494982ba5b2a7d74fa96` |
| S4 · Formulario de tarea | `792abeed82ac4276ac3a4e03221d5ffa` | `bcc7d94339594c5d823bd574462d2ef5` |
| S5 · Historial | `bc0d3c5e5313419f90a96cb78066804d` | `1f00b08623af4762bb0da45e91cba6d0` |
| S6 · Papelera | `3bb586411a0742b0b6e050ecc77eb35d` | `7f8e5aa0f7b64a0c8cb5c1da95c4980a` |

## Design systems (T003)

| Sistema | Asset | Modo | Estado |
|---|---|---|---|
| Gestor Personal de Tareas (aprobado en la 001) | `assets/ec957f11ef474eb58336b8af664aaa2e` | Claro | **Sin cambios** (versión 1) |
| Gestor Personal de Tareas (oscuro) | `assets/16783421015770598561` | Oscuro | Nuevo, 2026-10-23, pendiente de aprobación |

Stitch admite un único modo de color por *design system*, así que `update_design_system` sobre el
aprobado lo habría convertido en oscuro. Se creó un asset aparte con la paleta de
[`../DESIGN.md`](../DESIGN.md) (§ Tema oscuro), validada con
[`../check-contrast.py`](../check-contrast.py): 0 pares por debajo de AA en ambos temas.

**Observación**: el `designMd` del sistema claro de Stitch aún lleva `scope-personal: #0D9488`;
el repositorio ya usa `#0F766E` desde el hallazgo de axe en T105 de la 001. No afecta a esta
feature; queda como deuda de sincronización.

## Estado de generación (feature 004, 2026-10-23)

El MCP de Stitch devuelve «The operation timed out.» en `generate_screen_from_text`, pero **la
pantalla se genera igualmente y aparece en `list_screens` pasados unos 20-30 minutos** (no se
indexa en `get_project`). No hay que reintentar tras un timeout: se espera y se consulta
`list_screens`. Cada reintento crea una pantalla duplicada.

| Pantalla nueva | Escritorio | Móvil | Estado |
|---|---|---|---|
| S7 · Perfil (claro) | `5b4edf53a88f4c5f89c51608ed120c60` (elegida) · duplicada: `96712ae42b4c4ee88f469bd68b921fb2` | lanzada, pendiente de indexar | Generada; ver desviaciones |
| S7 · Perfil (oscuro) | lanzada, pendiente de indexar | — | Pendiente |

**Desviaciones de S7 escritorio respecto de `contracts/ui-screens.md`** (a corregir con
`edit_screens` antes del punto de control T013):

- Texto «JPG, PNG o SVG. Tamaño recomendado de 256×256px» bajo el avatar: debe decir «JPEG, PNG o
  WebP, hasta 2 MB» (o no aparecer en esta pantalla, porque el formato se explica en el selector).
- Asterisco de obligatorio en «Nombre para mostrar»: el nombre es opcional.
- Texto inventado «Administrado a través de Google Workspace…» bajo el correo: quitarlo.
- Insignia «Usuario activo» y «Cuenta Google vinculada»: no están en el contrato; quitar la primera.
- Pie de página con «Privacidad · Términos · Ayuda»: el resto de pantallas aprobadas lo llevan, así
  que se deja.
- Los grupos de opciones usan `role="radiogroup"` y `aria-checked`, y marcan la opción elegida con
  borde, fondo y un icono de check: cumple el contrato.

**Observación de `generate_variants`**: respondió al instante con operaciones DOM sobre la S3
aprobada (`79c364a0…`), pero el HTML de esa pantalla sigue intacto (verificado con `download_file`).
No se localizó todavía la pantalla resultante; no usar `edit_screens` sobre las aprobadas (FR-028).

**Exportación de capturas**: las URL de `screenshot.downloadUrl` (`lh3.googleusercontent.com`) se
descargan con `curl` desde el sandbox añadiendo ese dominio a `allowed_domains`; los HTML hay que
traerlos con `download_file`.
