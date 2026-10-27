# Feature Specification: Logo y nuevo nombre visible de la aplicación

**Feature Branch**: `feature/006-app-branding`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Quiero que añadamos un logo a la aplicación. Yo te lo pasaré en una imagen. Quiero que aparezca en la home y en la pantalla de login. Si te parece bien incluirlo en algún sitio mas me dices. Además quiero que cambiemos el nombre de la aplicación (solo de forma visual en la web) a \"InsertTasks\" con un mensaje que sugiera el propósito de la aplicación."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reconocer la aplicación nada más llegar al inicio de sesión (Priority: P1)

Una persona abre la aplicación sin sesión y ve la pantalla de inicio de sesión con el logo, el nombre «InsertTasks» y un mensaje breve que
explica para qué sirve la aplicación, antes de pulsar «Iniciar sesión con Google».

**Why this priority**: es la primera pantalla que ve cualquier persona y la que da la primera impresión de la aplicación; sin ella el cambio
de identidad no se percibe.

**Independent Test**: abrir la aplicación en una ventana sin sesión y comprobar que se ven el logo, el nombre y el mensaje, en tema claro y
oscuro y en una pantalla de móvil y una de escritorio, y que el botón de inicio de sesión sigue visible sin desplazarse.

**Acceptance Scenarios**:

1. **Given** una persona sin sesión, **When** abre la aplicación, **Then** ve el logo, el nombre «InsertTasks» y el mensaje de propósito, y
   no ve en ningún sitio el nombre anterior «MyTasks».
2. **Given** una persona con el tema oscuro activado, **When** abre la pantalla de inicio de sesión, **Then** el logo se distingue con
   claridad sobre el fondo oscuro.
3. **Given** una pantalla de móvil estrecha, **When** se abre la pantalla de inicio de sesión, **Then** el logo y el nombre caben sin
   cortarse y el botón de inicio de sesión se ve sin tener que desplazarse.

---

### User Story 2 - Ver el logo y el nombre en la pantalla principal (Priority: P1)

Una persona con sesión iniciada entra en la pantalla principal (el tablero de tareas) y ve el logo junto al nombre «InsertTasks» en la
cabecera. El mensaje de bienvenida del tablero también usa el nombre nuevo.

**Why this priority**: es la pantalla donde la persona pasa casi todo el tiempo; mostrar ahí la identidad completa es la otra mitad de lo que
pidió el propietario.

**Independent Test**: iniciar sesión y comprobar que la cabecera muestra el logo y «InsertTasks», y que el mensaje de bienvenida (cuando el
tablero está vacío) dice «InsertTasks».

**Acceptance Scenarios**:

1. **Given** una persona con sesión, **When** entra en el tablero, **Then** la cabecera muestra el logo junto a «InsertTasks».
2. **Given** una cuenta sin tareas, **When** entra en el tablero, **Then** el mensaje de bienvenida nombra «InsertTasks» y no «MyTasks».
3. **Given** la cabecera con el logo, **When** la persona usa la aplicación en móvil, **Then** la cabecera sigue mostrando sus acciones
   habituales sin cortarse ni solaparse.

---

### User Story 3 - Un único nombre en toda la web (Priority: P2)

El nombre «InsertTasks» es el único que ve la persona en cualquier lugar de la web donde antes aparecía «MyTasks»: el título de la pestaña del
navegador, la pantalla de «acceso denegado» y cualquier otro texto visible.

**Why this priority**: un nombre a medias (por ejemplo «InsertTasks» en el login y «MyTasks» en la pestaña) resta credibilidad y confunde,
pero no impide usar la aplicación.

**Independent Test**: recorrer todas las pantallas (inicio de sesión, acceso denegado, tablero, historial, papelera, perfil, administración de
accesos) y las pestañas del navegador, y comprobar que no queda ningún «MyTasks» visible.

**Acceptance Scenarios**:

1. **Given** cualquier pantalla de la web, **When** se mira el título de la pestaña del navegador, **Then** dice «InsertTasks».
2. **Given** una persona sin invitación que inicia sesión, **When** ve la pantalla de acceso denegado, **Then** el texto nombra
   «InsertTasks».
3. **Given** el recorrido completo de la aplicación, **When** se busca el nombre anterior, **Then** no aparece «MyTasks» en ningún texto visible.

---

### User Story 4 - El logo también en la pestaña y en el acceso denegado (Priority: P3)

El propietario aceptó la propuesta de usar el logo como icono de la pestaña del navegador (hoy es un icono genérico que no representa a la
aplicación) y en la pantalla de acceso denegado.

**Why this priority**: refuerza la identidad, pero no es lo pedido de forma explícita: la aplicación sigue siendo plenamente utilizable sin
esto.

**Independent Test**: abrir la aplicación y comprobar que la pestaña muestra el logo y que la pantalla de acceso denegado lo incluye.

**Acceptance Scenarios**:

1. **Given** la aplicación abierta en el navegador, **When** se mira la pestaña, **Then** el icono es el logo y no el icono genérico actual.
2. **Given** una persona sin invitación, **When** ve la pantalla de acceso denegado, **Then** aparece el logo junto al nombre.

---

### Edge Cases

- **Tema claro y oscuro**: el logo debe verse bien en ambos temas. Si la imagen entregada solo funciona sobre un fondo, se pide al propietario
  una variante para el otro tema.
- **El logo no carga** (red lenta o fallo): el nombre «InsertTasks» sigue visible y la pantalla no se descoloca.
- **Pantallas pequeñas**: ni el logo ni el nombre desplazan el botón de inicio de sesión fuera de la vista ni solapan las acciones de la cabecera.
- **Tamaños del icono de la pestaña**: el logo debe reconocerse también a tamaño muy pequeño; si no, se pide una versión simplificada.
- **Personas con lector de pantalla**: el nombre de la aplicación se anuncia una sola vez; el logo que va junto al texto es decorativo.
- **Personas con sesión abierta antes del cambio**: ven el nombre y el logo nuevos en cuanto cargan la aplicación, sin tener que volver a
  iniciar sesión.
- **Imagen todavía no entregada**: sin el archivo del logo no se puede completar la parte visual; el cambio de nombre y el mensaje pueden
  prepararse mientras tanto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La pantalla de inicio de sesión MUST mostrar el logo junto al nombre «InsertTasks».
- **FR-002**: La pantalla principal (el tablero de tareas) MUST mostrar el logo junto al nombre «InsertTasks» en su cabecera. Si la cabecera es
  común a las demás pantallas con sesión, el logo aparece también en ellas.
- **FR-003**: El nombre visible de la aplicación MUST ser «InsertTasks» en todos los textos que hoy dicen «MyTasks»: la cabecera, la pantalla
  de inicio de sesión, el mensaje de bienvenida del tablero, la pantalla de acceso denegado y el título de la pestaña del navegador. No MUST
  quedar ningún «MyTasks» visible para las personas usuarias.
- **FR-004**: La pantalla de inicio de sesión MUST mostrar, bajo el nombre, el mensaje «Inserta tus tareas y prioriza lo que importa», que
  sustituye al subtítulo actual («Organiza tus tareas con la matriz de Eisenhower»).
- **FR-005**: El logo MUST ser legible en el tema claro y en el oscuro.
- **FR-006**: Un lector de pantalla MUST anunciar el nombre de la aplicación una sola vez en cada sitio donde aparece el logo (el logo, cuando
  va junto al texto del nombre, es decorativo y no se anuncia), y el texto y el contraste de lo que lo acompaña MUST seguir cumpliendo la
  accesibilidad que ya tiene la aplicación.
- **FR-007**: Si el logo no se puede cargar, el nombre «InsertTasks» MUST seguir visible y la maquetación no MUST romperse.
- **FR-008**: El logo y el nombre MUST adaptarse a pantallas de móvil y de escritorio sin cortarse, sin solapar las acciones de la cabecera y
  sin sacar el botón de inicio de sesión de la vista.
- **FR-009**: El logo MUST publicarse tal como lo entrega el propietario, sin rediseñarlo; solo se permiten los recortes y tamaños necesarios
  para mostrarlo bien.
- **FR-010**: El cambio de nombre MUST ser solo visual en la web: no se renombran los servicios, el proyecto de nube, el repositorio, los
  datos guardados, la API ni el dominio (que ya es `inserttask.es`).
- **FR-011**: El logo MUST usarse además como icono de la pestaña del navegador, en lugar del icono genérico actual, y en la pantalla de
  acceso denegado, junto al nombre. No se añade en ningún otro sitio (decisión del propietario).
- **FR-012**: Mostrar el logo no MUST hacer que la pantalla de inicio de sesión o el tablero se perciban más lentos: el logo es ligero y no
  provoca saltos de maquetación al cargar.

### Key Entities *(include if feature involves data)*

- **Logo**: la imagen de marca que entrega el propietario; se muestra en la cabecera, en el inicio de sesión y, si se confirma, en otros
  sitios. No es un dato de usuario ni se guarda por cuenta.
- **Nombre visible de la aplicación**: el texto «InsertTasks» que ve la persona; sustituye a «MyTasks» solo en lo que se muestra en la web.
- **Mensaje de propósito**: la frase breve del inicio de sesión que explica para qué sirve la aplicación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el recorrido completo de la aplicación (inicio de sesión, acceso denegado, tablero, historial, papelera, perfil y
  administración de accesos) y en las pestañas del navegador, el nombre «MyTasks» aparece **0 veces** y «InsertTasks» aparece en todos los
  lugares donde estaba el nombre anterior.
- **SC-002**: El logo es visible en la pantalla de inicio de sesión y en el tablero en los dos temas, en una pantalla de móvil de 360 px de
  ancho y en una de escritorio, sin que el botón de inicio de sesión quede fuera de la vista.
- **SC-003**: El texto que acompaña al logo cumple el contraste AA que ya exige la aplicación en el tema claro y en el oscuro (verificado
  como en la feature 004), y el logo se distingue con claridad sobre el fondo de cada tema: sus colores principales tienen al menos **3:1**
  de contraste con el fondo de la tarjeta y de la cabecera (criterio de contraste de elementos gráficos de WCAG 2.1), salvo que el logo
  lleve su propio fondo. El propietario lo confirma además a simple vista.
- **SC-004**: El logo aparece a la vez que el resto de la pantalla de inicio de sesión, sin parpadeo ni desplazamiento del contenido al
  cargar.
- **SC-005**: El propietario aprueba el resultado visual en staging, en los dos temas y en móvil y escritorio, antes de que llegue a
  producción.

## Assumptions

- El propietario entregará la imagen del logo. Se asume que una sola imagen sirve para los dos temas; si no se distingue sobre uno de ellos,
  se le pedirá una variante. Se prefiere un formato que escale bien (vectorial); si solo hay imagen de píxeles, debe tener resolución
  suficiente para pantallas de alta densidad.
- El nombre se escribe exactamente «InsertTasks» (con «I» y «T» mayúsculas y «s» final), tal como lo indicó el propietario. El dominio, que es
  `inserttask.es`, no cambia.
- «La home» es el tablero de tareas al que se llega tras iniciar sesión, y «la pantalla de login» es la de inicio de sesión con Google.
- El alcance del cambio de nombre es lo que ve una persona en la web. Quedan fuera los nombres técnicos (servicios, proyecto de nube,
  repositorio, documentación interna, nombre de la solución en la nube) y cualquier canal que no sea la web.
- La colocación exacta del logo (tamaño, posición, espaciado) se enseña al propietario y la aprueba antes de implementarla, como se hizo con
  el diseño de la feature 004.
- No hay cambios de datos, de permisos ni de autenticación, así que no hace falta revisión de seguridad.
- Los textos nuevos están en español, como el resto de la aplicación.
