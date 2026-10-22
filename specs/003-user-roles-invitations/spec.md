# Feature Specification: Perfilado mínimo de usuarios e invitaciones

**Feature Branch**: `feature/003-user-roles-invitations`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Quiero que creemos una nueva feature sobre la aplicación. El propósito será tener un perfilado mínimo de usuarios. De momento solamente dos tipos \"user\" y \"admin\". De modo que el user pueda hacer lo mismo que hace hasta ahora y el admin además pueda autorizar a otros usuarios a logarse en el sistema y crear sus cuentas de usuario. Un usuario solamente podrá entrar en el sistema si recibe una invitación del administrador. Con esta feature quiero precisamente evitar que cualquier usuario en Internet se pueda crear una cuenta de usuario y usar la aplicación"

## Clarifications

### Session 2026-10-22

- Q: ¿Qué pasa con los usuarios que ya tienen cuenta? → A: El único usuario existente es el
  propietario y pasa a ser administrador; no hay otras cuentas que migrar.
- Q: ¿Cómo se entrega la invitación? → A: El administrador autoriza el correo de la cuenta
  Google del invitado; la aplicación no envía correos (ver Assumptions).
- Q: Cuando el administrador ha retirado el acceso a alguien, ¿cómo se le devuelve? → A: Volviendo
  a invitar el mismo correo: se reactiva la cuenta existente con rol `user` y recupera sus tareas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acceso restringido a personas invitadas (Priority: P1)

Como propietario de la aplicación, quiero que solo puedan entrar las personas a las que he
invitado, para que nadie en Internet pueda crearse una cuenta y usar la aplicación.

**Why this priority**: es el objetivo de la feature. Hoy cualquier cuenta Google se registra
sola (feature 001); cerrar ese hueco es lo que justifica el resto.

**Independent Test**: iniciar sesión con una cuenta Google sin invitación y comprobar que no
obtiene acceso ni se crea ningún dato suyo; iniciar sesión con la cuenta del administrador y
comprobar que entra con sus tareas intactas.

**Acceptance Scenarios**:

1. **Given** una persona sin invitación, **When** inicia sesión con su cuenta Google, **Then**
   se le deniega el acceso con un mensaje claro y no se crea ninguna cuenta ni dato suyo.
2. **Given** una persona sin invitación con una sesión ya iniciada o un token válido de Google,
   **When** intenta usar cualquier función de la API de tareas, **Then** la petición es
   rechazada igual que si no estuviera autenticada.
3. **Given** el propietario con su cuenta actual, **When** inicia sesión tras el despliegue,
   **Then** entra como administrador y conserva todas sus tareas.

---

### User Story 2 - El administrador invita a otra persona (Priority: P1)

Como administrador, quiero autorizar a otra persona indicando su correo, para que pueda entrar
y se cree su cuenta de usuario.

**Why this priority**: sin invitaciones nadie más podría usar la aplicación; es la contrapartida
necesaria de la Historia 1.

**Independent Test**: como administrador, invitar un correo; iniciar sesión con esa cuenta
Google y comprobar que entra como `user` con una lista de tareas vacía.

**Acceptance Scenarios**:

1. **Given** un administrador, **When** invita un correo válido, **Then** la invitación queda
   registrada como pendiente y aparece en su listado.
2. **Given** una invitación pendiente, **When** la persona invitada inicia sesión con esa cuenta
   Google, **Then** se crea su cuenta con rol `user`, la invitación pasa a aceptada y accede a
   una lista de tareas vacía y privada.
3. **Given** un correo ya invitado o ya con cuenta, **When** el administrador lo invita de nuevo,
   **Then** no se duplica y se le informa de su estado actual.
4. **Given** un texto que no es un correo válido, **When** el administrador lo invita, **Then**
   se rechaza con un mensaje de validación.

---

### User Story 3 - El administrador gestiona invitaciones y usuarios (Priority: P2)

Como administrador, quiero ver quién tiene acceso y poder retirarlo, para controlar en todo
momento quién usa la aplicación.

**Why this priority**: da control continuo, pero la aplicación ya cumple su objetivo con las
Historias 1 y 2.

**Independent Test**: revocar una invitación pendiente y comprobar que esa persona ya no puede
entrar; deshabilitar a un usuario con cuenta y comprobar que pierde el acceso.

**Acceptance Scenarios**:

1. **Given** una invitación pendiente, **When** el administrador la revoca, **Then** la persona
   ya no puede entrar con ella.
2. **Given** un usuario con cuenta, **When** el administrador le retira el acceso, **Then** deja
   de poder usar la aplicación y sus tareas se conservan sin perderse.
3. **Given** un administrador, **When** consulta el listado, **Then** ve cada correo con su rol
   y su estado (pendiente, activo, revocado).
4. **Given** el único administrador existente, **When** intenta retirarse el acceso o dejar de
   ser administrador, **Then** la operación se rechaza.
5. **Given** un usuario con el acceso retirado, **When** el administrador vuelve a invitar su
   correo, **Then** su cuenta se reactiva con rol `user`, recupera sus tareas y puede entrar de
   nuevo.

---

### User Story 4 - El usuario sigue trabajando como hasta ahora (Priority: P1)

Como usuario con rol `user`, quiero seguir usando la aplicación de tareas exactamente igual que
hasta ahora, para no perder nada con el nuevo control de acceso.

**Why this priority**: es una restricción de no regresión explícita de la petición.

**Independent Test**: ejecutar con un `user` los flujos principales de la feature 001 (crear,
editar, clasificar, completar y borrar tareas) y comprobar que se comportan igual; comprobar
que no ve ni puede invocar ninguna función de administración.

**Acceptance Scenarios**:

1. **Given** un `user` con sesión, **When** gestiona sus tareas, **Then** todo funciona como en
   la feature 001 y solo ve sus propias tareas.
2. **Given** un `user`, **When** intenta acceder a la pantalla o a las operaciones de
   administración, **Then** no se le muestran y las peticiones se rechazan por falta de permiso.
3. **Given** un administrador, **When** gestiona sus tareas, **Then** funciona igual que para un
   `user`, con las funciones de administración añadidas.

---

### Edge Cases

- ¿Qué pasa si el correo de la invitación se escribe con otras mayúsculas? Se compara sin
  distinguir mayúsculas y minúsculas.
- ¿Y si la persona invitada inicia sesión con una cuenta Google con otro correo? No coincide
  con ninguna invitación y se le deniega el acceso.
- ¿Y si se revoca la invitación de alguien que ya ha entrado? Pierde el acceso; la revocación
  tiene efecto en un plazo acotado aunque tenga una sesión abierta (ver SC-003).
- ¿Y si dos administradores gestionan a la vez la misma invitación? El resultado es coherente
  (una sola invitación por correo) y ninguna operación deja un estado a medias.
- ¿Qué pasa con las tareas de un usuario al retirarle el acceso? Se conservan; si se le vuelve a
  invitar las recupera (FR-006).
- ¿Puede un administrador cambiar su propio rol o el de otros? Fuera de alcance: los roles se
  fijan al invitar (ver Assumptions); solo hay protección contra quedarse sin administradores.
- ¿Qué pasa si el servicio de autorización no está disponible? Se deniega el acceso (fallo
  cerrado), nunca se concede por defecto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE denegar el acceso a cualquier persona que no tenga una cuenta
  activa o una invitación pendiente a su correo, y NO DEBE crear cuenta ni datos para ella.
- **FR-002**: El sistema DEBE dejar de ofrecer el registro automático en el primer inicio de
  sesión descrito en la feature 001 (FR-001 y SC-001 de esa spec quedan sustituidos por esta).
- **FR-003**: El sistema DEBE soportar exactamente dos roles, `user` y `admin`; toda cuenta
  tiene uno y solo uno.
- **FR-004**: Un `user` DEBE poder hacer todo lo que la feature 001 permite hoy, sin cambios de
  comportamiento ni pérdida de datos.
- **FR-005**: Un `admin` DEBE poder hacer lo mismo que un `user` y, además, invitar, listar y
  revocar invitaciones y retirar el acceso de usuarios; el acceso retirado se restituye
  volviendo a invitar el mismo correo (FR-006).
- **FR-006**: El sistema DEBE permitir al administrador invitar a una persona indicando su
  correo, validando su formato y evitando duplicados (sin distinguir mayúsculas). Si el correo
  corresponde a una cuenta con el acceso retirado, la invitación reactiva esa cuenta con rol
  `user` en lugar de crear otra, conservando sus tareas.
- **FR-007**: Al aceptar una invitación (primer inicio de sesión con el correo invitado), el
  sistema DEBE crear la cuenta con el rol `user` y marcar la invitación como aceptada; una
  invitación solo puede aceptarse una vez.
- **FR-008**: Todas las operaciones de administración DEBEN exigir rol `admin` verificado en el
  servidor; ocultar opciones en la interfaz NO sustituye esa comprobación.
- **FR-009**: El sistema DEBE rechazar con "sin permiso" a un `user` que invoque una operación
  de administración, y con "no autenticado" a quien no tenga sesión (sin enmascarar uno con otro).
- **FR-010**: El sistema DEBE aplicar la revocación de acceso en un plazo acotado, también a
  personas con sesión abierta (ver SC-003).
- **FR-011**: El sistema DEBE conservar las tareas de un usuario al retirarle el acceso.
- **FR-012**: El sistema DEBE impedir que se quede sin administradores (no se puede revocar ni
  degradar al último `admin`).
- **FR-013**: La cuenta del propietario existente DEBE pasar a rol `admin` en el despliegue sin
  perder sus tareas y sin necesitar invitación; el procedimiento no DEBE permitir designar
  administradores a terceros fuera del propio administrador.
- **FR-014**: Cada usuario DEBE ver únicamente sus propias tareas; el aislamiento por usuario de
  la feature 001 se mantiene para todos los roles, sin acceso del admin a tareas ajenas.
- **FR-015**: El sistema DEBE registrar un rastro de auditoría (quién, qué, cuándo) de las
  invitaciones, aceptaciones, revocaciones y accesos denegados, sin datos sensibles.
- **FR-016**: La interfaz DEBE mostrar al administrador una pantalla de gestión de accesos y NO
  DEBE mostrarla a un `user`; a una persona sin acceso DEBE mostrarle un mensaje claro de que
  necesita invitación.
- **FR-017**: Los mensajes de denegación NO DEBEN revelar si un correo concreto está invitado o
  tiene cuenta a quien no tiene acceso.
- **FR-018**: El sistema DEBE denegar el acceso por defecto si no puede determinar el estado de
  autorización (fallo cerrado).
- **FR-019**: Los cambios de autenticación, autorización y modelo de datos DEBEN pasar la
  revisión de seguridad `mytasks-security-auditor` antes de fusionarse (Principio III).

### Key Entities *(include if feature involves data)*

- **Cuenta de usuario**: persona con acceso. Atributos: identificador estable de la cuenta
  Google, correo, rol (`user` | `admin`), estado (activo | revocado), fecha de alta. Es el
  primer dato de usuario persistido por la aplicación.
- **Invitación**: autorización previa para un correo. Atributos: correo (normalizado), estado
  (pendiente | aceptada | revocada), administrador que la creó, fechas de creación y de
  aceptación. Al aceptarse da lugar a una Cuenta de usuario con rol `user`, o reactiva la
  existente si tenía el acceso retirado.
- **Tarea**: sin cambios respecto a la feature 001; sigue perteneciendo a una única cuenta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de los intentos de acceso de cuentas sin invitación son denegados y
  generan 0 cuentas o datos nuevos.
- **SC-002**: Un administrador invita a una persona y esta accede por primera vez en menos de
  2 minutos, sin intervención adicional.
- **SC-003**: Una revocación impide el acceso de esa persona en menos de 5 minutos, incluida
  una sesión ya abierta.
- **SC-004**: El 100 % de las operaciones de administración intentadas por un `user` o un
  anónimo son rechazadas, verificado por pruebas automáticas de cada operación.
- **SC-005**: Todos los flujos principales de la feature 001 siguen pasando sin cambios para un
  `user` y para un `admin`, y el propietario conserva el 100 % de sus tareas tras el despliegue.
- **SC-006**: El 100 % de las invitaciones, aceptaciones, revocaciones y accesos denegados
  quedan en el rastro de auditoría.

## Assumptions

- **Autenticación**: se mantiene el inicio de sesión con Google de la feature 001; esta feature
  solo añade la decisión de *quién* puede entrar y con qué rol.
- **Invitación sin envío de correo**: el administrador indica el correo de la cuenta Google de
  la persona y le avisa por su cuenta; la aplicación no envía correos (hoy no existe esa
  capacidad). Si más adelante se quiere, será una feature aparte.
- **Roles fijos al invitar**: toda invitación crea rol `user`. Promover a alguien a `admin` o
  degradar a un administrador queda fuera de alcance; basta con el propietario como único
  administrador por ahora.
- **Sin caducidad de invitaciones** en esta versión; se revocan manualmente.
- **Un solo propietario/administrador inicial** y sin otras cuentas que migrar (aclarado el
  2026-10-22).
- **Fuera de alcance**: más roles, permisos finos, grupos, compartir tareas, recuperación de
  cuentas, borrado definitivo de cuentas y datos, y notificaciones por correo.
- **Entornos**: staging y producción tienen bases de usuarios separadas (feature 002), así que
  el administrador inicial se establece en cada entorno.
- **Dependencia**: requiere la autenticación y el aislamiento por usuario de la feature 001 y
  los despliegues por pipeline de la feature 002.
