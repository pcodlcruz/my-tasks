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

### Aprobaciones de la feature 004 · ronda 2 (2026-10-24)

El propietario aprobó la ronda 2 el 2026-10-24 (T112), al pedir abrir la PR de la Fase 4 tras la
pregunta expresa de si las aprobaba. Son la **pantalla vigente** de cada una; las de la feature 001
siguen intactas como referencia anterior. S5 v2 móvil, S5 oscuro móvil y S4 v2 móvil **no están
exportadas**: el propietario decidió seguir sin ellas, y su maquetación móvil se toma de la versión
clara equivalente y de la S6 móvil exportada.

| Pantalla | Id de Stitch | Carpeta | Vigente para |
|---|---|---|---|
| S5 · Historial v2 (claro, escritorio) | `43b27f2bb78e4982b39910dca9f46903` | `s5-history-v2/desktop.*` | `/historial` |
| S5 · Historial (oscuro, escritorio) | `56afd9bd0c69426e9b47084b1c0dc0c6` | `s5-history-v2-dark/desktop.*` | `/historial` en oscuro |
| S4 · Formulario v2 (claro, escritorio) | `2dcd890bf4f84f87b0f23e4f01315b39` | `s4-task-form-v2/desktop.*` | Formulario de tarea (solo cabecera) |
| S4 · Formulario (oscuro, escritorio) | `5c3ddf048d35439c92ef053db11fbf42` | `s4-task-form-v2-dark/desktop.*` | Formulario en oscuro |
| S4 · Formulario (oscuro, «móvil») | `9036112ceed343cfbc60c7ec2f4bc8dc` | `s4-task-form-v2-dark/mobile.*` | **Solo color** (es un lienzo de escritorio) |
| S6 · Papelera v2 (claro, escritorio y móvil) | `57f85560…` / `5703de30…` | `s6-trash-v2/*` | `/papelera` |
| S6 · Papelera (oscuro, escritorio y móvil) | `32ae6af5…` / `29740550…` | `s6-trash-v2-dark/*` | `/papelera` en oscuro |
| S1 · Iniciar sesión (oscuro, escritorio) | `152e0cebe5114f25acd072fca6b63c84` | `s1-login-dark/desktop.*` | Login en oscuro (con las salvedades de la ronda 1) |
| S1 · Iniciar sesión (oscuro, «móvil») | `50c57f5653944fc8a95276eedf76b4f8` | `s1-login-dark/mobile.*` | **Solo color** (es un lienzo de escritorio) |

## Ronda 2 · selector de avatar y recortador (T113, 2026-10-24)

Las pantallas ya estaban en el lienzo de Stitch (lanzadas el 2026-10-23), así que no se generó nada.
Se exportaron HTML y PNG y se revisaron las capturas. **Pendiente de aprobación del propietario
(T114)**.

| Pantalla | Id de Stitch | Carpeta | Medidas que devuelve Stitch |
|---|---|---|---|
| Selector y recortador (claro, escritorio) | `d8962380a2084a4cb1f1a5a501790c9b` | `s7-avatar-picker/desktop.*` | `DESKTOP`, 2560 px |
| Selector y recortador (claro, «móvil») | `93139ff3f5e545e897924ff1690e7035` (duplicada sin exportar: `c91633b694a9432ca833333f9d40d98c`) | `s7-avatar-picker/mobile.*` | `DESKTOP`, 2560 px ⚠ |
| Selector y recortador (oscuro, escritorio) | `a237bccd3d42414fb94b0d4279388710` | `s7-avatar-picker-dark/desktop.*` | `DESKTOP`, 2560 px |
| Selector y recortador (oscuro, «móvil») | `aac95f69a8db4b19a971be6d0d22d9ab` | `s7-avatar-picker-dark/mobile.*` | `DESKTOP`, 2560 px ⚠ |

**Catálogo de 12 avatares** (se ve en las cuatro): Búho, Zorro, Oso, Gato, Rana, Pingüino, Ballena,
Panda, Conejo, Tortuga, Delfín y Mariposa, en ese orden = `avatar-01` … `avatar-12`. Son ilustraciones
SVG de 64×64 sin rostros reales; el HTML claro las lleva en línea y de ahí salen los ficheros de
`frontend/src/assets/avatars/`.

**Revisión de las capturas**

- El selector tiene dos pestañas, «Catálogo» (rejilla de 12 con el nombre debajo y el seleccionado con
  borde, check y nombre en azul, no solo color) y «Subir imagen» (recortador con zoom, vista previa
  redonda y error de más de 2 MB). La Fase 5 implementa solo «Catálogo»; la subida y el recortador son
  de la Fase 6.
- ⚠ **Las dos «móvil» no son móviles**: Stitch las devuelve como `DESKTOP` a 2560 px (una columna
  estrecha centrada, con la hoja inferior del diálogo). Sirven como referencia de maquetación del
  diálogo en pantalla pequeña (hoja que sube desde abajo, rejilla de 3 columnas), no de medidas.
- **Avatares en oscuro**: el diseño oscuro los **recolorea** (tonos neón sobre un círculo oscuro). La
  implementación usa **un solo juego** (el claro) sobre un círculo claro fijo, de modo que se ven bien
  en ambos temas sin duplicar ilustraciones; los cuatro catálogos son el mismo conjunto de animales.

**Elementos que la implementación no sigue** (Stitch los añade y el contrato no los pide): las
cabeceras y cuadros de «Criterios de accesibilidad / WCAG» y de especificación que rodean al diálogo
(son anotaciones de diseño, no interfaz), el texto «Avatar seleccionado: Búho sabio» y «Listo para
aplicar», y los controles «Girar 90°» y «Arrastra para encuadrar» (de la Fase 6).

### Aprobaciones de la feature 004 · selector de avatar (2026-10-24)

El propietario aprobó el 2026-10-24 (T114) el selector de avatar, el recortador y el catálogo de 12
avatares. Son la **pantalla vigente**; las de la feature 001 siguen intactas como referencia anterior.
La Fase 5 implementó la pestaña «Catálogo»; «Subir imagen» y el recortador, la Fase 6.

| Pantalla | Id de Stitch | Carpeta | Vigente para |
|---|---|---|---|
| Selector y recortador (claro, escritorio) | `d8962380a2084a4cb1f1a5a501790c9b` | `s7-avatar-picker/desktop.*` | Selector de avatar |
| Selector y recortador (claro, «móvil») | `93139ff3f5e545e897924ff1690e7035` | `s7-avatar-picker/mobile.*` | **Solo maquetación en pantalla pequeña** (lienzo de escritorio) |
| Selector y recortador (oscuro, escritorio) | `a237bccd3d42414fb94b0d4279388710` | `s7-avatar-picker-dark/desktop.*` | Selector en oscuro |
| Selector y recortador (oscuro, «móvil») | `aac95f69a8db4b19a971be6d0d22d9ab` | `s7-avatar-picker-dark/mobile.*` | **Solo color** (lienzo de escritorio) |
| Catálogo de 12 avatares | — | `frontend/src/assets/avatars/avatar-01.svg … 12.svg` | Un solo juego (el claro) sobre un círculo claro fijo en ambos temas |

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

*(Histórico, 2026-10-23.)* El resto de pantallas de la ronda 1 y las de la ronda 2 estaban
entonces pendientes; se aprobaron después (T110, T112 y T114, ver las secciones «Aprobaciones»
de más abajo y de arriba). Lo vigente hoy, función por función, está en la última sección de este
fichero.

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

## Resumen de lo vigente de la feature 004 (T104, 2026-10-25)

Qué pantalla manda para cada función. En todos los casos las de la feature 001 siguen intactas
como referencia anterior (FR-028); el detalle (ids de Stitch y carpetas) está en las secciones
«Aprobaciones» de arriba.

| Función | Pantalla vigente | Sección con el detalle |
|---|---|---|
| Tema oscuro (tokens) | Paleta oscura (`DESIGN.md` § Tema oscuro) | Ronda 1 (parcial) |
| Perfil: tema, densidad, tablero por defecto, orden, historial, nombre | S7 · Perfil (claro, escritorio y móvil; oscuro, escritorio) | Ronda 1 (parcial) y 1b |
| Cabecera con avatar y nombre | S3 · Tablero v2 | Ronda 1 (parcial) |
| Tablero (claro, oscuro, móvil) y densidad compacta | S3 · Tablero v2, v2 oscuro y compacto | Ronda 1b |
| Historial, formulario de tarea y papelera (claro y oscuro) | S5, S4 y S6 v2 | Ronda 2 (T112) |
| Inicio de sesión en oscuro | S1 · Iniciar sesión (oscuro) | Ronda 2 (T112) |
| Selector de avatar (catálogo y «Subir imagen») y recortador | S7 · Selector y recortador (claro y oscuro) | Selector de avatar (T114) |

## Feature 007 · pantallas nuevas y versiones (T001, 2026-10-30)

**Fuente**: [specs/007-daily-progress-arcade/contracts/ui-screens.md](../../../specs/007-daily-progress-arcade/contracts/ui-screens.md).
Las pantallas aprobadas de las features 001 y 004 **no se modifican**: cada cambio es una
pantalla nueva (FR-036).

### Bases vigentes de las que parten las versiones nuevas

| Base | Claro, escritorio | Claro, móvil | Oscuro, escritorio | Oscuro, «móvil» |
|---|---|---|---|---|
| S3 · Tablero v2 | `a3f141c47d3946ea9c1466f3916df60d` | `27a7b42bf13c4592a5d665c889b6aebf` | `6229bf994c8446378757eddc823322df` | `76ec68dd342142b5bc86c2c30ea03ddd` (solo color) |
| S3 · Tablero compacto | `963cfc7d68c9445b86f32918d2babb02` | `1ae725edfe09482e94c92d2082c9b04e` | — | — |
| S4 · Formulario v2 (base de S11) | `2dcd890bf4f84f87b0f23e4f01315b39` | `b53dd6d79bd44274ab064dbfa48d17f9` | `5c3ddf048d35439c92ef053db11fbf42` | `9036112ceed343cfbc60c7ec2f4bc8dc` (solo color) |
| S7 · Perfil | `5b4edf53a88f4c5f89c51608ed120c60` | `0b97e3e427874566a38fc843734dc918` | `912d3dc861c84104af22ceb366a9010a` | `2d33b97724904379828180049debbfe6` (solo color) |

### Design systems (T003)

Se usan los dos ya existentes, **sin modificarlos**: `assets/ec957f11ef474eb58336b8af664aaa2e`
(claro, aprobado en la 001) y `assets/16783421015770598561` (oscuro, feature 004). Los tokens
arcade de `DESIGN.md` § Estética arcade **no se añaden a ningún sistema**: Stitch admite un solo
modo de color por sistema, y `update_design_system` recalcula `namedColors` y sube de versión el
sistema (lección de la 004). En su lugar, cada *prompt* de generación lleva los valores exactos
de los tokens arcade y la tipografía «Press Start 2P».

### Registro de generaciones (T004–T010)

`generate_screen_from_text` suele responder con *timeout* y la pantalla aparece igualmente en el
lienzo 45–60 minutos después (feature 004): **no se reintenta**. Se comprueba con `get_screen`
o `get_project` antes de volver a lanzar nada.

| Pantalla | Variante | Id de Stitch | Estado |
|---|---|---|---|
| S3 v3 · Tablero | claro, escritorio | `81117eabaa4646c3abd3f0bb4f5eb94b` | generada; **aprobada (2026-10-31)** |
| S3 v3 · Tablero | claro, móvil | `c897887510c1449ab912c09dee1e50fc` | lienzo `DESKTOP` (1280 px) ⚠: solo color; la maquetación móvil vigente es la de S3 v2 móvil (`27a7b42b…`), por decisión del propietario; **aprobada (2026-10-31)** |
| S3 v3 · Tablero | oscuro, escritorio | `14e9ca5694e14e2c8e87af6ec1c2fc73` | generada; **aprobada (2026-10-31)** |
| S3 v3 · Tablero | oscuro, móvil | `9bc244225a004223bad38caa44671dd7` | lienzo `DESKTOP` ⚠: solo color; **aprobada (2026-10-31)** |
| S3 v3 · Tablero sin modo arcade | claro, escritorio | `aeba00edd3bb4bbca68d96f83fd7928d` | generada; **aprobada (2026-10-31)** |
| S3-c · Celebraciones | claro, escritorio | `a849ae882f33445186187d949d16e599` | generada; **aprobada (2026-10-31)** |
| S3-c · Celebraciones | oscuro, escritorio | `1236b480972045a3b77af91ca42d5cea` | generada; **aprobada (2026-10-31)** |
| S7 v2 · Perfil | claro, escritorio | `6963be246e3c470a917811748108e6fc` | generada; **aprobada (2026-10-31)** |
| S7 v2 · Perfil | claro, móvil | `2f2edf7ef1464aaca6f2b9fb6db91a20` | generada (390 px); **aprobada (2026-10-31)** |
| S7 v2 · Perfil | oscuro, escritorio | `9b76b8f83b8f493f9f6d9c6666bc54ca` | generada; **aprobada (2026-10-31)** |
| S7 v2 · Perfil | oscuro, móvil | `cbd569609d7748e9bd6a0c7992d179f7` | lienzo `DESKTOP` ⚠: solo color; **aprobada (2026-10-31)** |
| S8 · Inicio de jornada | claro, escritorio | `a1322c6444844c428bb3a188421d79dc` | generada; **aprobada (2026-10-31)** |
| S8 · Inicio de jornada | claro, móvil | `a074bb8078344b23b0764adcd8e27684` | generada (390 px); **aprobada (2026-10-31)** |
| S8 · Inicio de jornada | oscuro, escritorio | `0b1585100994409ebb5074538bbb6242` | generada; **aprobada (2026-10-31)** |
| S8 · Inicio de jornada | oscuro, móvil | `fa5ff90879914845befe6838e0024e8e` | lienzo `DESKTOP` ⚠: solo color; **aprobada (2026-10-31)** |
| S9 · Progreso | claro, escritorio | `64ea9d11db404202a2932956249fd826` | generada; **aprobada (2026-10-31)** |
| S9 · Progreso | claro, móvil | `4c3d0611a3b343a18411cf8802daa389` | generada (390 px); **aprobada (2026-10-31)** |
| S9 · Progreso | oscuro, escritorio | `13eae85e91884f869ae0d46ed598d598` | generada; **aprobada (2026-10-31)** |
| S10 · Tareas programadas | claro, escritorio | `e54daa11eee144b0ad4b3ef1e902b305` | generada (incluye el diálogo de eliminar); **aprobada (2026-10-31)** |
| S10 · Tareas programadas | claro, móvil | `e5cd17d754364db88d5e3ea4fe744aec` | generada (390 px, incluye el estado vacío); **aprobada (2026-10-31)** |
| S10 · Tareas programadas | oscuro, escritorio | `ffb027706df54057a8939489a0f54b56` | generada; **aprobada (2026-10-31)** |
| S11 · Formulario de programación | claro, escritorio | `d7fd20eb7f5d4e13838b763446b8b698` | generada (días de la semana, error en línea); **aprobada (2026-10-31)** |
| S11 · Formulario de programación | claro, móvil | `6e642b45ac624bc791963c50f74b7193` | generada (390 px, día 31); **aprobada (2026-10-31)** |
| S11 · Formulario de programación | oscuro, escritorio | `e010f309c1934c698114b746ca98163a` | generada; **aprobada (2026-10-31)** |

Las variantes **móviles oscuras** de S9, S10 y S11 no se generan aparte: en la feature 004 Stitch
devolvía esas variantes como lienzo de escritorio. Valen como **solo color** la oscura de
escritorio sobre la maquetación de la móvil clara, igual que en la 004. Los estados «PARTIDA
NUEVA» y «sin tareas activas» de S8 y el estado vacío de S9 se implementan a partir del contrato
(`ui-screens.md`), salvo que el propietario pida pantalla propia en el punto de control.

**Estado (2026-10-31)**: las 24 pantallas, **aprobadas por el propietario en una sola ronda**
(T012) y exportadas a `docs/design/screens/` (T011).

**Salvedades**:
- **S3 v3 claro móvil** salió como lienzo de escritorio (1280 px), igual que las móviles oscuras.
  Por decisión del propietario no se regenera: la maquetación móvil vigente del tablero es la de
  S3 v2 móvil (`27a7b42b…`) con el marcador compacto en dos filas que describe `ui-screens.md`, y
  `s3-board-v3/mobile.*` vale solo como referencia de color y contenido.

### Pantallas vigentes exportadas (T011, T013)

| Carpeta | Pantalla | Ficheros |
|---|---|---|
| [`s3-board-v3/`](s3-board-v3/) | S3 v3 · Tablero, claro | `desktop`, `mobile` (solo color) |
| [`s3-board-v3-dark/`](s3-board-v3-dark/) | S3 v3 · Tablero, oscuro | `desktop`, `mobile` (solo color) |
| [`s3-board-v3-no-arcade/`](s3-board-v3-no-arcade/) | S3 v3 · Tablero sin modo arcade | `desktop` |
| [`s3c-celebrations/`](s3c-celebrations/) | S3-c · Celebraciones, claro | `desktop` |
| [`s3c-celebrations-dark/`](s3c-celebrations-dark/) | S3-c · Celebraciones, oscuro | `desktop` |
| [`s7-profile-v2/`](s7-profile-v2/) | S7 v2 · Perfil, claro | `desktop`, `mobile` |
| [`s7-profile-v2-dark/`](s7-profile-v2-dark/) | S7 v2 · Perfil, oscuro | `desktop`, `mobile` (solo color) |
| [`s8-day-start/`](s8-day-start/) | S8 · Inicio de jornada, claro | `desktop`, `mobile` |
| [`s8-day-start-dark/`](s8-day-start-dark/) | S8 · Inicio de jornada, oscuro | `desktop`, `mobile` (solo color) |
| [`s9-progress/`](s9-progress/) | S9 · Progreso, claro | `desktop`, `mobile` |
| [`s9-progress-dark/`](s9-progress-dark/) | S9 · Progreso, oscuro | `desktop` |
| [`s10-schedules/`](s10-schedules/) | S10 · Tareas programadas, claro | `desktop`, `mobile` |
| [`s10-schedules-dark/`](s10-schedules-dark/) | S10 · Tareas programadas, oscuro | `desktop` |
| [`s11-schedule-form/`](s11-schedule-form/) | S11 · Formulario de programación, claro | `desktop`, `mobile` |
| [`s11-schedule-form-dark/`](s11-schedule-form-dark/) | S11 · Formulario de programación, oscuro | `desktop` |

Cada variante tiene su `.html` y su `.png`. Las pantallas aprobadas de las features 001 y 004
siguen intactas.

**Cómo se exportaron**: las URLs de descarga de `get_screen` (`stitch.googleapis.com`) exigen un
token OAuth (no admiten claves de API) y un proyecto de cuota con la API de Stitch habilitada, y
devuelven el fichero dentro de un JSON (`dataString`). `download_file` del MCP mete el contenido en
la conversación, lo que no es viable para 48 ficheros. Por eso el propietario ejecutó
[`../export-stitch.py`](../export-stitch.py) en su terminal, con su propio token: el agente no usa
credenciales personales (Principio V). Para exportar más pantallas, se añaden sus ids de fichero
(los `htmlCode.name` y `screenshot.name` de `get_screen`) a la lista `EXPORTS` del script.

## Resumen de lo vigente de la feature 007 (T117, 2026-11-01)

Qué pantalla manda para cada función de la feature 007. Las versiones nuevas sustituyen a las de
las features 001 y 004 en lo que cambian, que siguen intactas como referencia anterior (FR-036);
el detalle (ids de Stitch) está en «Registro de generaciones» y las carpetas, en «Pantallas
vigentes exportadas».

| Función | Pantalla vigente | Carpeta |
|---|---|---|
| Tablero con marcador del día y cabecera con la pestaña «Progreso» | S3 v3 · Tablero (claro y oscuro; móvil: maquetación de S3 v2 móvil con los colores de v3) | `s3-board-v3/`, `s3-board-v3-dark/` |
| Tablero con el modo arcade desactivado | S3 v3 · Tablero sin modo arcade | `s3-board-v3-no-arcade/` |
| Celebraciones (fase, misión, nivel, logro y récord) | S3-c · Celebraciones | `s3c-celebrations/`, `s3c-celebrations-dark/` |
| Perfil con meta diaria, días activos, inicio de jornada y modo arcade | S7 v2 · Perfil (sustituye a S7) | `s7-profile-v2/`, `s7-profile-v2-dark/` |
| Inicio de jornada y selector de la misión del día | S8 · Inicio de jornada | `s8-day-start/`, `s8-day-start-dark/` |
| Historial de progreso, estadísticas y sala de trofeos | S9 · Progreso | `s9-progress/`, `s9-progress-dark/` |
| Lista de tareas programadas y diálogo de eliminar | S10 · Tareas programadas | `s10-schedules/`, `s10-schedules-dark/` |
| Crear y editar una programación | S11 · Formulario de programación (parte de S4 v2) | `s11-schedule-form/`, `s11-schedule-form-dark/` |

Siguen vigentes sin cambios, de la feature 004: S1 (inicio de sesión), S4 (formulario de tarea),
S5 (historial), S6 (papelera) y el selector de avatar con su recortador.

Los estados «PARTIDA NUEVA» y «sin tareas activas» de S8, y el estado vacío de S9, no tienen
pantalla propia: se implementan desde el contrato (`specs/007-daily-progress-arcade/contracts/ui-screens.md`).
Las variantes móviles oscuras valen como **solo color**.
