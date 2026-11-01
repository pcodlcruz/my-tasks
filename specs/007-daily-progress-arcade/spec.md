# Feature Specification: Progreso diario, tareas programadas y gamificación arcade

**Feature Branch**: `feature/007-daily-progress-arcade` (la crea el hook `speckit.git.feature` tras `/speckit-tasks`)

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Quiero crear una feature para tener visibidad de las tareas que voy completando día a día. Quiero que la aplicación sugiera al usuario a revisar a primera hora del día el tablero y completar uuna serie mínima de tareas. El usuario debe tener visibilidad del progreeso diario así como poder crear tareas programadas que aparezcan automáticamente en el tablero. Quiero que la aplicación use una gamificación (podemos basarla en temática de videojuegos arcade) para que el usuario se sienta motivado por completar las tareas y realizar un seguimiento diario a su tablón"

## Clarifications

### Session 2026-10-29

- Q: ¿La invitación matinal se limita a la pantalla que aparece al abrir la aplicación, o además debe llegar un aviso fuera de ella (notificación del navegador o correo)? → A: Solo dentro de la aplicación: la pantalla de inicio de jornada aparece la primera vez que se abre cada día. Sin notificaciones del navegador ni correos.
- Q: ¿La puntuación es personal y privada, o hay una tabla de récords compartida entre las personas invitadas? → A: Privada: cada persona ve solo lo suyo; no hay tabla de récords compartida.
- Q: ¿La «serie mínima de tareas» es un número de tareas o una selección de tareas concretas? → A: Las dos: una meta numérica N (cualquier tarea cuenta) y, además, la posibilidad de marcar tareas como «misión del día», que dan puntos extra al completarlas ese día.

### Session 2026-10-30

- Q: ¿A qué hora termina un día y empieza el siguiente, a efectos de progreso, racha y pantalla de inicio de jornada? → A: A una hora fija de madrugada, las 04:00 de la zona horaria de cada persona, igual para todos (no configurable).
- Q: Si completo una tarea un día, la reabro otro día posterior y la vuelvo a completar, ¿debe volver a contar en el progreso y dar puntos ese segundo día? → A: Cuenta para el progreso (y la meta) del nuevo día, pero solo da puntos la primera vez que se completa en toda su vida.
- Q: Si tengo una tarea programada diaria y el domingo es día no activo, ¿debe aparecer igualmente el domingo en el tablero? → A: Sí: las programaciones son independientes de los días activos; cada una aparece exactamente cuando dice su repetición.
- Q: Si en un día no activo completo tareas y llego a la meta, ¿gano el bonus de «fase superada» y suma ese día a la racha? → A: Se ganan los puntos de tarea y el bonus de fase si se llega a la meta, pero la racha no cambia (ni sube ni se rompe).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver mi progreso de hoy frente a una meta diaria (Priority: P1)

Como persona con cuenta, quiero ver en el tablero cuántas tareas he completado hoy frente a una meta mínima diaria que yo elijo, representada como una barra de energía de estilo arcade, para saber de un vistazo si voy bien en el día y sentir que avanzo con cada tarea que cierro.

**Why this priority**: Es el núcleo de la feature («visibilidad de las tareas que voy completando día a día») y la base sobre la que se apoyan la revisión matinal, la puntuación y las rachas. Por sí sola ya aporta valor.

**Independent Test**: Con una meta de 3 tareas, completar tres tareas a lo largo del día y comprobar que el marcador del tablero pasa de 0/3 a 3/3, que al llegar a la meta se muestra la celebración «¡FASE SUPERADA!», y que al día siguiente el marcador vuelve a 0/3.

**Acceptance Scenarios**:

1. **Given** una cuenta que nunca ha configurado su meta, **When** abre el tablero, **Then** ve el marcador del día con la meta por defecto (3 tareas) y 0 completadas.
2. **Given** una meta diaria de 3, **When** completo una tarea, **Then** el marcador pasa a 1/3 al instante, sin recargar.
3. **Given** que llevo 2/3, **When** completo la tercera tarea, **Then** se muestra una celebración breve de meta cumplida y el marcador indica que la fase del día está superada; seguir completando tareas sigue sumando (4/3, 5/3…).
4. **Given** que completé una tarea hoy, **When** la reabro hoy mismo, **Then** deja de contar en el progreso de hoy; si vuelvo a completarla, cuenta una sola vez.
5. **Given** que estoy en «Perfil», **When** cambio la meta diaria a 5, **Then** el marcador de hoy pasa a mostrar la nueva meta de inmediato.
6. **Given** que ayer por la tarde ya abrí la aplicación y son las 00:30, **When** completo una tarea, **Then** esa tarea cuenta para el día que empezó a las 04:00 de ayer, el marcador no se reinicia y la pantalla de inicio de jornada no vuelve a aparecer hasta pasadas las 04:00.
7. **Given** que son las 03:59 y completo una tarea, **When** pasan las 04:00 en mi zona horaria, **Then** esa tarea queda en el día anterior y el marcador del nuevo día empieza en 0.

---

### User Story 2 - Revisión de inicio de jornada («PULSA START») (Priority: P2)

Como persona que quiere empezar el día con foco, quiero que la primera vez que abro la aplicación cada día se me muestre una pantalla de inicio de jornada que resuma cómo fue ayer, me recuerde la meta de hoy, me enseñe las tareas «Hacer ahora» y las programadas para hoy, y me invite a revisar el tablero, para arrancar el día con un plan claro.

**Why this priority**: Es la «sugerencia a primera hora» que pide el propietario y el principal mecanismo para crear el hábito de seguimiento diario. Depende del progreso diario (US1) pero no del resto.

**Independent Test**: Abrir la aplicación por primera vez en un día activo y comprobar que aparece la pantalla de inicio de jornada con el resumen de ayer y la meta de hoy; cerrarla, recargar y comprobar que no vuelve a salir ese día; repetir al día siguiente y comprobar que sale de nuevo.

**Acceptance Scenarios**:

1. **Given** que hoy es un día activo y aún no he abierto la aplicación, **When** la abro, **Then** veo la pantalla de inicio de jornada con: tareas completadas ayer y si cumplí la meta, mi racha actual, la meta de hoy, mis tareas activas de «Hacer ahora» y las tareas programadas que han aparecido hoy.
2. **Given** la pantalla de inicio de jornada, **When** pulso «Empezar» (o la cierro), **Then** voy al tablero y la pantalla no vuelve a mostrarse en lo que queda de día, tampoco en otro dispositivo.
3. **Given** que ya vi la pantalla hoy, **When** quiero volver a consultarla, **Then** puedo abrirla de nuevo a mano desde el marcador del día.
4. **Given** que desactivé la revisión de inicio de jornada en «Perfil», **When** abro la aplicación por primera vez en el día, **Then** voy directamente al tablero.
5. **Given** un día que he marcado como no activo (por ejemplo, domingo), **When** abro la aplicación, **Then** no se muestra la pantalla de inicio de jornada.
6. **Given** que no tengo ninguna tarea activa, **When** se muestra la pantalla de inicio de jornada, **Then** me invita a crear la primera tarea del día en vez de mostrar listas vacías sin contexto.
7. **Given** la pantalla de inicio de jornada, **When** marco hasta 5 de mis tareas activas como «misión del día», **Then** al ir al tablero esas tareas se distinguen visualmente y el marcador del día muestra cuántas de la misión llevo completadas.
8. **Given** que aún no he abierto la aplicación hoy, **When** pasa la mañana, **Then** no recibo ningún aviso fuera de la aplicación; la invitación es solo la pantalla de inicio de jornada al abrirla.

---

### User Story 3 - Puntuación, rachas, niveles y logros arcade (Priority: P3)

Como persona que necesita un empujón de motivación, quiero ganar puntos al completar tareas, mantener una racha de días cumpliendo la meta, subir de nivel y desbloquear logros, todo con estética de máquina recreativa (marcador, «RÉCORD», «¡SUBES DE NIVEL!»), para que completar tareas y volver cada día al tablero resulte divertido.

**Why this priority**: Es la capa de motivación que pide el propietario. Se construye sobre el progreso diario (US1) y su valor se multiplica con la revisión de inicio de jornada (US2), pero puede entregarse después de ambas.

**Independent Test**: Completar tareas durante varios días seguidos cumpliendo la meta y comprobar que la puntuación sube según las reglas, que la racha cuenta los días consecutivos, que al superar un umbral se anuncia la subida de nivel y que el primer logro («Primera moneda») se desbloquea al completar la primera tarea.

**Acceptance Scenarios**:

1. **Given** cualquier tarea activa, **When** la completo, **Then** gano los puntos de una tarea completada y el marcador de puntuación se actualiza con una animación breve.
2. **Given** que hoy cumplo la meta diaria, **When** completo la tarea que la alcanza, **Then** gano además el bonus de fase superada (una sola vez al día) y mi racha cuenta el día de hoy.
3. **Given** una racha de 4 días activos seguidos cumpliendo la meta, **When** un día activo termina sin cumplirla, **Then** la racha vuelve a 0 al empezar el día siguiente; mi mejor racha histórica se conserva.
4. **Given** una racha en curso, **When** pasa un día que marqué como no activo, **Then** la racha no se rompe aunque ese día no complete tareas; y si ese día llego a la meta, gano el bonus de fase superada pero la racha tampoco sube.
5. **Given** que completé una tarea hoy y gané sus puntos, **When** la reabro hoy, **Then** pierdo esos puntos (y el bonus de fase si dejo de cumplir la meta); completarla y reabrirla repetidamente no da puntos extra.
6. **Given** una tarea que completé ayer (y me dio puntos), **When** la reabro hoy y la vuelvo a completar, **Then** cuenta en el progreso de hoy, pero no me da otra vez los puntos de tarea.
7. **Given** que mi puntuación acumulada supera el umbral del siguiente nivel, **When** completo la tarea que lo cruza, **Then** se anuncia «¡SUBES DE NIVEL!» con el nombre del nuevo nivel.
8. **Given** el catálogo de logros, **When** cumplo la condición de uno, **Then** se desbloquea, se anuncia una sola vez y queda visible en mi sala de trofeos con la fecha en que lo conseguí; los no conseguidos se ven como bloqueados con su condición.
9. **Given** que ya tengo algún día anterior con actividad y hoy he completado tantas tareas como mi récord, **When** completo la tarea que lo supera, **Then** se anuncia «¡NUEVO RÉCORD!» una vez ese día (y, si hoy llevo al menos 5, se desbloquea el logro «Nuevo récord»).
10. **Given** que desactivé el «modo arcade» en «Perfil», **When** uso la aplicación, **Then** no veo puntuación, niveles, logros ni celebraciones, pero sí el progreso del día, la meta y la racha; al reactivarlo, veo la puntuación acumulada como si nunca lo hubiera desactivado.
11. **Given** que otra persona con cuenta usa la aplicación, **When** cualquiera de las dos consulta puntos, rachas o logros, **Then** solo ve los suyos; no existe tabla de récords compartida y ni los administradores ven los de otra persona.
12. **Given** una tarea marcada como «misión del día», **When** la completo hoy, **Then** gano los puntos normales más el extra de misión; **When** completo todas las tareas de la misión de hoy, **Then** se anuncia «¡MISIÓN CUMPLIDA!» y gano el bonus de misión (una sola vez al día).
13. **Given** que termina el día con tareas de la misión sin completar, **When** empieza el día siguiente, **Then** esas tareas dejan de ser misión (siguen activas en el tablero, sin penalización) y puedo volver a elegirlas.

---

### User Story 4 - Tareas programadas que aparecen solas en el tablero (Priority: P4)

Como persona con tareas que se repiten o que ya sé que tengo que hacer en una fecha concreta, quiero programarlas una vez (con su título, descripción, urgencia, importancia y ámbito) y que aparezcan automáticamente en mi tablero el día que toca, para no tener que acordarme de crearlas a mano.

**Why this priority**: Es una capacidad pedida explícitamente y alimenta la revisión diaria, pero es independiente del progreso y de la gamificación, y la más costosa de implementar. Se entrega al final de las historias de producto.

**Independent Test**: Crear una tarea programada que se repite los lunes y miércoles, avanzar al lunes siguiente y comprobar que la tarea aparece en el tablero en su cuadrante, marcada como programada; completarla y comprobar que el miércoles aparece una nueva.

**Acceptance Scenarios**:

1. **Given** que creo una tarea programada para una fecha concreta futura, **When** llega ese día, **Then** la tarea aparece en mi tablero como tarea activa, en el cuadrante que corresponde a su urgencia e importancia, con una marca que indica que es programada.
2. **Given** una tarea programada que se repite cada día, ciertos días de la semana o un día concreto de cada mes, **When** llega cada día que coincide con la repetición, **Then** aparece en el tablero una tarea nueva con los datos de la programación.
3. **Given** que la tarea del lunes de una programación repetitiva sigue activa (no la completé), **When** llega el miércoles, **Then** no se crea un duplicado: sigue la del lunes y se me indica que está pendiente desde el lunes.
4. **Given** que no abro la aplicación durante varios días, **When** vuelvo, **Then** encuentro en el tablero las tareas programadas que tocaban, sin duplicados acumulados por cada día que no entré.
5. **Given** una tarea programada, **When** edito sus datos o su repetición, **Then** los cambios se aplican a las próximas apariciones; las tareas que ya aparecieron en el tablero no cambian.
6. **Given** una tarea programada, **When** la pauso, **Then** deja de generar tareas hasta que la reanude; **When** la elimino, **Then** deja de generar tareas y las que ya están en el tablero se quedan como tareas normales.
7. **Given** que tengo 500 tareas activas (el límite), **When** toca que aparezca una tarea programada, **Then** no se crea, y en la siguiente visita se me avisa de que no cupo por el límite.
8. **Given** la sección de tareas programadas, **When** la abro, **Then** veo todas mis programaciones con su repetición, su estado (activa/pausada) y la fecha de su próxima aparición.

---

### User Story 5 - Historial de progreso por días (Priority: P5)

Como persona que quiere ver su constancia, quiero consultar un calendario con mis últimos días que muestre, para cada día, cuántas tareas completé y si cumplí la meta, junto a mis estadísticas (mejor día, mejor racha, total de tareas y nivel), para ver mi evolución a medio plazo.

**Why this priority**: Completa la «visibilidad del progreso» con una vista histórica. Usa los datos que ya generan las historias 1 y 3, así que puede entregarse la última sin bloquear nada.

**Independent Test**: Con varias semanas de actividad, abrir el historial de progreso y comprobar que cada día muestra su número de tareas completadas y si se cumplió la meta, y que al seleccionar un día se listan las tareas completadas ese día.

**Acceptance Scenarios**:

1. **Given** actividad en las últimas semanas, **When** abro el historial de progreso, **Then** veo un calendario de las últimas 12 semanas donde la intensidad de cada día refleja las tareas completadas y se distinguen los días con meta cumplida, los no activos y los futuros.
2. **Given** el calendario, **When** selecciono un día, **Then** veo cuántas tareas completé, la meta que tenía ese día, si la cumplí y la lista de esas tareas (las que sigan existiendo).
3. **Given** el historial de progreso, **When** lo abro, **Then** veo mis estadísticas: mejor día (récord), racha actual, mejor racha, total de tareas distintas completadas desde que existe la feature, y nivel y puntuación si el modo arcade está activo.
4. **Given** que hoy cambio mi meta de 3 a 5, **When** consulto días anteriores, **Then** cada día pasado conserva la meta que tenía y su resultado no cambia.

---

### Edge Cases

- **Cambio de zona horaria** (viaje): el día se calcula con la zona horaria guardada en el perfil; si el dispositivo detecta otra, se ofrece actualizarla. Un cambio de zona no duplica ni borra días ya cerrados.
- **Reabrir una tarea completada en un día anterior**: los días ya cerrados no se recalculan; la tarea vuelve al tablero, pero el progreso, la racha y los puntos de ese día pasado se mantienen. Si se vuelve a completar, cuenta en el progreso y la meta del nuevo día (y puede ayudar a cumplirla y a ganar el bonus de fase), pero no vuelve a dar los puntos de tarea.
- **Eliminar (a la papelera) una tarea completada**: no resta nada del progreso ni de los puntos ya ganados; en el detalle de ese día deja de listarse.
- **Restaurar desde la papelera una tarea completada**: no vuelve a dar puntos ni a contar en el progreso de hoy.
- **Completar muchas tareas triviales para subir puntos**: se permite; es una herramienta personal de motivación y la puntuación es privada, no hay competencia que proteger.
- **Misión del día con tareas que se eliminan o ya están completadas**: solo se pueden marcar como misión tareas activas; si una tarea de la misión se elimina, deja de formar parte de ella y la misión se evalúa con las que quedan. Una misión vacía no da bonus.
- **Marcar como misión una tarea ya completada hoy y reabierta**: vale; si se vuelve a completar, cuenta como misión una sola vez.
- **Meta cambiada a mitad del día**: vale para hoy desde ese momento; si ya se había cumplido con la meta anterior y la nueva es mayor, el bonus de fase ya ganado no se pierde, pero la racha de hoy se evalúa con la meta vigente al terminar el día.
- **Todos los días marcados como no activos**: no se permite; al menos un día de la semana debe ser activo.
- **Primer día tras desplegar la feature**: todas las cuentas empiezan con puntuación 0, nivel 1, racha 0 y sin logros («PARTIDA NUEVA»); las tareas completadas antes del despliegue no cuentan.
- **Programación con día 31 en un mes de 30 días** (o 29/30/31 en febrero): la tarea aparece el último día de ese mes.
- **Programación con fecha única en el pasado**: no se permite crearla.
- **Programación diaria y días no activos**: la tarea aparece también en los días no activos (las programaciones no dependen de los días activos); para que salga solo entre semana, se programa con «ciertos días de la semana».
- **Varias pestañas o dispositivos abiertos**: la pantalla de inicio de jornada sale una sola vez al día por cuenta; el progreso y los puntos se mantienen coherentes entre ellos.
- **Fallo al cargar el progreso o la gamificación**: el tablero, el historial y la papelera siguen funcionando; el marcador muestra un aviso discreto en lugar de datos incorrectos.
- **Animaciones y celebraciones**: respetan la preferencia del sistema de reducir movimiento (se sustituyen por un aviso estático) y nunca bloquean el uso del tablero.
- **Cuenta revocada**: no puede ver ni modificar su progreso ni sus programaciones; sus datos se conservan por si vuelve a tener acceso, y sus programaciones no generan tareas mientras está revocada.

## Requirements *(mandatory)*

### Functional Requirements

**Progreso diario y meta**

- **FR-001**: El sistema DEBE registrar cada vez que una persona completa una tarea, asignándola al día de progreso en que se completó. Un día de progreso va de las 04:00 a las 03:59 del día siguiente en la zona horaria de esa persona, y se identifica por la fecha en que empieza; la hora de corte es fija y no se configura.
- **FR-002**: El sistema DEBE mostrar en el tablero, sin navegar a otra pantalla, el marcador del día: tareas completadas hoy frente a la meta diaria, en forma de barra de progreso.
- **FR-003**: El sistema DEBE permitir que cada persona fije su meta diaria entre 1 y 20 tareas (valor inicial 3) desde «Perfil».
- **FR-004**: La meta diaria DEBE cumplirse al completar N tareas cualesquiera en el día. Además, el sistema DEBE permitir marcar como «misión del día» hasta 5 tareas activas (desde la pantalla de inicio de jornada o desde el tablero, en cualquier momento del día) y desmarcarlas. La misión es opcional, no cambia la meta numérica y caduca al terminar el día sin penalización; las tareas de la misión no completadas siguen activas.
- **FR-005**: Una tarea DEBE contar como máximo una vez en el progreso de un mismo día; si se reabre el mismo día en que se completó, DEBE dejar de contar en ese día. Si se reabre un día posterior y se vuelve a completar, DEBE contar en el progreso y la meta del nuevo día.
- **FR-006**: Al terminar un día, su resultado (tareas completadas, meta vigente, meta cumplida o no) DEBE quedar cerrado y no cambiar por acciones posteriores (reabrir, eliminar, restaurar o cambiar la meta).
- **FR-007**: El sistema DEBE permitir elegir qué días de la semana son activos (por defecto, los siete); en los días no activos no se muestra la revisión de inicio de jornada y la racha ni sube ni se rompe, pero las tareas completadas cuentan en el progreso del día, dan sus puntos y, si se llega a la meta, el bonus de fase superada. Al menos un día DEBE ser activo.
- **FR-008**: El sistema DEBE guardar la zona horaria de cada persona (detectada del dispositivo la primera vez) y permitir cambiarla en «Perfil».

**Revisión de inicio de jornada**

- **FR-009**: La primera vez que una persona abre la aplicación en un día activo, el sistema DEBE mostrar la pantalla de inicio de jornada con: resultado de ayer (o del último día activo), racha actual, meta de hoy, tareas activas de «Hacer ahora» y tareas programadas aparecidas hoy.
- **FR-010**: La pantalla de inicio de jornada DEBE mostrarse una sola vez por día y cuenta, en cualquier dispositivo, y DEBE poder reabrirse a mano desde el marcador del día.
- **FR-011**: El sistema DEBE permitir desactivar la pantalla de inicio de jornada en «Perfil» (activa por defecto).
- **FR-012**: La invitación a revisar el tablero DEBE hacerse solo dentro de la aplicación, con la pantalla de inicio de jornada; esta feature NO envía notificaciones del navegador ni correos.

**Gamificación arcade**

- **FR-013**: El sistema DEBE otorgar puntos por cada tarea completada por primera vez (una tarea solo da puntos de tarea una vez en toda su vida, aunque se reabra y se complete otros días), un bonus de «fase superada» una sola vez al día al cumplir la meta, puntos extra por cada tarea de la misión del día completada ese día y un bonus de «misión cumplida» una sola vez al día al completar todas las tareas de la misión; reabrir una tarea el mismo día DEBE retirar los puntos que dio (y los bonus que dejen de cumplirse). Marcar o desmarcar tareas de la misión después de completarlas NO DEBE dar ni quitar puntos.
- **FR-014**: El sistema DEBE llevar la racha actual (días activos consecutivos con la meta cumplida) y la mejor racha histórica. Un día activo cerrado sin cumplir la meta pone la racha actual a 0; los días no activos no la interrumpen ni la incrementan.
- **FR-015**: El sistema DEBE asignar un nivel según la puntuación acumulada, con una tabla de niveles con nombre de temática arcade, y anunciar cada subida de nivel una sola vez.
- **FR-016**: El sistema DEBE ofrecer un catálogo cerrado de logros con nombre, descripción de la condición e icono; cada logro se desbloquea una sola vez, se anuncia al conseguirse y se muestra con su fecha. Los no conseguidos se muestran bloqueados con su condición.
- **FR-017**: El sistema DEBE registrar el récord de tareas completadas en un día y anunciar cuando se supera, una vez al día; el primer día con actividad no cuenta como récord superado. El logro «Nuevo récord» exige además que ese día tenga al menos 5 tareas.
- **FR-018**: El sistema DEBE permitir desactivar el «modo arcade» en «Perfil» (activo por defecto); desactivado, se ocultan puntuación, niveles, logros, récords y celebraciones, pero se siguen calculando para mostrarlos si se reactiva. El progreso del día, la meta y la racha siguen visibles.
- **FR-019**: Las celebraciones y animaciones DEBEN ser breves, no bloquear el uso del tablero y respetar la preferencia del sistema de reducir movimiento. Esta feature no reproduce sonidos.
- **FR-020**: La estética arcade (tipografía, marcadores, mensajes) DEBE convivir con los temas claro y oscuro y las dos densidades de la feature 004, manteniendo contraste de nivel AA.

**Tareas programadas**

- **FR-021**: El sistema DEBE permitir crear una tarea programada con los mismos datos y validaciones que una tarea (título, descripción, urgencia, importancia, ámbito) y una programación: fecha única (hoy o futura), diaria, ciertos días de la semana o un día concreto de cada mes.
- **FR-022**: El día que corresponda según su programación, el sistema DEBE hacer aparecer en el tablero una tarea activa con los datos de la programación, identificada visualmente como programada, de forma que esté ya visible la primera vez que la persona abra el tablero ese día. Las programaciones NO dependen de los días activos (FR-007): una programación diaria aparece también en los días no activos.
- **FR-023**: Mientras la última tarea generada por una programación repetitiva siga activa, el sistema NO DEBE generar otra de esa misma programación; en su lugar, la tarea existente DEBE indicar desde qué día está pendiente.
- **FR-024**: Las tareas generadas DEBEN respetar el límite de 500 tareas activas; si no caben, no se crean y se avisa a la persona en su siguiente visita.
- **FR-025**: El sistema DEBE permitir listar, editar, pausar, reanudar y eliminar programaciones; los cambios afectan solo a apariciones futuras, y eliminar una programación no elimina las tareas ya generadas.
- **FR-026**: El sistema DEBE limitar a 50 las programaciones por persona.
- **FR-027**: Una tarea generada por una programación es, a todos los efectos, una tarea normal (se edita, completa, reabre, elimina y cuenta en el progreso igual que cualquier otra).

**Historial de progreso**

- **FR-028**: El sistema DEBE ofrecer una vista de historial de progreso con un calendario de las últimas 12 semanas que distinga, por día, el número de tareas completadas, si se cumplió la meta, y si el día fue no activo o futuro.
- **FR-029**: Al seleccionar un día, el sistema DEBE mostrar su resultado (completadas, meta, cumplida o no) y las tareas completadas ese día que sigan existiendo fuera de la papelera.
- **FR-030**: La vista DEBE mostrar las estadísticas: mejor día, racha actual, mejor racha, total de tareas distintas completadas desde el despliegue de la feature (una tarea reabierta y vuelta a completar cuenta una vez) y, con el modo arcade activo, nivel y puntuación.

**Seguridad y robustez**

- **FR-031**: El progreso, la misión del día, la puntuación, los logros y las programaciones de una persona DEBEN ser visibles y modificables solo por ella; no existe tabla de récords compartida y ni los administradores los ven. Una cuenta revocada recibe la misma denegación que en el resto de la aplicación y sus programaciones no generan tareas.
- **FR-032**: El sistema DEBE calcular puntos, rachas, niveles y logros en el servidor; nunca DEBE aceptar del cliente valores de puntuación, racha, nivel o logros.
- **FR-033**: El sistema DEBE validar en el servidor la meta, los días activos, la zona horaria y los datos y la repetición de las programaciones, rechazando valores desconocidos o fuera de rango.
- **FR-034**: Un fallo al cargar o calcular el progreso o la gamificación NO DEBE impedir usar el tablero, el historial ni la papelera.

**Diseño de interfaz**

- **FR-035**: Las pantallas y elementos nuevos (marcador del día, pantalla de inicio de jornada, celebraciones, sala de trofeos, tareas programadas, historial de progreso y los ajustes nuevos de «Perfil») DEBEN diseñarse en Stitch, sobre el proyecto y el *design system* actuales, en tema claro y oscuro, escritorio y móvil, y el propietario DEBE aprobarlos en un punto de control humano antes de empezar el código de interfaz.
- **FR-036**: Cada pantalla ya aprobada que cambie (al menos el tablero y «Perfil») DEBE reflejarse como una versión nueva en Stitch sin modificar la aprobada, y `docs/design/screens/README.md` DEBE registrar la vigente, como en la feature 004.

### Key Entities

- **Ajustes de progreso** (amplía las preferencias de perfil de la feature 004): meta diaria, días activos de la semana, zona horaria, revisión de inicio de jornada activa o no, modo arcade activo o no. Pertenecen a una cuenta.
- **Misión del día**: hasta 5 tareas activas que la persona elige para un día concreto; caduca al terminar ese día. Pertenece a una cuenta y referencia a sus tareas.
- **Registro de completado**: hecho de que una tarea se completó en un día concreto de la persona; se anula si la tarea se reabre ese mismo día. Pertenece a una cuenta y referencia a una tarea.
- **Día de progreso**: resumen de un día de una persona: fecha, si era activo, meta vigente, tareas completadas, meta cumplida o no, puntos ganados y si está cerrado. Una vez cerrado no cambia.
- **Marcador del jugador**: puntuación acumulada, nivel, racha actual, mejor racha, récord diario y fecha de la última revisión de inicio de jornada vista. Uno por cuenta.
- **Logro**: elemento de un catálogo cerrado común a todas las personas (identificador estable, nombre, condición, icono con texto alternativo). **Logro conseguido**: relación entre una cuenta y un logro, con su fecha.
- **Tarea programada**: plantilla de tarea (título, descripción, urgencia, importancia, ámbito) con su programación (fecha única, diaria, días de la semana o día del mes), estado (activa/pausada), fecha de próxima aparición y referencia a la última tarea generada. Pertenece a una cuenta.
- **Tarea** (existente, feature 001): gana una marca de si ya dio sus puntos de tarea (para no darlos dos veces) y una referencia opcional a la tarea programada que la generó y la fecha prevista de esa aparición.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona sabe cuántas tareas lleva hoy y cuántas le faltan para su meta en menos de 3 segundos tras abrir el tablero, sin navegar a otra pantalla.
- **SC-002**: El marcador del día refleja una tarea completada o reabierta en menos de 1 segundo, sin recargar.
- **SC-003**: La pantalla de inicio de jornada se muestra en el 100 % de las primeras aperturas de un día activo (con la opción activada) y en ninguna otra apertura de ese día, en cualquier dispositivo.
- **SC-004**: El 100 % de las apariciones programadas está en el tablero la primera vez que la persona lo abre el día que les toca, sin duplicados.
- **SC-005**: Una persona crea una tarea programada repetitiva en menos de 1 minuto en su primer intento.
- **SC-006**: Completar y reabrir la misma tarea cualquier número de veces en un día nunca suma más puntos ni más progreso que completarla una vez (0 casos en las pruebas).
- **SC-007**: Puntos, rachas, niveles y logros coinciden en el 100 % de los casos de prueba con las reglas definidas, incluidos cambio de día, días no activos, cambio de meta y reapertura.
- **SC-008**: Todas las pantallas nuevas o cambiadas superan las comprobaciones automáticas de accesibilidad de nivel AA en tema claro y oscuro.
- **SC-009**: En las 4 semanas siguientes al despliegue en producción, el propietario abre la aplicación en al menos el 80 % de sus días activos y cumple la meta en al menos el 60 % de ellos (objetivo de hábito; se mide con el historial de progreso).

## Assumptions

- **Alcance**: la feature añade progreso diario, revisión de inicio de jornada, gamificación arcade, tareas programadas e historial de progreso. No cambia la clasificación de Eisenhower, el acceso por invitación (feature 003) ni el resto de preferencias (feature 004).
- **Temática arcade**: encaja con la marca «InsertTasks» y su logo de máquina recreativa (feature 006). Los textos siguen en español, con guiños arcade («PULSA START», «¡FASE SUPERADA!», «RÉCORD», «¡SUBES DE NIVEL!», «PARTIDA NUEVA»). El logo y el nombre no se rediseñan.
- **Reglas de puntuación iniciales** (ajustables en el plan sin cambiar la especificación): 100 puntos por tarea completada, igual para todos los cuadrantes (para no incentivar clasificar mal las tareas); 500 puntos de bonus de fase superada; 50 puntos extra por tarea de la misión del día y 300 de bonus de misión cumplida; unos 10 niveles con umbrales crecientes; un catálogo inicial de unos 12 logros (primera tarea, primera fase superada, rachas de 3, 7 y 30 días, 10/100/500 tareas, vaciar «Hacer ahora», completar una tarea programada, superar el récord, etc.).
- **Sin castigos**: no hay vidas, «GAME OVER» ni pérdida de puntos por días sin actividad; lo único que se pierde es la racha actual.
- **Día y zona horaria**: el día de progreso empieza a las 04:00 de la zona horaria de la persona (FR-001), para que quien trabaja pasada la medianoche no vea la pantalla de inicio de jornada ni pierda tareas en el día siguiente. Los días activos (FR-007) se refieren a ese día de progreso. «Primera hora del día» se interpreta como la primera apertura del día, no como una hora fija. No hay avisos fuera de la aplicación (notificaciones o correo); quedan como candidatos para una feature futura.
- **Partida nueva**: el progreso, la puntuación y los logros empiezan a contar desde el despliegue; las tareas completadas antes no se reconstruyen como progreso.
- **Tareas programadas**: la apariencia en el tablero no depende de que la persona tenga la aplicación abierta; se asume que la tarea está en el tablero desde el inicio del día de la persona o, como muy tarde, al abrirlo. Repeticiones más complejas (cada N semanas, último día laborable, fechas de fin) quedan fuera por ahora.
- **Privacidad**: todo el progreso es privado de su dueña, como el perfil de la feature 004; ni los administradores lo ven y no hay tabla de récords compartida.
- **Seguridad**: la feature cambia el modelo de datos (registros de completado, misión, marcador, logros, programaciones); por eso exige revisión con `mytasks-security-auditor` (Principio III).
- **Fuera de alcance**: notificaciones del navegador y correos, tabla de récords compartida, sonidos, créditos o comodines para salvar rachas, recompensas canjeables, retos entre personas y estadísticas por ámbito o cuadrante. Se anotan como candidatas para futuras features.
- **Diseño**: como en las features 001 y 004, el diseño en Stitch y su aprobación por el propietario preceden al código de interfaz; el plan debe prever reintentos por los timeouts conocidos del MCP de Stitch.
