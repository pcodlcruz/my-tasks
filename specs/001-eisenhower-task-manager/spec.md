# Feature Specification: Gestión de tareas con matriz de Eisenhower

**Feature Branch**: `[001-eisenhower-task-manager]`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Vamos a crear el scaffolding del proyecto. Será una aplicación de gestión de tareas. El propósito de la aplicación será tener visibilidad constante del estado de las tareas que realizo en mi día a día tanto en el entorno laboral como en la vida personal. Primeramente quiero que se base en la matriz de Eisenhower como metodología."

## Clarifications

### Session 2026-09-27

- Q: ¿La descripción de una tarea es obligatoria o es opcional? → A: Título y descripción son ambos obligatorios.
- Q: ¿Se puede reabrir una tarea completada (devolverla al tablero de activas) y editarla mientras está en el historial? → A: Se puede reabrir (vuelve a activa, en el cuadrante que corresponda a su urgencia e importancia, y se borra su fecha de finalización); no se edita dentro del historial.
- Q: ¿En qué orden se muestran las tareas dentro de cada cuadrante del tablero? → A: Por fecha de creación, la más antigua primero, con la opción de que el usuario fije tareas para que aparezcan al principio de su cuadrante.
- Q: ¿Qué longitud máxima deben tener el título y la descripción de una tarea? → A: Título hasta 200 caracteres; descripción hasta 2000 caracteres.
- Q: ¿Qué debe pasar cuando el usuario elimina una tarea? → A: Pasa a una papelera recuperable que se vacía automáticamente a los 30 días.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrarme y acceder solo a mis tareas (Priority: P1)

Como usuario nuevo, quiero crear mi propia cuenta y acceder únicamente a mis tareas, para que mi información quede aislada de la de cualquier otro usuario que use la aplicación.

**Why this priority**: Es el requisito de acceso previo a cualquier otra funcionalidad: sin cuenta ni aislamiento de datos por usuario no hay tareas que crear ni tablero que ver.

**Independent Test**: Se puede probar de forma aislada registrando dos cuentas distintas y comprobando que cada una solo ve sus propias tareas (inicialmente ninguna), sin acceso a las de la otra.

**Acceptance Scenarios**:

1. **Given** que no tengo cuenta, **When** me registro con mis datos, **Then** obtengo acceso a mi propio espacio de tareas, vacío.
2. **Given** dos usuarios ya registrados, **When** el usuario A intenta acceder a las tareas del usuario B, **Then** el sistema se lo impide.
3. **Given** que no he iniciado sesión, **When** intento ver o modificar cualquier tarea, **Then** el sistema me lo impide hasta que me autentique.

---

### User Story 2 - Capturar una tarea y verla clasificada (Priority: P2)

Como usuario, quiero registrar una tarea nueva indicando si es urgente y si es importante, para que la aplicación la sitúe automáticamente en el cuadrante correcto de la matriz de Eisenhower sin que yo tenga que decidir manualmente dónde colocarla.

**Why this priority**: Una vez resuelto el acceso (US1), capturar y clasificar tareas es el cimiento sobre el que se apoya el resto de la funcionalidad.

**Independent Test**: Se puede probar de forma aislada creando una tarea con un título y marcando urgencia/importancia, y comprobando que aparece en el cuadrante esperado (Hacer ahora / Planificar / Delegar / Eliminar).

**Acceptance Scenarios**:

1. **Given** que no tengo ninguna tarea creada, **When** creo una tarea marcada como urgente e importante, **Then** la tarea aparece en el cuadrante "Hacer ahora".
2. **Given** que no tengo ninguna tarea creada, **When** creo una tarea marcada como no urgente pero importante, **Then** la tarea aparece en el cuadrante "Planificar".
3. **Given** que no tengo ninguna tarea creada, **When** creo una tarea marcada como urgente pero no importante, **Then** la tarea aparece en el cuadrante "Delegar".
4. **Given** que no tengo ninguna tarea creada, **When** creo una tarea marcada como no urgente y no importante, **Then** la tarea aparece en el cuadrante "Eliminar".
5. **Given** que estoy creando o editando una tarea, **When** intento guardarla sin título o sin descripción, **Then** el sistema rechaza el guardado e indica que el título y la descripción son obligatorios.

---

### User Story 3 - Ver el estado de todas mis tareas de un vistazo (Priority: P3)

Como usuario, quiero ver un tablero con mis cuatro cuadrantes de la matriz de Eisenhower y todas mis tareas activas repartidas en ellos, para tener visibilidad constante de qué debo atacar primero sin tener que revisar tarea por tarea.

**Why this priority**: Es el valor central que persigue la aplicación ("visibilidad constante del estado de las tareas"); sin esta vista consolidada, capturar tareas no aporta el beneficio buscado.

**Independent Test**: Con varias tareas ya creadas en distintos cuadrantes, se puede verificar que el tablero muestra cada tarea en su cuadrante correspondiente y que un cuadrante sin tareas se muestra vacío en vez de ocultarse.

**Acceptance Scenarios**:

1. **Given** tareas activas repartidas en los cuatro cuadrantes, **When** abro el tablero, **Then** veo los cuatro cuadrantes simultáneamente, cada uno con sus tareas correspondientes.
2. **Given** un cuadrante sin ninguna tarea activa, **When** abro el tablero, **Then** ese cuadrante se muestra vacío con una indicación de que no hay tareas, en vez de desaparecer.
3. **Given** que edito la urgencia o importancia de una tarea existente, **When** guardo el cambio, **Then** la tarea se traslada inmediatamente al cuadrante que corresponda a los nuevos valores.
4. **Given** un cuadrante con varias tareas activas, **When** abro el tablero, **Then** las tareas aparecen ordenadas por fecha de creación, de la más antigua a la más reciente.
5. **Given** un cuadrante con varias tareas activas, **When** fijo una tarea que no es la más antigua, **Then** pasa a mostrarse al principio de su cuadrante, por delante de las no fijadas; y **When** la desfijo, **Then** vuelve a su posición según su fecha de creación.

---

### User Story 4 - Distinguir tareas laborales de personales (Priority: P4)

Como usuario, quiero etiquetar cada tarea como "Laboral" o "Personal" y filtrar el tablero por ese ámbito, para poder centrarme en un contexto concreto de mi día a día cuando lo necesite.

**Why this priority**: El propósito declarado incluye explícitamente cubrir ambos ámbitos de la vida del usuario; sin esta distinción, tareas de naturaleza muy distinta se mezclan en el mismo tablero.

**Independent Test**: Con tareas etiquetadas en ambos ámbitos, se puede verificar que el filtro "Laboral", "Personal" y "Todas" muestra exactamente el subconjunto de tareas esperado en cada caso.

**Acceptance Scenarios**:

1. **Given** tareas etiquetadas como "Laboral" y otras como "Personal", **When** selecciono el filtro "Laboral", **Then** el tablero muestra únicamente las tareas de ámbito laboral en sus cuadrantes.
2. **Given** que estoy creando una tarea, **When** no selecciono ningún ámbito explícitamente, **Then** el sistema me obliga a elegir uno antes de guardarla.

---

### User Story 5 - Completar tareas y consultar su historial (Priority: P5)

Como usuario, quiero marcar una tarea como completada y poder consultarla después en un historial, para confirmar que mi trabajo avanza y recordar qué resolví.

**Why this priority**: Completa el ciclo de vida básico de una tarea; es necesaria para que el tablero siga siendo útil a medio plazo, pero el sistema ya aporta valor (US1-US4) antes de tenerla.

**Independent Test**: Con una tarea activa visible en el tablero, se puede marcar como completada, verificar que desaparece del tablero activo y que pasa a aparecer en el historial de completadas.

**Acceptance Scenarios**:

1. **Given** una tarea activa en cualquier cuadrante, **When** la marco como completada, **Then** desaparece del tablero de tareas activas y aparece en mi historial de tareas completadas.
2. **Given** tareas ya completadas en mi historial, **When** consulto el historial, **Then** veo cada tarea con su título, el cuadrante que tuvo, su ámbito y su fecha de finalización.
3. **Given** una tarea completada en mi historial, **When** la reabro, **Then** desaparece del historial y vuelve al tablero de activas en el cuadrante que corresponde a su urgencia e importancia, sin fecha de finalización.
4. **Given** una tarea completada en mi historial, **When** intento editarla, **Then** el sistema no lo permite; para modificarla debo reabrirla primero.
5. **Given** una tarea que ya no necesito (activa o completada), **When** la elimino, **Then** deja de aparecer en el tablero y en el historial y pasa a la papelera.
6. **Given** una tarea en la papelera, **When** la restauro, **Then** vuelve al estado que tenía antes de eliminarla (al tablero si estaba activa, al historial si estaba completada).
7. **Given** una tarea en la papelera, **When** la elimino definitivamente o pasan 30 días desde que la eliminé, **Then** desaparece de forma permanente y no puede recuperarse.

---

### Edge Cases

- ¿Qué ocurre si el usuario cambia el ámbito (laboral/personal) de una tarea después de crearla? El cambio debe reflejarse de inmediato en los filtros, sin necesidad de recargar el tablero.
- ¿Qué ocurre si dos tareas tienen exactamente el mismo título? Se permite; no hay restricción de unicidad sobre el título.
- ¿Qué ocurre si el título supera los 200 caracteres o la descripción los 2000, al crear o al editar? El sistema rechaza el guardado e indica el límite superado; no trunca el texto en silencio. Un título o una descripción formados solo por espacios en blanco cuentan como vacíos.
- ¿Cómo se comporta el tablero cuando el usuario no tiene ninguna tarea activa en ningún cuadrante? Se muestran los cuatro cuadrantes vacíos con una indicación de bienvenida o de "sin tareas", nunca una pantalla en blanco sin contexto.
- ¿Qué ocurre si el usuario intenta acceder al tablero, al historial o a la papelera sin haber iniciado sesión? El sistema se lo impide hasta que se autentique.
- ¿Qué ocurre si dos personas intentan registrarse con el mismo identificador de cuenta (p. ej. el mismo email)? El sistema debe impedir el duplicado e informar del conflicto sin revelar más datos de la cuenta existente que los estrictamente necesarios.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir que una persona nueva se registre y obtenga su propia cuenta, sin intervención de un administrador.
- **FR-002**: El sistema DEBE exigir que el usuario esté autenticado antes de ver o modificar cualquier tarea, su historial o su papelera.
- **FR-003**: El sistema DEBE garantizar que cada usuario solo pueda ver y modificar sus propias tareas, nunca las de otro usuario.
- **FR-004**: El sistema DEBE permitir crear una tarea con un título obligatorio (máximo 200 caracteres), una descripción obligatoria (máximo 2000 caracteres), un nivel de urgencia (urgente / no urgente) y un nivel de importancia (importante / no importante).
- **FR-005**: El nivel de urgencia y el nivel de importancia de una tarea se establecen manualmente por el usuario al crearla o editarla; esta primera versión no incorpora fechas límite ni cálculo automático de urgencia.
- **FR-006**: El sistema DEBE clasificar automáticamente cada tarea en uno de los cuatro cuadrantes canónicos de la matriz de Eisenhower según la combinación de urgencia e importancia: "Hacer ahora" (urgente e importante), "Planificar" (no urgente e importante), "Delegar" (urgente y no importante), "Eliminar" (no urgente y no importante).
- **FR-007**: El sistema DEBE permitir asignar a cada tarea un ámbito único entre "Laboral" y "Personal", obligatorio en el momento de la creación.
- **FR-008**: El sistema DEBE mostrar un tablero consolidado con los cuatro cuadrantes y todas las tareas activas del usuario distribuidas en ellos.
- **FR-008a**: Dentro de cada cuadrante, el sistema DEBE mostrar primero las tareas fijadas y después las no fijadas; dentro de cada uno de esos dos grupos, por fecha de creación ascendente (la más antigua primero).
- **FR-008b**: El sistema DEBE permitir fijar y desfijar una tarea activa; la tarea sigue fijada aunque cambie de cuadrante al editarla.
- **FR-009**: El sistema DEBE mostrar cada cuadrante vacío de forma explícita (nunca ocultarlo) cuando no tenga tareas activas.
- **FR-010**: El sistema DEBE permitir filtrar el tablero por ámbito ("Laboral", "Personal" o "Todas").
- **FR-011**: El sistema DEBE permitir editar el título, la descripción, la urgencia, la importancia y el ámbito de una tarea activa (las tareas completadas no son editables; título y descripción siguen siendo obligatorios), recalculando su cuadrante si cambian la urgencia o la importancia.
- **FR-012**: El sistema DEBE permitir marcar una tarea activa como completada, tras lo cual deja de mostrarse en el tablero de tareas activas.
- **FR-013**: El sistema DEBE conservar cada tarea completada en un historial propio del usuario, consultable de forma separada del tablero activo, incluyendo título, cuadrante que tuvo, ámbito y fecha de finalización.
- **FR-013a**: El sistema DEBE permitir reabrir una tarea completada: vuelve al estado activa, se elimina su fecha de finalización, deja de aparecer en el historial y se muestra en el tablero en el cuadrante que corresponda a su urgencia e importancia.
- **FR-014**: El sistema DEBE permitir eliminar una tarea, tanto si está activa como si está en el historial de completadas; al eliminarla, la tarea pasa a una papelera propia del usuario y deja de mostrarse en el tablero y en el historial.
- **FR-014a**: El sistema DEBE ofrecer una vista de papelera, separada del tablero y del historial, desde la que el usuario puede restaurar una tarea (vuelve a su estado anterior: activa o completada) o eliminarla definitivamente. Las tareas en la papelera no son editables.
- **FR-014b**: El sistema DEBE eliminar de forma permanente e irrecuperable toda tarea que lleve 30 días en la papelera.
- **FR-015**: El sistema DEBE conservar el estado de las tareas y del historial del usuario entre sesiones, de modo que al volver a abrir la aplicación encuentre exactamente lo mismo que dejó.

### Key Entities

- **Usuario**: persona registrada en la aplicación; propietaria exclusiva de sus propias tareas e historial. Atributos relevantes: identificador de cuenta.
- **Tarea**: unidad de trabajo pendiente o completada de un usuario. Atributos relevantes: título, descripción, nivel de urgencia, nivel de importancia, cuadrante resultante (derivado, no editable directamente), ámbito (Laboral/Personal), fijada (sí/no, por defecto no), estado (activa/completada; transiciones permitidas: activa → completada y completada → activa al reabrir), fecha de creación, fecha de finalización (solo presente mientras está completada), fecha de eliminación (solo presente mientras está en la papelera; la tarea conserva su estado activa/completada para poder restaurarla). Pertenece exactamente a un usuario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona nueva puede registrarse y crear su primera tarea en menos de 2 minutos, sin intervención de un administrador.
- **SC-002**: Ningún usuario puede ver o modificar, en ningún momento, una tarea o historial perteneciente a otro usuario (0 incidentes de fuga de datos entre cuentas).
- **SC-003**: Un usuario puede crear una tarea y verla clasificada en su cuadrante correcto en menos de 15 segundos desde que abre el formulario de creación.
- **SC-004**: Un usuario puede identificar, en menos de 5 segundos tras abrir el tablero, qué tareas pertenecen al cuadrante "Hacer ahora" sin necesidad de aplicar filtros adicionales.
- **SC-005**: El 100% de las tareas creadas quedan visibles en el cuadrante que corresponde exactamente a su urgencia e importancia, sin intervención manual de reclasificación.
- **SC-006**: Un usuario puede pasar de ver todas sus tareas a ver únicamente las de un ámbito (laboral o personal) en un único paso de interacción.
- **SC-007**: Un usuario puede consultar, en cualquier momento posterior, el historial completo de sus tareas completadas.
- **SC-008**: El 100% de las tareas eliminadas pueden restaurarse desde la papelera durante los 30 días siguientes a su eliminación, y ninguna tarea permanece almacenada más de 30 días en la papelera.

## Assumptions

- **Alcance de "scaffolding"**: esta especificación cubre el ciclo completo de vida de una tarea (crear, ver clasificada, fijar, filtrar por ámbito, editar, completar, reabrir, consultar en el historial, eliminar a la papelera y restaurar) más el registro/aislamiento por usuario, como primera funcionalidad del proyecto. No incluye recordatorios, notificaciones, subtareas, comentarios, recuperación de contraseña ni colaboración/compartición de tareas entre usuarios en esta primera versión.
- **Mecanismo de autenticación**: el requisito funcional es que cada usuario tenga una cuenta propia y una sesión autenticada que aísle sus datos (Principio III de la constitución); el mecanismo concreto (contraseña, proveedor externo, etc.) es una decisión técnica que corresponde a `/speckit-plan`, no a esta especificación.
- **Urgencia e importancia manuales**: se establecen manualmente por el usuario en cada tarea; no hay fechas límite ni cálculo automático en esta primera versión (podría añadirse en una feature futura).
