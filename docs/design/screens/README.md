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

## Registro de generaciones (feature 004)

Estado a 2026-10-23, tras la segunda tanda. «Pendiente» = lanzada, aún sin aparecer en
`list_screens`. El catálogo de 12 avatares (T005) se diseña **dentro** del selector de avatar
(estado A), en claro y oscuro, en lugar de como pantalla aparte.

| Pantalla | Escritorio | Móvil |
|---|---|---|
| S7 Perfil (claro) | `5b4edf53a88f4c5f89c51608ed120c60` (elegida; otras: `96712ae42b4c4ee88f469bd68b921fb2`, `52fa7e5212014ed1bf93978b520e4587`) | `0b97e3e427874566a38fc843734dc918` |
| S7 Perfil (oscuro) | `912d3dc861c84104af22ceb366a9010a` | pendiente |
| S7 Selector de avatar y recortador (claro) | pendiente | pendiente |
| S7 Selector de avatar y recortador (oscuro) | pendiente | pendiente |
| S3 Tablero v2 (claro) | `a3f141c47d3946ea9c1466f3916df60d` | pendiente |
| S3 Tablero v2 (oscuro) | pendiente | pendiente |
| S3 Tablero compacto (claro) | pendiente | pendiente |
| S5 Historial v2 (claro / oscuro) | pendiente / pendiente | pendiente / pendiente |
| S4 Formulario v2 (claro / oscuro) | pendiente / pendiente | pendiente / pendiente |
| S6 Papelera v2 (claro / oscuro) | pendiente / pendiente | pendiente / pendiente |
| S1 Iniciar sesión (oscuro) | `152e0cebe5114f25acd072fca6b63c84` | pendiente |

**Hallazgo sobre el *design system* oscuro**: tras generar una pantalla con él, Stitch lo pasó a la
versión 2 y recalculó su `namedColors` (p. ej. fondo `#081425` en lugar de `#0F172A`). El texto de
`styleGuidelines` y los tokens de `designMd` siguen siendo los nuestros, pero conviene comprobar en
cada captura oscura que los colores efectivos son los de `DESIGN.md`.

**Desviaciones detectadas en S1 oscuro (escritorio)**: añade una insignia de «conexión cifrada
OAuth 2.0» y una miniatura de los cuatro cuadrantes que el contrato no pide; quitarlas.

## Ronda 2 · pantallas pendientes de la Fase 4 (T111, 2026-10-24)

Todas estaban ya en el lienzo de Stitch (se lanzaron el 2026-10-23 y aparecieron después), así que no se
generó nada nuevo y no hay duplicados. Se exportaron HTML y PNG de las que `curl` puede descargar y se
revisaron las capturas. **Pendiente de aprobación del propietario (T112)**.

| Pantalla | Id de Stitch | Carpeta | Medidas que devuelve Stitch |
|---|---|---|---|
| S5 · Historial v2 (claro, escritorio) | `43b27f2bb78e4982b39910dca9f46903` | `s5-history-v2/desktop.*` | `DESKTOP`, 2560 px |
| S5 · Historial v2 (claro, móvil) | `02b65e7b138e4cc1beea18e01993292c` | **sin exportar** (ver abajo) | `MOBILE`, 780 px |
| S5 · Historial (oscuro, escritorio) | `56afd9bd0c69426e9b47084b1c0dc0c6` | `s5-history-v2-dark/desktop.*` | `DESKTOP`, 2560 px |
| S5 · Historial (oscuro, móvil) | `a8412c73843f4eb189a2efa521777f07` | **sin exportar** (ver abajo) | `MOBILE`, 780 px |
| S4 · Formulario v2 (claro, escritorio) | `2dcd890bf4f84f87b0f23e4f01315b39` | `s4-task-form-v2/desktop.*` | `DESKTOP`, 2560 px |
| S4 · Formulario v2 (claro, móvil) | `b53dd6d79bd44274ab064dbfa48d17f9` | **sin exportar** (ver abajo) | `MOBILE`, 780 px |
| S4 · Formulario (oscuro, escritorio) | `5c3ddf048d35439c92ef053db11fbf42` | `s4-task-form-v2-dark/desktop.*` | `DESKTOP`, 2560 px |
| S4 · Formulario (oscuro, «móvil») | `9036112ceed343cfbc60c7ec2f4bc8dc` | `s4-task-form-v2-dark/mobile.*` | `DESKTOP`, 2560 px ⚠ |
| S6 · Papelera v2 (claro, escritorio) | `57f85560a02442e6857f5bdce6805933` | `s6-trash-v2/desktop.*` | `DESKTOP`, 2560 px |
| S6 · Papelera v2 (claro, móvil) | `5703de30316e416c99da070be4efc6bb` | `s6-trash-v2/mobile.*` | `MOBILE`, 780 px |
| S6 · Papelera (oscuro, escritorio) | `32ae6af59a9948eeb3136b041eac7e04` | `s6-trash-v2-dark/desktop.*` | `DESKTOP`, 2560 px |
| S6 · Papelera (oscuro, móvil) | `297405506fc44ed7b64c2dd4467f15a0` | `s6-trash-v2-dark/mobile.*` | `MOBILE`, 780 px |
| S1 · Iniciar sesión (oscuro, escritorio) | `152e0cebe5114f25acd072fca6b63c84` | `s1-login-dark/desktop.*` | `DESKTOP`, 2560 px |
| S1 · Iniciar sesión (oscuro, «móvil») | `50c57f5653944fc8a95276eedf76b4f8` | `s1-login-dark/mobile.*` | `DESKTOP`, 2560 px ⚠ |

**No exportadas**: S5 v2 móvil, S5 oscuro móvil y S4 v2 móvil. Para esas tres `get_screen` devuelve
URLs de `stitch.googleapis.com` que exigen credenciales (401), y `download_file` entrega la imagen
dentro de la conversación (más de 300 000 caracteres), sin poder guardarla como fichero. **Hay que
exportarlas a mano desde Stitch** (HTML y PNG) a `s5-history-v2/mobile.*`, `s5-history-v2-dark/mobile.*`
y `s4-task-form-v2/mobile.*`, y tampoco se han podido revisar visualmente.

**Revisión de las capturas exportadas**

- **S5 (escritorio, claro y oscuro)**: lleva la franja «Mostrando solo los últimos 30 días · Ver todo»
  bajo el título, como pide el contrato. El oscuro respeta la paleta de [`../DESIGN.md`](../DESIGN.md).
- **S4 (escritorio, claro y oscuro)**: diálogo «Nueva tarea» sobre el tablero con la cabecera nueva
  detrás; los dos temas son legibles y el error «Elige un ámbito» no se distingue solo por color.
- **S6 y S1**: cabecera nueva y tema oscuro correctos.
- ⚠ **Las «móvil» oscuras de S4 y S1 no son móviles**: Stitch las devuelve como `DESKTOP` a 2560 px (la
  misma rareza de la ronda 1b). Sirven solo como referencia de color; la maquetación móvil es la de la
  versión clara con los tokens oscuros. S5 oscuro móvil y S6 oscuro móvil sí son móviles reales.

**Elementos que la implementación no sigue** (Stitch los añade y el contrato no los pide; en S4, S5
y S6 el contrato solo cambia la cabecera, el tema y, en S5, la franja de periodo):

- **S5**: búsqueda, filtro de ámbito, ordenación, «Exportar CSV», contadores, el bloque «Vista previa
  del estado vacío (Empty State)» con la etiqueta «Referencia visual», y la barra inferior móvil.
- **S6**: búsqueda, filtro de ámbito, «Ordenar por: Tiempo restante», «Vaciar papelera», las insignias
  «Cuadrante …», «Activa»/«Completada» y la barra inferior móvil.
- **S4**: la presentación de urgente/importante como interruptores, el recuadro «Destino previsto» y
  los textos de ayuda nuevos; el formulario conserva el contenido y los controles actuales.
- **S1 oscuro**: la insignia «Sistema seguro • OAuth 2.0», la leyenda de los cuatro cuadrantes y la
  línea «Autenticación directa sin contraseñas» (ya anotado en la ronda 1).

## Punto de control en dos rondas (decisión del propietario, 2026-10-23)

Stitch tarda unos 45-60 minutos en colocar cada pantalla (28 en total), así que el punto de
control se divide:

- **Ronda 1** (desbloquea las Fases 2 y 3): S7 Perfil (claro y oscuro), S3 `-v2` (claro y oscuro) y
  S3 compacto, en escritorio y móvil: **10 pantallas**, más la paleta oscura.
- **Ronda 2** (antes de las Fases 4 y 5): S1 oscuro, S4, S5 y S6 en claro y oscuro, y el selector de
  avatar con recortador (claro y oscuro). Siguen generándose en segundo plano.

| Ronda 1 | Escritorio | Móvil |
|---|---|---|
| S7 Perfil (claro) | `5b4edf53a88f4c5f89c51608ed120c60` (corregida) | `0b97e3e427874566a38fc843734dc918` |
| S7 Perfil (oscuro) | `912d3dc861c84104af22ceb366a9010a` (corregida) | pendiente |
| S3 Tablero v2 (claro) | `a3f141c47d3946ea9c1466f3916df60d` | pendiente |
| S3 Tablero v2 (oscuro) | pendiente | pendiente |
| S3 Tablero compacto (claro) | pendiente | pendiente |

## Aprobaciones de la feature 004 · ronda 1 (parcial)

El propietario aceptó el 2026-10-23 los diseños existentes en ese momento. Son la **pantalla
vigente** de cada una; las aprobadas de la feature 001 siguen intactas como referencia anterior.

| Pantalla | Id de Stitch | Carpeta | Vigente para |
|---|---|---|---|
| Paleta oscura | `assets/16783421015770598561` | [`../DESIGN.md`](../DESIGN.md) § Tema oscuro | Tokens del tema oscuro |
| S7 · Perfil (claro, escritorio) | `5b4edf53a88f4c5f89c51608ed120c60` | `s7-profile/desktop.*` | `/perfil` |
| S7 · Perfil (claro, móvil) | `0b97e3e427874566a38fc843734dc918` | `s7-profile/mobile.*` | `/perfil` en móvil |
| S7 · Perfil (oscuro, escritorio) | `912d3dc861c84104af22ceb366a9010a` | `s7-profile-dark/desktop.*` | `/perfil` en oscuro |
| S3 · Tablero v2 (claro, escritorio) | `a3f141c47d3946ea9c1466f3916df60d` | `s3-board-v2/desktop.*` | Cabecera nueva del tablero (también la de S4, S5 y S6 hasta que tengan versión propia) |
| S1 · Iniciar sesión (oscuro, escritorio) | `152e0cebe5114f25acd072fca6b63c84` | no exportada todavía | Tema oscuro del login (con las salvedades de abajo) |

El resto de pantallas de la ronda 1 y las de la ronda 2 siguen pendientes (tareas T109 a T114 de
[`tasks.md`](../../../specs/004-user-profile-settings/tasks.md)). **Hasta que se aprueben, siguen
vigentes las pantallas de la 001** (por ejemplo, el tablero móvil).

### Elementos de las pantallas aprobadas que la implementación **no** sigue

Stitch añadió elementos que el contrato no pide, y `edit_screens` los quitó en su lienzo pero **no**
en el HTML ni en la captura exportables (el fichero conserva la versión original). La implementación
sigue [`contracts/ui-screens.md`](../../../specs/004-user-profile-settings/contracts/ui-screens.md) y no esto:

- **S7 (claro y oscuro)**: el texto «JPG, PNG o SVG. Tamaño recomendado de 256×256px» bajo el avatar
  (los formatos válidos son JPEG, PNG y WebP hasta 2 MB, y se explican en el selector); el asterisco
  de obligatorio en «Nombre para mostrar» (es opcional); el párrafo «Administrado a través de Google
  Workspace…» bajo el correo; y las insignias «Usuario activo», «Cuenta activa» y «Cuenta Google
  vinculada».
- **S7 oscuro (escritorio)**: el avatar es un cuadrado redondeado en el HTML; la implementación lo
  hace **circular**, como el contrato. Los textos secundarios usan `#94A3B8` y los bordes `#334155`:
  la implementación usa los tokens de [`DESIGN.md`](../DESIGN.md) (`#CBD5E1` y `#475569`).
- **S7 móvil**: la barra de navegación inferior «Matriz / Hoy / Historial / Ajustes» (heredada de la
  S3 móvil aprobada, que la implementación tampoco sigue). Se mantiene la cabecera común.
- **S3 v2**: el HTML pinta el enlace de perfil como `<button>`; la implementación lo hace un enlace
  a `/perfil`. Las fechas límite y «Delegado a» de las tarjetas son de ejemplo de la 001 y no
  existen en el modelo de tareas.
- **S1 oscuro**: la insignia «Sistema seguro • OAuth 2.0», la leyenda de los cuatro cuadrantes y la
  línea «Autenticación directa sin contraseñas».

### Observaciones sobre las herramientas

- `edit_screens` modifica la pantalla en el lienzo de Stitch pero no actualiza los ficheros que
  entrega `get_screen`/`download_file`: para corregir una pantalla hay que regenerarla.
- Las capturas exportadas (`desktop.png`, `mobile.png`) son las de 2560 px (escritorio) y 780 px
  (móvil) que entrega Stitch.

## Ronda 1b · pantallas pendientes de la Fase 3 (T109, 2026-10-24)

Stitch colocó en el lienzo las seis pantallas lanzadas el 2026-10-23 (ninguna se reintentó, así que no
hay duplicados). Se exportaron HTML y PNG y se revisaron las capturas. **Pendiente de aprobación del
propietario (T110)**: hasta entonces siguen vigentes las pantallas de la 001 para esos casos.

| Pantalla | Id de Stitch | Carpeta | Medidas que devuelve Stitch |
|---|---|---|---|
| S3 · Tablero v2 (claro, móvil) | `27a7b42bf13c4592a5d665c889b6aebf` | `s3-board-v2/mobile.*` | `MOBILE`, 780 px |
| S3 · Tablero v2 (oscuro, escritorio) | `6229bf994c8446378757eddc823322df` | `s3-board-v2-dark/desktop.*` | `DESKTOP`, 2560 px |
| S3 · Tablero v2 (oscuro, «móvil») | `76ec68dd342142b5bc86c2c30ea03ddd` | `s3-board-v2-dark/mobile.*` | `DESKTOP`, 2560 px ⚠ |
| S3 · Tablero compacto (claro, escritorio) | `963cfc7d68c9445b86f32918d2babb02` | `s3-board-compact/desktop.*` | `DESKTOP`, 2560 px |
| S3 · Tablero compacto (claro, móvil) | `1ae725edfe09482e94c92d2082c9b04e` | `s3-board-compact/mobile.*` | `MOBILE`, 780 px |
| S7 · Perfil (oscuro, «móvil») | `2d33b97724904379828180049debbfe6` | `s7-profile-dark/mobile.*` | `DESKTOP`, 2560 px ⚠ |

**Revisión de las capturas**

- **S3 compacto (SC-005)**: las filas miden unos 32 px frente a unos 60 px de la cómoda; en la misma
  altura de pantalla caben unas 17 tareas frente a 7 (los datos de ejemplo no son idénticos, pero la
  diferencia de altura de fila supera con holgura el 25 %). En móvil también caben más tareas y se
  ven los cuatro cuadrantes.
- **S3 oscuro (escritorio)**: respeta la paleta de [`../DESIGN.md`](../DESIGN.md) (§ Tema oscuro):
  fondos de cuadrante tintados, acentos legibles y la etiqueta de texto en cada cuadrante.
- ⚠ **Las dos «móvil» oscuras no son móviles**: Stitch las devuelve como `DESKTOP` a 2560 px (la
  misma rareza que ya tuvo S4 móvil en la 001). Son una columna estrecha centrada sobre un lienzo de
  escritorio, y la barra inferior aparece flotando a mitad de pantalla. **Sirven solo como referencia
  de color**; la maquetación móvil oscura es la de la móvil clara (S3 v2 móvil, S7 móvil) con los
  tokens oscuros. Si el propietario quiere una referencia móvil oscura fiel, hay que regenerarlas.

**Elementos que la implementación no sigue** (los añade Stitch y el contrato no los pide):

- La barra de navegación inferior «Tablero / Historial / Papelera» (y «Matriz / Hoy / Historial /
  Ajustes» en versiones anteriores): la implementación mantiene la cabecera común.
- Las fechas límite, «Delegado a» y el texto «Vista compacta» / la insignia «Compacto» de S3
  compacto: no existen en el modelo de tareas; el modo compacto no muestra ninguna insignia.
- El enlace de perfil pintado como botón: es un enlace a `/perfil`.

### Aprobaciones de la feature 004 · ronda 1b (2026-10-24)

El propietario aprobó el 2026-10-24 las seis pantallas de la ronda 1b (T110). Son la **pantalla
vigente** de cada una; las de la feature 001 siguen intactas como referencia anterior.

| Pantalla | Id de Stitch | Carpeta | Vigente para |
|---|---|---|---|
| S3 · Tablero v2 (claro, móvil) | `27a7b42bf13c4592a5d665c889b6aebf` | `s3-board-v2/mobile.*` | Tablero en móvil |
| S3 · Tablero v2 (oscuro, escritorio) | `6229bf994c8446378757eddc823322df` | `s3-board-v2-dark/desktop.*` | Tablero en oscuro |
| S3 · Tablero v2 (oscuro, «móvil») | `76ec68dd342142b5bc86c2c30ea03ddd` | `s3-board-v2-dark/mobile.*` | **Solo color**: Stitch la devolvió como `DESKTOP`; la maquetación móvil oscura es la de S3 v2 móvil con los tokens oscuros |
| S3 · Tablero compacto (claro, escritorio) | `963cfc7d68c9445b86f32918d2babb02` | `s3-board-compact/desktop.*` | Densidad compacta |
| S3 · Tablero compacto (claro, móvil) | `1ae725edfe09482e94c92d2082c9b04e` | `s3-board-compact/mobile.*` | Densidad compacta en móvil |
| S7 · Perfil (oscuro, «móvil») | `2d33b97724904379828180049debbfe6` | `s7-profile-dark/mobile.*` | **Solo color**: misma salvedad; la maquetación es la de S7 móvil claro |

Los elementos que la implementación no sigue (barra inferior, fechas y «Delegado a» de ejemplo,
insignia «Compacto», enlace de perfil como botón) son los de la sección anterior.
