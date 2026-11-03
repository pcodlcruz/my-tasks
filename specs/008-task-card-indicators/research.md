# Research: Indicadores compactos en la tarjeta de tarea

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Fecha**: 2026-11-03

No quedaban `NEEDS CLARIFICATION` en el contexto técnico: el stack es el actual del frontend y
el propietario resolvió en la spec la alternativa (A) y el alcance (B). Esta investigación fija
las decisiones de diseño que la spec deja abiertas.

## R1. Causa del solapamiento

**Hallazgo**: en `frontend/src/features/board/TaskCard.tsx`, la cabecera (`HEADER`) pasa a fila
con `sm:flex-row` (punto de corte del **viewport**, 640 px), y el título, «Programada…»,
«Misión del día» y el grupo de acciones llevan `shrink-0`. Pero el tablero pasa a la matriz 2×2
en `md:` (768 px; `BoardPage.tsx`), así que en escritorio cada tarjeta vive en una columna de
~300–450 px con la maquetación «de pantalla ancha». Los elementos que no encogen desbordan y se
pisan. En compacto (`compact:flex-wrap`) la fila se comparte además con el pie.

**Decisión**: quitar el problema de raíz, no solo encoger el texto:
1. Las marcas salen de la fila de acciones (R2) y «Pendiente desde» baja al pie (R5).
2. La cabecera deja de depender de `sm:`: el título es `min-w-0 flex-1` y el grupo de acciones
   hace `flex-wrap` y salta a la línea siguiente cuando no cabe, en cualquier ancho.

**Alternativas descartadas**:
- *Container queries* (`@container`): Tailwind 3.4 las necesita como plugin
  (`@tailwindcss/container-queries`). Sería una dependencia nueva para algo que `flex-wrap`
  ya resuelve (Principio I).
- Cambiar el punto de corte `sm:` por `xl:`: solo mueve el problema a otro ancho.

## R2. Forma de los indicadores (alternativa A)

**Decisión**: un componente pequeño, `CardIndicator`, en `frontend/src/features/board/`. Pinta
el icono **dentro del párrafo del título**, justo antes del texto y junto a la chincheta, con:
- el icono con `aria-hidden="true"`: el SVG de calendario que ya usa la tarjeta para
  «Programada», y `★` dorada (`text-gold`) para «Misión del día»;
- un texto `sr-only` con el significado («Programada», «Misión del día»), que el lector de
  pantalla lee en el orden del título. Además, el `textContent` de la tarjeta sigue conteniendo
  esas palabras, así que los e2e actuales (`toContainText('Misión del día')`) siguen sirviendo;
- el tooltip de R3.

Orden fijo: 📌 fijada → calendario programada → ★ misión → título. Se distinguen por forma
(calendario frente a estrella) y no solo por color (FR-003).

**Alternativas descartadas**:
- `aria-label` sobre un `<span>` sin rol, como hace hoy la chincheta. ARIA 1.2 prohíbe nombrar un
  elemento genérico y los lectores de pantalla no lo leen de forma fiable, así que el componente
  nuevo no copia ese patrón. axe 4.13 **no** lo marca como violación: el e2e `S3 · Tablero con
  tareas` de `a11y.spec.ts` ya pasa con una tarjeta fijada (comprobado en el análisis). La chincheta
  no se toca en esta feature.
- `role="img"` con `aria-label`: válido para el lector de pantalla, pero el texto no entra en el
  `textContent` y obligaría a reescribir los e2e sin ganar nada.

## R3. Tooltip en ratón y en pantalla táctil (FR-004)

**Decisión**: tooltip propio y ligero dentro de `CardIndicator`, sin dependencias:
- con ratón aparece al pasar el puntero (`group-hover`) y sigue visible mientras el puntero está
  sobre el icono o sobre el propio tooltip (WCAG 1.4.13, «hoverable»);
- en pantalla táctil, tocar el icono muestra u oculta el tooltip (`onClick` que alterna un
  estado local); se cierra al tocar fuera o con `Escape` (WCAG 1.4.13, «dismissible»);
- el tooltip tiene `aria-hidden="true"`, porque el significado ya lo da el texto `sr-only` de R2
  y así no se lee dos veces;
- el tooltip no debe salirse de la tarjeta: se ancla al borde izquierdo del icono, con un ancho
  máximo igual al de la tarjeta y el texto en una línea (los dos textos son cortos). Así no crea
  desplazamiento horizontal a 320 px (FR-002).

El indicador **no** es una parada del tabulador: con 100 tareas serían hasta 200 paradas más. Con
teclado y lector de pantalla el significado llega por el texto `sr-only`. Lo que se pierde
(alguien con teclado, sin lector de pantalla, que no reconoce el icono) es un caso menor: los
mismos iconos se usan con su texto completo en la pantalla de inicio de jornada (S8) y en
«Programadas» (S10).

**Alternativas descartadas**:
- Solo el atributo `title`: no funciona en pantalla táctil ni con teclado, y se ve con retraso.
- Una librería de tooltips (Radix, Floating UI): una dependencia nueva para dos iconos
  (Principio I).
- Convertir el indicador en `<button>`: una acción falsa y paradas de tabulador extra.

## R4. Botón de estrella de la misión (FR-007)

**Decisión**: el botón actual de texto pasa a botón de icono:
- estrella **vacía** (contorno, `text-text-muted`) si la tarea no está en la misión y **llena**
  (`text-gold`) si lo está;
- su nombre accesible sigue siendo **«Añadir a la misión»** o **«Quitar de la misión»**, y el
  texto va en `sr-only` dentro del botón. Los tests unitarios y e2e que buscan
  `getByRole('button', { name: 'Añadir a la misión' })` siguen sirviendo;
- **no** se añade `aria-pressed`. La guía de ARIA (APG, *Button pattern*) avisa de que un botón
  de alternar con `aria-pressed` debe tener una etiqueta fija; si la etiqueta cambia con el
  estado, no debe usar `aria-pressed` («Quitar de la misión, pulsado» se leería como un doble
  sentido). El estado se comunica con la propia etiqueta. Ver la enmienda de FR-007 en la spec;
- se conservan el `disabled` y el `aria-describedby` con «La misión ya tiene 5 tareas.», el
  `onError` con el aviso y que el botón no se pinte si el progreso no cargó;
- el área de pulsación mide al menos 24 × 24 px (WCAG 2.5.8, AA), igual que el resto de las
  acciones de la tarjeta. El tooltip de ratón es el `title` nativo con el mismo texto (en un botón
  sí está bien: con teclado y lector de pantalla el nombre ya se anuncia).

**Alternativas descartadas**: etiqueta fija «Misión del día» con `aria-pressed`. Es correcta según
la APG, pero obliga a reescribir todos los tests que buscan los nombres actuales y cambia lo que
se anuncia hoy sin que la persona lo haya pedido.

## R5. «Pendiente desde el …» en el pie (FR-005)

**Decisión**: pasa al pie, entre la etiqueta de ámbito y «Completar», como texto `text-caption`
con `text-text-muted`, el mismo texto exacto (`Pendiente desde el lun 2`, de `pendingSince`). La
regla no cambia: solo si la tarea es programada, se sabe qué día es hoy y su `scheduled_for` es
anterior. El pie hace `flex-wrap` para que, en 320 px, el aviso salte de línea sin pisar
«Completar».

## R6. Estrella del botón y estrella del indicador a la vez (FR-008)

**Decisión provisional, que se cierra en Stitch**: se presentan dos variantes al propietario:
- **V1 (por defecto)**: indicador ★ junto al título (estado) y botón de estrella en las acciones
  (acción). El botón lleva un recuadro de botón al pasar el puntero y el indicador no, para que
  no parezcan lo mismo.
- **V2**: sin indicador junto al título cuando la tarea está en la misión; la estrella llena del
  botón hace de indicador.

V1 cumple FR-001 al pie de la letra («iconos junto al título») y conserva la regla de FR-006:
cuando el progreso no carga, no hay ni indicador ni botón. V2 solo se adopta si el propietario la
elige en Stitch, y entonces se anota en `contracts/task-card-ui.md`.

## R7. Diseño en Stitch (FR-009)

**Decisión**: editar las pantallas aprobadas de S3 v3 (`docs/design/screens/README.md`) con el
MCP de Stitch (`edit_screens`) en lugar de generar el tablero desde cero, para que solo cambie la
tarjeta. Nombre de la iteración: **S3 v4 · Tablero (indicadores)**.
- **Combinaciones**: claro y oscuro × escritorio y móvil. En escritorio, densidad normal y
  compacta; en móvil, la maquetación de S3 v2 móvil, como ya decidió el propietario.
- **Contenido**: una tarjeta con todos los estados a la vez (fijada, programada, pendiente desde
  y de la misión) y otra con un título muy largo.
- **Variantes**: V1 y V2 de R6.

El MCP de Stitch tiene *timeouts* irregulares, pero las pantallas aparecen después (ver
`docs/design/screens/README.md`). Se lanzan en lotes y luego se comprueba con
`list_screens`. La exportación a `docs/design/screens/s3-board-v4*/` la hace el propietario con
`docs/design/export-stitch.py`, como en la 007. Stitch no es Google Cloud del proyecto: es una
herramienta de diseño con su propio MCP (Principio V no aplica).

## R8. Tests (Principio II)

- **Unitarios (Vitest)**: actualizar `tests/unit/features/board/TaskCard.test.tsx`.
  - Indicadores: comprobar el texto accesible, que el icono es `aria-hidden` y el orden junto al
    título.
  - Tooltip: aparece al tocar y se cierra con `Escape`.
  - «Pendiente desde»: ahora en el pie.
  - Botón de estrella: nombres, `disabled` con su descripción, envío de la misión y error.
- **e2e (Playwright)**:
  - Los de `start-of-day.spec.ts` y `schedules.spec.ts` siguen valiendo, porque el texto sigue en
    el `textContent`.
  - Se añade a `a11y.spec.ts` un test de **no solapamiento**: una tarea fijada, programada,
    pendiente y de la misión, con un título largo.
    - **Anchos**: 320, 768, 1024 y 1280 px. 768 es el peor caso, porque la matriz 2×2 empieza en
      `md:` y cada columna mide unos 360 px.
    - **Densidades**: normal y compacta.
    - **Comprueba**:
      - que las cajas (`boundingBox`) del título, los indicadores, las acciones, «Pendiente desde»
        y «Completar» no se cortan entre sí;
      - que no hay desbordamiento horizontal, también con el tooltip abierto a 320 px;
      - que la altura del título no crece por los iconos (SC-002).
  - El axe existente («S3 v3 · Tarea de la misión») cubre el contraste en claro y oscuro.
  - Para el «pendiente desde» del e2e se usa el reloj simulado de `fixtures/clock.ts`. No se usa
    `page.clock`, porque invalida los tokens de Firebase.
- **Backend**: sin cambios, así que no hay tests de backend.

## R9. Seguridad y datos

No cambia ningún endpoint, dato, autenticación ni autorización: **no hace falta
`mytasks-security-auditor`** (Principio III). No hay texto de usuario nuevo insertado como HTML:
el título se sigue pintando como texto de React.
