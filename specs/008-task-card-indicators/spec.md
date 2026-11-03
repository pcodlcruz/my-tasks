# Feature Specification: Indicadores compactos en la tarjeta de tarea

**Feature Branch**: `feature/008-task-card-indicators`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Quiero que modifiquemos como se ven las indicaciones de \"tarea programada\" y \"mision del día\" en una ficha de tarea dentro del tablón. Se ven de tal manera que se agolpan las opciones superponiéndose unas a otras. Quizás podíamos plantearlo mas como dos iconos en vez del texto completo. Piensa alternativas"

## Contexto

La feature 007 añadió a la tarjeta de tarea del tablero dos marcas de texto: «Programada» (con
«· Pendiente desde el …» si la aparición ya pasó) y «★ Misión del día». Hoy comparten la fila
superior de la tarjeta con el título y con cuatro acciones de texto («Fijar/Desfijar», «Editar»,
«Añadir a la misión/Quitar de la misión», «Mover a la papelera»). En los cuadrantes estrechos
(la matriz 2×2 en escritorio, el modo compacto y el móvil) los elementos no caben, se apelotonan y
llegan a solaparse, de modo que el título y las acciones se leen mal.

### Alternativas consideradas

| # | Alternativa | A favor | En contra |
|---|---|---|---|
| A | **Iconos junto al título**, igual que la chincheta de «Fijada»: un icono de calendario (programada) y una estrella dorada (misión), con nombre accesible y tooltip con el texto completo. | Ocupa lo mínimo; coherente con la chincheta; deja la fila de acciones libre. | El significado del icono se aprende (se mitiga con el tooltip y el nombre accesible). |
| B | **Chips en el pie**, junto a la etiqueta de ámbito (Trabajo/Personal): «📅 Programada» y «★ Misión» como insignias pequeñas. | Se mantiene el texto; el pie tiene sitio libre. | Sigue ocupando más que un icono; en compacto el pie comparte fila con el título. |
| C | **Fila de metadatos propia** bajo el título, con los indicadores y «Pendiente desde…». | Nunca choca con las acciones; admite texto completo. | La tarjeta crece en altura; caben menos tareas por cuadrante. |
| D | **Franja o borde de color** en la tarjeta (dorado para la misión) más un icono para la programada. | Muy visible de un vistazo. | El color solo no basta (WCAG 1.4.1); dos franjas a la vez se confunden. |

**Decisión del propietario (2026-11-03)**: alternativa A (iconos junto al título), con
«Pendiente desde el …» como texto breve en el pie, porque es un aviso que la persona necesita
leer, no solo reconocer. Además, el botón «Añadir/Quitar de la misión» pasa a ser un botón de
estrella (ver FR-007).

## Clarifications

### Session 2026-11-03

- Q: ¿Qué alternativa de presentación de los indicadores se adopta? → A: La A: iconos junto al
  título (calendario para programada, estrella dorada para misión), con texto al pasar el puntero
  y nombre accesible; «Pendiente desde el …» como texto breve en el pie.
- Q: ¿La feature compacta también las acciones de la tarjeta? → A: Solo en parte: el botón
  «Añadir/Quitar de la misión» se convierte en un botón de estrella (vacía/llena); «Fijar»,
  «Editar» y «Mover a la papelera» no cambian.

### Session 2026-11-03 (plan)

- Enmienda de redacción en FR-007 y US3-4: el estado del botón de estrella lo comunica su
  etiqueta cambiante («Añadir…»/«Quitar…»), sin `aria-pressed`, siguiendo la guía de ARIA para
  botones de alternar (research R4).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Distinguir de un vistazo las tareas programadas y de misión sin que la tarjeta se descoloque (Priority: P1)

Como persona que revisa su tablero, quiero ver qué tareas son programadas y cuáles forman parte de
la misión del día mediante indicadores compactos, sin que el título y las acciones de la tarjeta se
amontonen ni se solapen, para leer el tablero con rapidez en cualquier tamaño de pantalla.

**Why this priority**: es el problema que la persona ha reportado: el solapamiento hace la tarjeta
difícil de leer y de usar en el uso diario del tablero.

**Independent Test**: con una tarea que sea a la vez programada, pendiente desde un día anterior,
fijada y de la misión del día, abrir el tablero en escritorio (matriz 2×2), en modo compacto y en
móvil, y comprobar que ningún elemento de la tarjeta se solapa con otro, que el título se lee
entero (con saltos de línea si hace falta) y que ambos indicadores se identifican.

**Acceptance Scenarios**:

1. **Given** una tarea programada en el tablero, **When** miro su tarjeta, **Then** veo un
   indicador compacto de «programada» que no desplaza ni tapa el título ni las acciones.
2. **Given** una tarea marcada como misión del día, **When** miro su tarjeta, **Then** veo un
   indicador compacto de «misión del día» distinguible del de programada por forma, no solo por
   color.
3. **Given** una tarea que es programada, de la misión y está fijada a la vez, **When** miro su
   tarjeta en el ancho más estrecho admitido (móvil y cuadrante de la matriz en escritorio, con
   densidad normal y compacta), **Then** ningún elemento se solapa con otro y no aparece
   desplazamiento horizontal.
4. **Given** una tarea programada cuya aparición fue un día anterior y sigue activa, **When** miro
   su tarjeta, **Then** sigo viendo «Pendiente desde el …» con la fecha, sin que se solape con nada.
5. **Given** una tarea que no es programada ni de la misión, **When** miro su tarjeta, **Then** no
   aparece ningún indicador ni hueco reservado para ellos.

---

### User Story 2 - Entender qué significa cada indicador (Priority: P2)

Como persona que usa el tablero (también con lector de pantalla o teclado), quiero poder averiguar
qué significa cada indicador sin adivinar, para no perder la información que antes daba el texto
completo.

**Why this priority**: al pasar de texto a iconos se pierde información explícita; sin esta
historia la mejora visual empeoraría la comprensión y la accesibilidad.

**Independent Test**: pasar el puntero y el foco por cada indicador y recorrer la tarjeta con un
lector de pantalla; comprobar que se anuncian «Programada», «Pendiente desde el …» y «Misión del
día».

**Acceptance Scenarios**:

1. **Given** una tarjeta con indicadores, **When** paso el puntero por encima de uno, **Then** veo
   su significado en texto («Programada» o «Misión del día»).
2. **Given** una tarjeta con indicadores, **When** la recorro con un lector de pantalla, **Then** se
   anuncia el significado de cada indicador en texto, igual que antes de este cambio.
3. **Given** el tema claro y el oscuro, **When** miro los indicadores, **Then** cumplen el
   contraste mínimo para elementos gráficos con su fondo.

---

### User Story 3 - Añadir o quitar una tarea de la misión con un botón de estrella (Priority: P3)

Como persona que elige su misión del día desde el tablero, quiero marcarla o desmarcarla con un
botón de estrella en la tarjeta en vez de un botón de texto largo, para que la tarjeta tenga
menos texto y la acción sea reconocible de un vistazo.

**Why this priority**: el botón «Añadir a la misión» es la acción con el texto más largo y la que
más contribuye al amontonamiento, pero la mejora principal (P1) ya se nota sin él.

**Independent Test**: en una tarea fuera de la misión, pulsar la estrella vacía y comprobar que se
llena y que la tarea entra en la misión; volver a pulsarla y comprobar que sale; con la misión
llena (5 tareas), comprobar que la estrella de otra tarea está deshabilitada y anuncia el motivo.

**Acceptance Scenarios**:

1. **Given** una tarea activa fuera de la misión y la misión con menos de 5 tareas, **When** pulso
   su estrella vacía, **Then** la tarea entra en la misión y la estrella se muestra llena.
2. **Given** una tarea de la misión, **When** pulso su estrella llena, **Then** la tarea sale de la
   misión y la estrella vuelve a estar vacía.
3. **Given** la misión con 5 tareas, **When** miro la estrella de una tarea que no está en ella,
   **Then** está deshabilitada y el lector de pantalla anuncia «La misión ya tiene 5 tareas».
4. **Given** el botón de estrella, **When** lo recorro con teclado o lector de pantalla, **Then** se
   anuncia como «Añadir a la misión» si la tarea no está en la misión o «Quitar de la misión» si
   lo está, de modo que su nombre comunica el estado.
5. **Given** que el servidor rechaza el cambio, **When** pulso la estrella, **Then** la estrella no
   cambia y veo el mismo aviso de error que hoy.

---

### Edge Cases

- **Títulos muy largos o palabras sin espacios**: el título se parte en varias líneas; los
  indicadores y las acciones no se solapan con él.
- **Tarjeta con todos los estados a la vez** (fijada, programada, pendiente desde, misión): se
  muestran todos sin solaparse en el ancho más estrecho.
- **Progreso no disponible** (no se pudo cargar): no se muestra el indicador de misión ni
  «Pendiente desde»; el de programada sí, porque depende solo de la tarea (comportamiento actual).
- **Confusión con el cuadrante «Planificar»**: el indicador de programada no debe confundirse con
  la etiqueta del cuadrante «Planificar»; su texto accesible sigue siendo «Programada».
- **Dispositivos táctiles sin puntero**: el significado debe poder consultarse sin *hover*
  (p. ej. al mantener pulsado o tocar el indicador).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La tarjeta de tarea del tablero DEBE mostrar la condición de «programada» y de
  «misión del día» mediante iconos junto al título (como la chincheta de «Fijada»): un calendario
  para programada y una estrella dorada para misión, en lugar de las etiquetas de texto actuales
  de la fila superior.
- **FR-002**: Ningún elemento de la tarjeta (título, indicadores, «Pendiente desde», acciones,
  etiqueta de ámbito y botón «Completar») DEBE solaparse con otro en ninguno de los anchos
  admitidos (móvil, cuadrante de la matriz en escritorio) ni en ninguna densidad (normal o
  compacta), y la tarjeta NO DEBE provocar desplazamiento horizontal.
- **FR-003**: Los indicadores de programada y de misión DEBEN distinguirse entre sí por forma y no
  solo por color, y DEBEN cumplir el contraste mínimo de elementos gráficos en tema claro y oscuro.
- **FR-004**: Cada indicador DEBE tener un nombre accesible en texto («Programada», «Misión del
  día») y mostrar ese texto al pasar el puntero o al consultarlo en dispositivos táctiles.
- **FR-005**: El aviso «Pendiente desde el <fecha>» de las tareas programadas cuya aparición ya
  pasó DEBE seguir visible como texto breve en el pie de la tarjeta, con la misma regla que hoy.
- **FR-006**: Las reglas de cuándo se muestra cada indicador NO DEBEN cambiar: programada si la
  tarea la generó una programación; misión si la tarea está en la misión de hoy; ninguno si el
  progreso no se pudo cargar (salvo programada, como hoy).
- **FR-007**: El botón «Añadir a la misión / Quitar de la misión» DEBE convertirse en un botón de
  estrella: estrella vacía si la tarea no está en la misión y llena (dorada) si lo está. DEBE
  conservar como nombre accesible y texto al pasar el puntero «Añadir a la misión» o «Quitar de
  la misión» (la propia etiqueta comunica el estado, sin `aria-pressed`), seguir deshabilitado con el motivo «La
  misión ya tiene 5 tareas» cuando la misión está llena y la tarea no está en ella, y tener un
  área táctil adecuada en móvil. Las acciones «Fijar/Desfijar», «Editar» y «Mover a la papelera»
  NO cambian en esta feature.
- **FR-008**: Con la tarea en la misión, la estrella llena del botón y el indicador de misión
  junto al título NO DEBEN resultar redundantes ni confusos: el diseño (FR-009) decide si el
  botón de estrella llena basta como indicador o si se mantienen ambos con papeles distintos
  (indicador = estado; botón = acción), y en cualquier caso FR-004 se cumple.
- **FR-009**: El nuevo aspecto de la tarjeta DEBE diseñarse en Stitch, sobre el proyecto y el
  *design system* actuales, en tema claro y oscuro, escritorio y móvil, y densidad normal y
  compacta, y el propietario DEBE aprobarlo antes de empezar el código de interfaz (como en
  FR-035 de la feature 007).

### Key Entities

- **Tarea** (existente, features 001 y 007): no cambia; los indicadores se derivan de datos que ya
  tiene (si la generó una programación y la fecha prevista de esa aparición).
- **Misión del día** (existente, feature 007): no cambia; el indicador se deriva de si la tarea
  está en la misión de hoy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100 % de las combinaciones revisadas (móvil y escritorio × densidad normal y
  compacta × tema claro y oscuro, con una tarea fijada, programada, pendiente y de misión a la
  vez), ningún elemento de la tarjeta se solapa con otro.
- **SC-002**: La fila superior de una tarjeta con ambos indicadores ocupa como máximo la misma
  altura que la de una tarjeta sin indicadores con el mismo título.
- **SC-003**: El propietario identifica, sin ayuda, cuál de las tarjetas del tablero es programada
  y cuál es de la misión en menos de 5 segundos tras ver el nuevo diseño por primera vez.
- **SC-004**: La auditoría automática de accesibilidad del tablero no reporta incidencias nuevas
  y el lector de pantalla anuncia el significado de los dos indicadores.

## Assumptions

- **Alcance**: solo cambia la presentación de la tarjeta de tarea del tablero (los dos
  indicadores y el botón de misión); las otras tres acciones se quedan como están. No cambian las
  reglas de las tareas programadas, la misión del día, la puntuación ni los datos guardados; no
  hay cambios de backend, de modelo de datos ni de infraestructura.
- **Otras pantallas**: la pantalla de inicio de jornada, la sección de tareas programadas, el
  historial y la papelera no cambian salvo que reutilicen la misma tarjeta; si alguna muestra los
  mismos indicadores, se alinea con el nuevo aspecto para ser coherente.
- **Iconos**: se reutilizan los símbolos que la feature 007 ya asoció a cada concepto (calendario
  para programada, estrella dorada para misión), para no introducir un lenguaje visual nuevo.
- **Seguridad**: al no tocar autenticación, autorización ni modelo de datos, no se requiere la
  revisión de `mytasks-security-auditor`.
- **Usuarios**: el propietario es el usuario principal; la validación de SC-003 la hace él.
