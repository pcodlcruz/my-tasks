# Feature Specification: Perfil de usuario y preferencias

**Feature Branch**: `feature/004-user-profile-settings`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Quiero crear la sección de perfil del usuario. Ésta debe tener las configuraciones básicas que el usuario puede elegir sobre su dashboard como por ejemplo: modo claro/oscuro, foto de avatar, tablero mostrado por defecto (laboral, todos o personal), y sugiéreme más opciones que puedan ser interesantes."

## Clarifications

### Session 2026-10-23

- Q: ¿De dónde sale la foto de avatar? → A: Las dos vías son válidas: elegir un avatar predefinido o subir una imagen propia. Si no se elige ninguna, se muestran las iniciales de la persona.
- Q: ¿Qué opciones sugeridas se incluyen además de tema, avatar y tablero por defecto? → A: Nombre para mostrar, densidad de la vista, y orden de las tareas con periodo del historial. Quedan fuera por ahora el tamaño de texto y la reducción de animaciones.
- Q: Los cambios de interfaz deben reflejarse en los diseños actuales de Stitch; ¿se modifican las pantallas aprobadas en su sitio o se generan versiones nuevas? → A: Versiones nuevas. La pantalla aprobada se conserva intacta y se anota en `docs/design/screens/README.md` cuál es la vigente una vez que el propietario aprueba la nueva.
- Q: ¿Qué pantallas se diseñan en tema oscuro en Stitch? → A: Las seis (inicio de sesión, tablero, formulario de tarea, historial, papelera y Perfil), en escritorio y móvil, además de los tokens oscuros en el *design system*.
- Q: ¿Se diseñan en Stitch las pantallas de la feature 003 (administración de accesos y «Necesitas una invitación»)? → A: No. Heredan los tokens oscuros y se anotan como deuda de diseño; se verifican en la implementación con la comprobación de contraste (SC-008).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Elegir la apariencia de la aplicación (Priority: P1)

Como persona con cuenta, quiero abrir una sección «Perfil» y elegir el tema (claro, oscuro o el del sistema) y la densidad de la vista (cómoda o compacta), para trabajar con la aplicación de la forma que me resulte más cómoda a diario.

**Why this priority**: Es la preferencia más pedida y la que se nota en cada pantalla. También crea la sección y el almacén de preferencias sobre los que se apoyan el resto de historias, así que es el mínimo viable de la feature.

**Independent Test**: Con una cuenta activa, abrir «Perfil», cambiar a tema oscuro y densidad compacta, y comprobar que toda la aplicación (tablero, historial, papelera y la propia sección) los refleja al instante, y que se conservan al cerrar sesión, volver a entrar y abrir la aplicación desde otro dispositivo.

**Acceptance Scenarios**:

1. **Given** una cuenta que nunca ha tocado su perfil, **When** abro la aplicación, **Then** se ve igual que antes de esta feature (tema del sistema, densidad cómoda).
2. **Given** que estoy en «Perfil», **When** elijo «Oscuro», **Then** toda la aplicación pasa a tema oscuro de inmediato, sin recargar.
3. **Given** que elegí «Sistema», **When** cambia el tema del sistema operativo, **Then** la aplicación lo sigue.
4. **Given** que elegí tema oscuro, **When** cierro sesión, vuelvo a entrar o abro la aplicación en otro dispositivo, **Then** sigue en oscuro y al cargar no se ve antes un destello del tema claro.
5. **Given** densidad compacta, **When** abro el tablero, **Then** las tarjetas ocupan menos espacio vertical y caben más tareas en pantalla, con el texto legible.
6. **Given** cualquier combinación de tema y densidad, **When** uso las pantallas de la aplicación, **Then** el texto y los controles mantienen un contraste legible (nivel AA).

---

### User Story 2 - Definir mi tablero por defecto y cómo se ordenan mis tareas (Priority: P2)

Como persona que reparte su día entre lo laboral y lo personal, quiero elegir con qué ámbito se abre mi tablero («Todas», «Laboral» o «Personal»), cómo se ordenan las tareas dentro de cada cuadrante y qué periodo del historial veo al abrirlo, para no tener que repetir los mismos filtros cada vez que entro.

**Why this priority**: Ahorra pasos en cada sesión y es lo que pidió explícitamente el propietario. Depende de la sección de la historia 1 pero no de las siguientes.

**Independent Test**: Con tareas laborales y personales, fijar «Laboral» como tablero por defecto, cerrar sesión, volver a entrar y comprobar que el tablero se abre filtrado por «Laboral».

**Acceptance Scenarios**:

1. **Given** que no he elegido nada, **When** abro el tablero, **Then** veo «Todas» (como hasta ahora).
2. **Given** que fijé «Personal» como tablero por defecto, **When** abro la aplicación, **Then** el tablero se abre filtrado por «Personal» y el filtro del tablero lo muestra como seleccionado.
3. **Given** el tablero abierto con mi ámbito por defecto, **When** cambio el filtro del tablero a otro ámbito, **Then** el cambio vale solo para esa visita y **no** modifica mi preferencia; la próxima vez vuelve a abrirse con el ámbito por defecto.
4. **Given** que elegí ordenar «Más recientes primero», **When** abro el tablero, **Then** dentro de cada cuadrante las tareas aparecen de la más reciente a la más antigua, y las fijadas siguen apareciendo al principio.
5. **Given** que elegí ver los «Últimos 30 días» del historial, **When** abro el historial, **Then** solo veo las tareas completadas en ese periodo, con un aviso visible de que solo se muestra ese periodo y un modo de verlo todo; no se borra ninguna.

---

### User Story 3 - Nombre para mostrar y avatar predefinido (Priority: P3)

Como persona con cuenta, quiero ver en la cabecera el nombre que yo elijo y un avatar que me represente, escogido entre un catálogo incluido en la aplicación, para personalizar mi espacio sin depender del nombre de mi cuenta de Google.

**Why this priority**: Personaliza, pero no cambia cómo se trabaja con las tareas. Se puede entregar sin subida de archivos.

**Independent Test**: En «Perfil», cambiar el nombre y elegir un avatar del catálogo, y comprobar que la cabecera los muestra, y que «Quitar avatar» devuelve las iniciales.

**Acceptance Scenarios**:

1. **Given** una cuenta que no ha elegido avatar, **When** abro la aplicación, **Then** la cabecera muestra mis iniciales sobre un color, nunca un hueco vacío.
2. **Given** el catálogo de avatares, **When** elijo uno, **Then** se ve en la cabecera y en «Perfil» al instante y persiste entre sesiones y dispositivos.
3. **Given** que escribo un nombre para mostrar válido, **When** lo guardo, **Then** la cabecera lo muestra en lugar del nombre de Google o del correo.
4. **Given** un nombre vacío, solo con espacios o de más de 50 caracteres, **When** intento guardarlo, **Then** recibo un mensaje claro y se conserva el valor anterior.
5. **Given** que dejo el nombre en blanco a propósito (o pulso «Usar el de Google»), **When** guardo, **Then** vuelve a usarse el nombre de mi cuenta de Google, o mi correo si no tiene.

---

### User Story 4 - Subir mi propia imagen de avatar (Priority: P4)

Como persona con cuenta, quiero subir una foto o imagen mía como avatar, para que la aplicación me represente con algo más personal que el catálogo.

**Why this priority**: Es la parte más costosa (almacenar archivos, validarlos y protegerlos) y la menos necesaria; el avatar predefinido ya cubre la necesidad básica. Se entrega al final y de forma independiente.

**Independent Test**: Subir una imagen válida, ver que se muestra como avatar, sustituirla por otra, y quitarla; comprobar que una imagen inválida o demasiado grande se rechaza con un mensaje claro.

**Acceptance Scenarios**:

1. **Given** una imagen JPEG, PNG o WebP de hasta 2 MB, **When** la subo, **Then** me deja ajustar el encuadre cuadrado, la guarda y la muestro como mi avatar en cabecera y «Perfil».
2. **Given** un archivo de otro tipo, uno corrupto, o una imagen de más de 2 MB o de dimensiones desproporcionadas, **When** intento subirlo, **Then** se rechaza con un mensaje que dice qué falló y mi avatar anterior no cambia.
3. **Given** que ya tengo una imagen subida, **When** subo otra, **Then** la nueva sustituye a la anterior y la anterior se elimina del almacenamiento.
4. **Given** una imagen subida, **When** pulso «Quitar imagen», **Then** se elimina del almacenamiento y vuelven las iniciales (o el avatar predefinido que haya elegido).
5. **Given** que otra persona con cuenta o sin ella intenta acceder a mi imagen, **When** solicita su dirección, **Then** no se la muestra ni se la sirve; solo yo la veo.
6. **Given** que la subida falla a mitad (red caída), **When** vuelvo a «Perfil», **Then** veo mi avatar anterior intacto y puedo reintentar.

---

### Edge Cases

- **Fallo al guardar una preferencia** (red caída, error del servidor): se muestra un aviso, el control vuelve al valor guardado y la aplicación sigue funcionando con él. Nunca queda una preferencia a medias.
- **Fallo al cargar las preferencias**: la aplicación funciona con los valores por defecto y avisa; no bloquea el tablero.
- **Dos dispositivos cambian la misma preferencia a la vez**: prevalece el último cambio guardado; el otro dispositivo lo recoge al recargar o al volver a la pestaña.
- **Cuenta revocada o sin acceso**: no puede leer ni cambiar nada del perfil (la misma denegación de acceso que el resto de la aplicación); sus preferencias y su imagen se conservan por si se le vuelve a dar acceso.
- **Valores inesperados** (un valor de tema, ámbito, densidad u orden que el sistema no conoce, enviado por manipulación): se rechazan; nunca se guardan ni rompen la pantalla.
- **Nombre para mostrar con caracteres de control, etiquetas o enlaces**: se trata siempre como texto; no se interpreta como marcado ni se acepta con caracteres de control.
- **Nombre muy largo o con emojis y acentos**: los acentos y emojis son válidos; el límite es de 50 caracteres visibles. En la cabecera se recorta con puntos suspensivos sin romper el diseño.
- **Subida repetida o muy frecuente de imágenes**: hay un límite razonable de intentos por persona; al superarlo se pide esperar.
- **Tablero por defecto con un ámbito sin tareas**: el tablero se abre vacío para ese ámbito con el aviso habitual de «sin tareas», nunca en blanco.
- **Periodo de historial que oculta todas las completadas**: se muestra el aviso de que solo se ve ese periodo, con el modo de verlo todo, no un historial vacío sin explicación.
- **Persona que llega a la cuenta por primera vez**: sin ningún dato de perfil, la aplicación se comporta exactamente como antes.

## Requirements *(mandatory)*

### Functional Requirements

**Sección de perfil**

- **FR-001**: El sistema DEBE ofrecer una sección «Perfil», accesible desde la cabecera por cualquier persona con cuenta activa, donde se ven y se cambian sus preferencias.
- **FR-002**: Las preferencias DEBEN ser propias de cada cuenta, y guardarse de forma que se conserven entre sesiones y dispositivos.
- **FR-003**: Cada cambio DEBE aplicarse de inmediato en pantalla y confirmarse al usuario cuando se guarda; si no se puede guardar, el sistema DEBE avisar y volver al valor guardado.
- **FR-004**: Una cuenta sin preferencias guardadas DEBE ver la aplicación exactamente como antes de esta feature (tema del sistema, densidad cómoda, tablero «Todas», orden por antigüedad, historial completo, iniciales como avatar).
- **FR-005**: La sección DEBE ofrecer «Restablecer valores por defecto», que tras confirmación devuelve a su valor inicial las preferencias de visualización (tema, densidad, tablero por defecto, orden y periodo del historial). El nombre para mostrar y el avatar NO se restablecen con ese botón: tienen sus propias acciones («Usar el de Google», «Quitar avatar»), de modo que una imagen subida nunca se elimina sin que la persona lo pida.

**Apariencia**

- **FR-006**: El sistema DEBE permitir elegir el tema entre «Claro», «Oscuro» y «Sistema» (valor inicial), y aplicarlo a todas las pantallas de la aplicación.
- **FR-007**: El tema DEBE aplicarse al abrir la aplicación sin mostrar antes un destello del tema contrario.
- **FR-008**: El texto, los controles y los estados (foco, error, deshabilitado, colores de cuadrante) DEBEN mantener un contraste mínimo de nivel AA en ambos temas.
- **FR-009**: El sistema DEBE permitir elegir la densidad de la vista entre «Cómoda» (valor inicial) y «Compacta»; la compacta DEBE reducir el espacio de las tarjetas del tablero sin perder legibilidad ni zonas de pulsación utilizables.

**Tablero por defecto y orden**

- **FR-010**: El sistema DEBE permitir elegir el ámbito con el que se abre el tablero entre «Todas» (valor inicial), «Laboral» y «Personal».
- **FR-011**: El filtro de ámbito que el usuario cambie dentro del tablero DEBE valer solo para la visita actual y NO DEBE modificar la preferencia guardada.
- **FR-012**: El sistema DEBE permitir elegir el orden de las tareas dentro de cada cuadrante entre «Más antiguas primero» (valor inicial) y «Más recientes primero»; las tareas fijadas DEBEN seguir apareciendo al principio de su cuadrante en ambos casos.
- **FR-013**: El sistema DEBE permitir elegir el periodo del historial que se muestra al abrirlo entre «Últimos 30 días», «Últimos 90 días» y «Todo» (valor inicial). Es solo un criterio de visualización: NO DEBE eliminar ni alterar ninguna tarea, y mientras haya un periodo activo DEBE avisar de que solo se muestra ese periodo y permitir ver todo el historial en esa visita.

**Identidad visual**

- **FR-014**: El sistema DEBE mostrar en la cabecera un avatar de la persona: su imagen subida, el avatar predefinido que haya elegido o, por defecto, sus iniciales sobre un color.
- **FR-015**: El sistema DEBE ofrecer un catálogo de avatares predefinidos para elegir, todos con texto alternativo.
- **FR-016**: El sistema DEBE permitir fijar un nombre para mostrar, de 1 a 50 caracteres tras eliminar espacios sobrantes, que se muestra en la cabecera; si está vacío o se restablece, se usa el nombre de la cuenta de Google o, en su defecto, el correo.
- **FR-017**: El nombre para mostrar es solo visual: NO DEBE cambiar la identidad, el correo, el rol ni el acceso de la cuenta, ni sustituir al correo en la pantalla de administración de accesos.
- **FR-018**: El sistema DEBE permitir subir una imagen propia como avatar si es JPEG, PNG o WebP, de hasta 2 MB y de dimensiones razonables, permitiendo ajustar un encuadre cuadrado antes de guardar.
- **FR-019**: El sistema DEBE rechazar con un mensaje claro cualquier archivo que no cumpla lo anterior, comprobándolo por su contenido y no solo por su nombre o extensión, sin alterar el avatar actual.
- **FR-020**: Al sustituir o quitar la imagen subida, el sistema DEBE eliminar la anterior del almacenamiento. El usuario DEBE poder quitar su avatar (volviendo a iniciales o al predefinido) en cualquier momento.
- **FR-021**: La imagen subida DEBE ser visible únicamente para su propietario y NO DEBE ser accesible por dirección pública ni por otras personas.

**Seguridad y robustez**

- **FR-022**: Solo una persona con cuenta activa DEBE poder leer o cambiar su propio perfil; nadie DEBE poder leer ni cambiar el de otra persona. Una cuenta revocada o sin acceso recibe la misma denegación que en el resto de la aplicación.
- **FR-023**: El sistema DEBE validar en el servidor todos los valores recibidos (tema, densidad, ámbito, orden, periodo, avatar, nombre) y rechazar los desconocidos, sin fiarse de la validación de la pantalla.
- **FR-024**: El nombre para mostrar y cualquier texto del perfil DEBEN tratarse siempre como texto plano al mostrarse.
- **FR-025**: El sistema DEBE limitar la frecuencia de subidas de imagen por persona.
- **FR-026**: Un fallo al cargar o guardar el perfil NO DEBE impedir usar el tablero, el historial ni la papelera.

**Diseño de interfaz**

- **FR-027**: Los cambios de interfaz de esta feature DEBEN diseñarse en Stitch, sobre el proyecto «MyTasks» y su *design system* actuales, antes de implementarse, y el propietario DEBE aprobarlos en un punto de control humano antes de empezar el código de interfaz (como en la feature 001).
- **FR-028**: Cada pantalla ya aprobada que cambie (por ejemplo, la cabecera común con avatar y acceso a «Perfil») DEBE reflejarse como una **versión nueva** en Stitch, en escritorio y móvil; la versión aprobada anterior NO DEBE modificarse ni eliminarse.
- **FR-028a**: El diseño DEBE incluir: (1) el tema oscuro como paleta del *design system*, y (2) las seis pantallas (S1 inicio de sesión, S3 tablero, S4 formulario de tarea, S5 historial, S6 papelera y la pantalla nueva de Perfil) en tema oscuro, en escritorio y móvil. Además, el tablero DEBE diseñarse con densidad compacta, y la cabecera común con avatar y acceso a «Perfil» DEBE verse en las pantallas afectadas.
- **FR-029**: Al aprobarse una versión nueva, `docs/design/screens/README.md` DEBE registrar cuál es la pantalla vigente (identificador de Stitch y fecha de aprobación), y el HTML y la captura de la nueva versión DEBEN versionarse en `docs/design/screens/`.

### Key Entities

- **Preferencias de perfil**: ajustes de una cuenta. Atributos: tema (claro/oscuro/sistema), densidad (cómoda/compacta), ámbito por defecto del tablero (todas/laboral/personal), orden de tareas (antiguas primero/recientes primero), periodo del historial (30 días/90 días/todo), nombre para mostrar (opcional), avatar (ninguno/predefinido/imagen propia). Pertenece exactamente a una cuenta y se crea al primer cambio; sin registro equivale a los valores iniciales.
- **Avatar predefinido**: elemento de un catálogo cerrado y común a todas las personas, identificado por un nombre estable y con texto alternativo.
- **Imagen de avatar**: archivo subido por una persona; su estado, formato, tamaño y fecha. Una por cuenta; privada para su propietaria.
- **Cuenta** (existente, feature 003): identidad, rol y estado de acceso. Esta feature no la modifica; solo la usa para saber a quién pertenece cada perfil.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona puede cambiar entre tema claro y oscuro desde el perfil en 2 pasos o menos, y la aplicación entera cambia en menos de 1 segundo, sin recargar.
- **SC-002**: En el 100 % de las aperturas posteriores a elegir un tema, la aplicación se muestra desde el primer fotograma en ese tema, sin destello del contrario.
- **SC-003**: Una persona con un tablero por defecto distinto de «Todas» llega a su tablero ya filtrado sin ningún paso adicional en el 100 % de sus sesiones, y los filtros puntuales no alteran su preferencia en ninguna.
- **SC-004**: Las preferencias elegidas en un dispositivo se ven al abrir la aplicación en otro dispositivo en menos de 5 segundos desde que se inicia sesión.
- **SC-005**: Con densidad compacta caben al menos un 25 % más de tareas visibles en el tablero que con la cómoda, a la misma altura de pantalla.
- **SC-006**: El 95 % de las personas completa un cambio de avatar (predefinido o subida) en menos de 1 minuto en su primer intento.
- **SC-007**: Ninguna imagen subida es accesible para otra persona, ni sin sesión iniciada, en ninguna de las pruebas de acceso realizadas.
- **SC-008**: Todas las pantallas de la aplicación superan las comprobaciones automáticas de accesibilidad de nivel AA en ambos temas.
- **SC-009**: Ningún usuario existente ve cambios en su aplicación al desplegarse la feature, hasta que modifique algo en su perfil.

## Assumptions

- Esta feature **solo** gestiona preferencias personales de cada cuenta. No cambia roles, invitaciones ni acceso (feature 003), ni el modelo de tareas (feature 001).
- Un perfil es **visible solo para su propietario**: la foto, el nombre para mostrar y el resto de ajustes no los ve ninguna otra persona, administradores incluidos. La pantalla de administración de accesos sigue identificando a las personas por su correo.
- «Tablero por defecto» se interpreta como el **filtro de ámbito** del tablero actual (Todas, Laboral, Personal); no se crean tableros nuevos ni tableros separados por ámbito.
- El orden «más recientes primero» y el periodo del historial se basan en datos que las tareas ya tienen (fecha de creación, fecha de finalización); no se añaden fechas límite ni nuevos campos a las tareas.
- El periodo del historial es solo un filtro de visualización; la política de conservación y purga de tareas no cambia.
- El tema «Sistema» sigue la preferencia del sistema operativo o del navegador.
- Las restricciones de la imagen (formatos JPEG, PNG y WebP; 2 MB; encuadre cuadrado) son valores iniciales razonables y se pueden ajustar en el plan sin cambiar la especificación.
- La subida de imágenes exige revisión de seguridad (son archivos de personas) y por eso la historia 4 es independiente y se entrega la última. Según el plan, no necesita infraestructura nueva: la imagen reducida se guarda junto al resto de datos de la persona.
- Fuera de alcance por ahora: tamaño de texto, reducción de animaciones, idioma, notificaciones, atajos de teclado, exportación de datos y borrado de la cuenta. Se anotan como candidatas para futuras features.
- Las pantallas de la feature 003 (administración de accesos y «Necesitas una invitación») no tienen diseño en Stitch. No se diseñan en esta feature: usan el tema oscuro heredado de los tokens del *design system* y se verifican con las comprobaciones de contraste (SC-008). Queda anotado como deuda de diseño para una feature posterior.
- El diseño en Stitch añade unas 12 generaciones (seis pantallas en oscuro, escritorio y móvil) más las versiones nuevas de las pantallas con cabecera cambiada y la pantalla de Perfil. Dado que el MCP de Stitch ha dado timeouts irregulares en la feature 001, el plan debe prever reintentos y el punto de control humano antes de la historia 1.
- Se mantiene el acceso por invitación: solo las cuentas activas tienen perfil.
