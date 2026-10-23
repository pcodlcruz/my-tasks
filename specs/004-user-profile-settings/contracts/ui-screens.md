# Contrato de interfaz: pantallas a diseñar en Stitch

**Feature**: `004-user-profile-settings` | **Decisión**: [research.md § R12](../research.md#r12-diseño-en-stitch) | **Base**: [`specs/001-eisenhower-task-manager/contracts/ui-screens.md`](../../001-eisenhower-task-manager/contracts/ui-screens.md)

Proyecto Stitch «MyTasks» (`projects/13869439670490335529`) y su *design system*. Toda la interfaz
está en **español**. Objetivo de accesibilidad: **WCAG 2.1 AA** en tema claro y en oscuro.

**Regla de versiones (clarificación, FR-028)**: las pantallas aprobadas de la feature 001
(`docs/design/screens/s1-login` … `s6-trash`) **no se modifican ni se borran**. Cada una de las
de abajo se genera como **versión nueva** a partir de la aprobada, y el propietario la aprueba.
Al aprobarla se exporta a `docs/design/screens/` con el sufijo indicado y
`docs/design/screens/README.md` anota cuál es la vigente (identificador de Stitch y fecha).

## Rutas nuevas

| Ruta | Pantalla | Requiere sesión |
|---|---|---|
| `/perfil` | S7 Perfil | Sí (cuenta activa) |

## Cambios comunes a todas las pantallas con cabecera

La **cabecera común** (S3, S4 —que es un diálogo sobre el tablero—, S5, S6 y S7) cambia así:
- A la derecha, **avatar redondo de 32 px + nombre para mostrar** (recortado con puntos
  suspensivos), todo ello un único enlace a «Perfil» con el nombre accesible «Perfil de <nombre>».
- «Cerrar sesión» se mantiene a su lado. En móvil, el nombre se oculta y queda solo el avatar.
- «Perfil» está activo (subrayado de navegación) cuando se está en `/perfil`; no entra en la
  lista de pestañas principales (Tablero / Historial / Papelera).

## Pantallas y versiones a generar

Sufijos de exportación: `-v2` = versión nueva clara con la cabecera nueva; `-dark` = tema
oscuro; `-compact` = densidad compacta. Cada fila se genera en **escritorio y móvil**.

| Id | Pantalla | Versiones | Notas |
|---|---|---|---|
| S1 | Iniciar sesión | `s1-login-dark` | Sin cabecera: solo cambia el tema. La versión clara aprobada sigue vigente. |
| S3 | Tablero | `s3-board-v2`, `s3-board-v2-dark`, `s3-board-v2-compact` | `-compact` en claro basta (la densidad es independiente del tema, FR-009). |
| S4 | Formulario de tarea | `s4-task-form-v2`, `s4-task-form-v2-dark` | Diálogo sobre el tablero con la cabecera nueva detrás. |
| S5 | Historial | `s5-history-v2`, `s5-history-v2-dark` | Incluye el aviso «Mostrando solo los últimos N días · Ver todo» (ver S5). |
| S6 | Papelera | `s6-trash-v2`, `s6-trash-v2-dark` | Solo cambian la cabecera y el tema. |
| S7 | Perfil | `s7-profile`, `s7-profile-dark`, más el selector de avatar y el recortador (ver S7) | Pantalla nueva. |

Total aproximado: 5 pantallas claras con cabecera (S3, S4, S5, S6 más S7) + 6 oscuras (S1, S3, S4,
S5, S6, S7) + 1 compacta (S3) = **12 versiones × 2 dispositivos = 24 generaciones**, más las
dos del recortador. **Orden de prioridad** por si Stitch da timeouts (el MCP es irregular):
S7 claro → S3 `-v2` → S3 oscuro → S7 oscuro → S3 `-compact` → S5 → S4 → S6 → S1.

## Tokens oscuros del *design system*

La paleta oscura se añade a `docs/design/DESIGN.md` y al *design system* de Stitch **sin cambiar
los valores claros**. Cubre los mismos nombres semánticos que `tailwind.config.ts`:
`text`, `text-muted`, `surface`, `surface-alt`, `border`, `primary` (+ `hover`), `error` (+
`surface`), `success`, `disabled` (`bg`, `text`), los cuatro cuadrantes (`accent`, `surface`) y el
ámbito (`work`, `personal`). Reglas de aprobación:
- Texto sobre fondo: ≥ 4,5:1; texto grande, iconos y bordes de controles: ≥ 3:1.
- Los cuadrantes y los ámbitos no se distinguen solo por color (siguen llevando etiqueta).
- Un script de contraste con los pares exactos acompaña a la propuesta, antes de pedir
  aprobación.

## Pantallas

### S3 · Tablero (versión nueva)
- Misma estructura que la aprobada, con la cabecera nueva. El filtro de ámbito se muestra con el
  valor del perfil ya seleccionado al abrir (FR-010).
- **Densidad compacta** (`-compact`): tarjetas con menos relleno y separación vertical, texto de
  la misma tipografía y una zona de pulsación mínima de 32 px de alto. Debe caber al menos un
  25 % más de tareas a la misma altura (SC-005). Se muestra con un cuadrante lleno para
  compararlo con la versión cómoda.

### S5 · Historial (versión nueva)
- Cuando hay un periodo activo (30 o 90 días), una franja bajo el título: «Mostrando solo los
  últimos 30 días» con el enlace «Ver todo». «Ver todo» vale solo para esa visita.
- Sin periodo (todo), no hay franja.

### S7 · Perfil (pantalla nueva)
- Título «Perfil». En escritorio, dos columnas: a la izquierda la identidad (avatar grande de 96
  px, nombre y correo en solo lectura); a la derecha las preferencias. En móvil, una columna.
- **Identidad**
  - Avatar actual con las acciones «Elegir avatar» y «Quitar avatar» (esta última solo si hay
    uno elegido).
  - Campo «Nombre para mostrar» (máx. 50 caracteres, contador), «Guardar» y «Usar el de Google».
    Muestra, en texto auxiliar, el nombre de Google que se usará si se deja en blanco.
- **Apariencia**
  - «Tema»: tres opciones exclusivas «Claro», «Oscuro», «Sistema» (control segmentado con
    iconos y texto).
  - «Densidad»: «Cómoda» / «Compacta», con una miniatura que muestra la diferencia.
- **Tablero e historial**
  - «Tablero por defecto»: «Todas», «Laboral», «Personal».
  - «Orden de las tareas»: «Más antiguas primero», «Más recientes primero» (las fijadas siempre
    arriba, lo dice el texto auxiliar).
  - «Historial»: «Últimos 30 días», «Últimos 90 días», «Todo».
- Pie: «Restablecer valores por defecto» (secundario, con confirmación). El texto auxiliar aclara
  que no cambia el nombre ni el avatar.
- Los cambios se aplican y se guardan al elegirlos (sin botón «Guardar» global, salvo el nombre);
  confirmación breve «Guardado» (`role="status"`); si falla, aviso con «Reintentar» y el control
  vuelve al valor guardado.
- Estados: cargando (esqueleto), error al cargar (aviso; la aplicación sigue con los valores por
  defecto), guardando, guardado, error al guardar.

### S7 · Selector de avatar (diálogo)
- Dos pestañas: «Catálogo» (rejilla de 12 avatares, cada uno con texto alternativo y estado de
  seleccionado visible más allá del color) y «Subir imagen».
- «Subir imagen»: botón «Elegir archivo» y texto «JPEG, PNG o WebP, hasta 2 MB». Tras elegir,
  pasa al recortador.
- **Recortador**: vista previa cuadrada con arrastre y control de zoom (también por teclado),
  vista previa redonda del resultado, «Guardar avatar» y «Cancelar». Errores: tipo no admitido,
  demasiado grande, falla la subida (se conserva el avatar anterior), límite de subidas («Espera
  unos minutos»).
- Estados: sin archivo, procesando, subiendo, error.

## Los 12 avatares del catálogo

Se diseñan junto con S7 y se aprueban como un conjunto: formas y colores neutros (animales o
figuras simples), legibles a 32 px, con contraste suficiente en ambos temas, y sin rostros
reales. Identificadores estables `avatar-01` … `avatar-12` (no cambian aunque se rediseñen).
Cada uno lleva un nombre en español para su texto alternativo (p. ej. «Búho», «Zorro»); el
nombre lo fija el diseño aprobado.

## Fuera de diseño

Las pantallas de la feature 003 (`/admin/access` y «Necesitas una invitación») no se diseñan en
Stitch en esta feature (clarificación). Heredan los tokens oscuros y se verifican con axe en
ambos temas; queda anotado como deuda de diseño.
