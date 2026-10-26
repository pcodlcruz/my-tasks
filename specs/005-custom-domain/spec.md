# Feature Specification: Dominio propio con certificado gratuito en producción

**Feature Branch**: `feature/005-custom-domain`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "He comprado un nombre de dominio que quiero que apliquemos al proyecto de producción. Teniendo en cuenta que el Cloud Run está en Madrid, no podemos hacer uso de el mapeo de dominios que tiene el producto. Tenemos que usar Firebase. Además quiero que tengamos un certificado ssl gratuíto"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar a la aplicación de producción con mi propio dominio (Priority: P1)

Como persona invitada, quiero abrir la aplicación escribiendo el nombre de dominio propio del
proyecto (en lugar de la dirección larga y técnica actual) y ver la aplicación funcionando con el
candado de conexión segura, sin avisos del navegador.

**Why this priority**: es el objetivo de la feature. Sin esto no hay valor: el dominio comprado no
se usa. Por sí sola ya entrega una dirección reconocible y una conexión segura gratuita.

**Independent Test**: escribir el dominio en un navegador limpio y comprobar que carga la
aplicación, que el certificado es válido y emitido para ese dominio, y que se puede completar un
flujo básico (ver el tablero) sin avisos de seguridad.

**Acceptance Scenarios**:

1. **Given** el dominio propio apuntando a producción, **When** una persona lo abre en un
   navegador, **Then** se muestra la aplicación de producción por una conexión segura con un
   certificado válido para ese dominio y sin ningún aviso del navegador.
2. **Given** una persona que escribe la dirección con `http://`, **When** el navegador la
   solicita, **Then** es redirigida automáticamente a `https://` del mismo dominio.
3. **Given** el dominio propio abierto, **When** se usan las funciones habituales (tablero,
   tareas, perfil, avatar), **Then** se comportan exactamente igual que en la dirección anterior.

---

### User Story 2 - Iniciar sesión con Google desde el dominio propio (Priority: P1)

Como persona invitada, quiero iniciar sesión con mi cuenta de Google desde el dominio propio y
llegar a mi tablero igual que antes, sin errores de dominio no autorizado.

**Why this priority**: la aplicación solo es usable con sesión iniciada (nadie entra sin
invitación). Un dominio propio que no permite iniciar sesión es inservible, así que es inseparable
de la historia 1.

**Independent Test**: desde el dominio propio, pulsar «Iniciar sesión con Google» con una cuenta
invitada, completar el acceso y comprobar que se llega al tablero; repetir con una cuenta no
invitada y comprobar que ve «Necesitas una invitación».

**Acceptance Scenarios**:

1. **Given** una cuenta invitada, **When** inicia sesión desde el dominio propio, **Then** accede
   a su tablero y la sesión se mantiene al recargar.
2. **Given** una cuenta no invitada o revocada, **When** inicia sesión desde el dominio propio,
   **Then** recibe el mismo rechazo que en la dirección anterior.
3. **Given** el cierre de sesión, **When** la persona sale desde el dominio propio, **Then** no
   queda sesión abierta en ese dominio.

---

### User Story 3 - Certificado que se renueva solo y sin coste (Priority: P2)

Como propietario, quiero que el certificado de seguridad del dominio sea gratuito y se renueve
solo, para no tener que acordarme de comprarlo ni de renovarlo y no sufrir caídas por caducidad.

**Why this priority**: es un requisito explícito del propietario (certificado gratuito), pero la
conexión segura de la historia 1 ya lo cubre en el momento de publicar; esta historia garantiza
que se mantiene en el tiempo.

**Independent Test**: comprobar que el certificado no ha supuesto ningún cargo y que su fecha de
caducidad se renueva sin intervención del propietario a lo largo de más de un ciclo de validez.

**Acceptance Scenarios**:

1. **Given** el dominio en servicio, **When** se revisa la factura del proyecto, **Then** no
   aparece ningún concepto de certificado.
2. **Given** un certificado próximo a caducar, **When** llega el momento de renovarlo, **Then** se
   renueva sin ninguna acción del propietario y el servicio no se interrumpe.
3. **Given** que la renovación automática no pudiera completarse (p. ej. un registro DNS retirado),
   **When** esto ocurre, **Then** el propietario dispone de una guía para detectarlo y corregirlo
   antes de que caduque.

---

### User Story 4 - Una sola dirección canónica y las antiguas siguen sin romperse (Priority: P2)

Como persona que ya usa la aplicación, quiero que si entro por la variante del dominio que no es la
principal (con o sin `www`) acabe en la dirección canónica, y que mis marcadores a la dirección
antigua no se rompan de golpe.

**Why this priority**: evita direcciones duplicadas (y sesiones o marcadores repartidos entre
ellas) y hace la migración suave. No impide usar el dominio, por eso es P2.

**Independent Test**: abrir la variante no canónica del dominio y comprobar la redirección a la
canónica; abrir la dirección antigua de producción y comprobar que sigue respondiendo.

**Acceptance Scenarios**:

1. **Given** la variante no canónica del dominio, **When** se abre, **Then** se redirige de forma
   permanente a la canónica conservando la ruta solicitada.
2. **Given** la dirección técnica antigua de producción, **When** se abre, **Then** sigue
   mostrando la aplicación (no se corta el acceso a quien la tenía guardada).
3. **Given** la dirección de Hosting `pdlco-mytasks.web.app`, **When** se abre, **Then** muestra la
   misma aplicación sin redirigir; solo `https://inserttask.es` es la dirección canónica anunciada.

---

### User Story 5 - Publicar y mantener el dominio sin saltarse el pipeline (Priority: P3)

Como propietario, quiero que el dominio se declare y se aplique por el mismo camino controlado que
el resto de la infraestructura, y que existan instrucciones claras de los pasos que solo yo puedo
hacer (registros DNS en mi proveedor), para poder rehacerlo o diagnosticarlo sin depender de
memoria.

**Why this priority**: es la parte de gobierno (Principios V, VI y VII); necesaria para cerrar la
feature pero no es lo que ven las personas usuarias.

**Independent Test**: seguir la guía desde cero (en un dominio de prueba o simulando el proceso) y
comprobar que todos los pasos están descritos, que cada cambio de configuración pasó por PR y por
la aprobación del propietario, y que no se ejecutó ningún comando manual de despliegue.

**Acceptance Scenarios**:

1. **Given** el cambio de configuración del dominio, **When** se integra, **Then** pasa por PR, por
   el plan revisado y aprobado por el propietario y por el pipeline, sin operaciones manuales.
2. **Given** la guía operativa, **When** el propietario añade los registros DNS que indica,
   **Then** el dominio queda verificado y el certificado emitido sin más pasos ocultos.

---

### Edge Cases

- **El DNS aún no ha propagado o los registros están mal**: el dominio no resuelve o el certificado
  queda pendiente. La dirección técnica antigua sigue funcionando y la guía indica cómo
  comprobar el estado y cuánto puede tardar.
- **Sesiones existentes**: el navegador guarda la sesión por dominio, así que quien tenía la sesión
  abierta en la dirección antigua tendrá que iniciar sesión una vez en el dominio propio; no hay
  pérdida de datos.
- **Preferencias locales**: las preferencias que la aplicación guarda en el navegador (p. ej. la
  caché de apariencia) son por dominio; al entrar por el dominio nuevo se rehacen desde el perfil
  guardado en la nube, sin que la persona tenga que reconfigurar nada.
- **Dominio no autorizado en el inicio de sesión**: si el dominio propio no figura entre los
  autorizados del proveedor de identidad, el acceso con Google falla; debe poder detectarse en la
  validación previa al anuncio.
- **Política de seguridad del navegador**: la política de contenidos de la aplicación debe seguir
  permitiendo el inicio de sesión, el avatar subido y las llamadas a la API desde el dominio nuevo,
  sin errores en la consola.
- **Staging**: no recibe el dominio de producción ni sus redirecciones; tiene su propio subdominio
  de ensayo, `staging.inserttask.es`, que ejercita el mismo mecanismo (propiedad DNS, certificado,
  inicio de sesión) y se valida antes de dar por buena la validación de producción (Principio IV).
- **Propiedad del dominio compartida entre proyectos**: `inserttask.es` pertenece al proyecto de
  producción y `staging.inserttask.es` al de staging; Hosting debe aceptar ambas propiedades a la
  vez. Si no lo hiciera, el ensayo lo detecta antes de servir tráfico y se retira el dominio afectado.
- **Certificado que no se puede emitir** (p. ej. por restricciones de registros CAA en el
  dominio): la guía debe indicar cómo reconocer la causa.
- **Retirada futura del dominio**: debe poder quitarse sin dejar la aplicación inaccesible por su
  dirección técnica.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La aplicación de producción MUST ser accesible desde el dominio `inserttask.es`
  (raíz) y desde `www.inserttask.es`. La dirección canónica es `https://inserttask.es`;
  `www.inserttask.es` redirige a ella (FR-006).
- **FR-002**: La conexión al dominio propio MUST usar HTTPS con un certificado válido para ese
  dominio, de confianza pública, sin avisos del navegador.
- **FR-003**: El certificado MUST ser gratuito: la feature no puede introducir ningún coste
  recurrente por certificados.
- **FR-004**: El certificado MUST emitirse y renovarse automáticamente, sin intervención manual
  del propietario durante la vida del dominio.
- **FR-005**: Las solicitudes `http://` al dominio propio MUST redirigirse a `https://`.
- **FR-006**: `https://www.inserttask.es` MUST redirigir de forma permanente a
  `https://inserttask.es` conservando ruta y parámetros.
- **FR-007**: La aplicación MUST seguir funcionando de forma idéntica en el dominio propio: mismo
  contenido, misma API y mismos datos que en producción hoy; ninguna función puede degradarse.
- **FR-008**: El inicio de sesión con Google MUST funcionar desde el dominio propio, con las mismas
  reglas de invitación que hoy (invitada accede; no invitada o revocada, no).
- **FR-009**: El dominio propio MUST añadirse a los dominios autorizados del proveedor de
  identidad de producción sin eliminar los existentes.
- **FR-010**: Las llamadas de la aplicación a su API MUST funcionar desde el dominio propio
  (origen permitido por la API) y la política de seguridad de contenidos MUST permitir todo lo que
  la aplicación necesita (inicio de sesión, avatar subido) sin errores en la consola.
- **FR-011**: La dirección técnica actual de producción MUST seguir respondiendo con la
  aplicación; el pipeline la usa para sus comprobaciones y hay personas que pueden tenerla guardada.
- **FR-012**: La versión que sirve el dominio propio MUST ser la que despliega el pipeline en
  producción (la misma comprobada en staging); el dominio no puede servir otra copia.
- **FR-013**: El dominio propio MUST atenderse a través de Firebase, por decisión del propietario:
  los servicios están en la región de Madrid y el mapeo de dominios nativo de Cloud Run no está
  disponible allí. No se cambia de región ni se contrata otro servicio para evitarlo.
- **FR-014**: Staging MUST mantener la misma topología que producción (Principio IV) y MUST tener
  su propio dominio de ensayo, `staging.inserttask.es`, con certificado gratuito y gestionado, sin
  recibir el dominio de producción ni la redirección de `www`.
- **FR-020**: El dominio de ensayo de staging MUST ponerse en servicio y validarse (propiedad
  activa, certificado activo, inicio de sesión y funciones habituales) **antes** de dar por validado
  `inserttask.es`. Como el registrador no admite un `NS` para un subdominio (2026-10-26), `staging` se
  delega desde la zona de producción y el ensayo ocurre tras el cambio de servidores de nombres, no
  antes de crear los dominios de producción.
- **FR-015**: La declaración del dominio y su configuración MUST gestionarse como infraestructura
  como código, con plan revisable y aprobación explícita del propietario antes de aplicar
  (Principios V, VI y VII); el agente no ejecuta operaciones reales sobre Google Cloud fuera del
  MCP oficial.
- **FR-016**: Los pasos que solo puede hacer el propietario (cambiar los servidores de nombres en
  el registrador del dominio; `staging` se delega desde la zona de producción) MUST
  documentarse con valores exactos, el orden y cómo comprobar cada uno. El alta de los registros
  de Hosting ya no es un paso manual (FR-022).
- **FR-017**: La documentación operativa MUST incluir cómo detectar y resolver un certificado
  pendiente o con fallo de renovación, y cómo retirar el dominio dejando la dirección técnica
  operativa.
- **FR-018**: Los registros DNS, claves o identificadores de verificación que se documenten MUST
  ser solo valores públicos; no se guarda ningún secreto en el repositorio (Principio III).
- **FR-019**: Si el cambio afecta a la autenticación o a los orígenes permitidos, MUST pasar la
  revisión de seguridad con `mytasks-security-auditor` antes de fusionarse (Principio III).

- **FR-021**: El DNS del dominio MUST gestionarse en **Cloud DNS**, por decisión del propietario
  (no en el proveedor donde compró el dominio): una zona pública por entorno, en el proyecto de
  Google Cloud de ese entorno: `inserttask.es` en producción y `staging.inserttask.es` en staging,
  esta delegada desde la primera. El registrador solo conserva la delegación de servidores de
  nombres (`NS`).
- **FR-022**: Los registros que Firebase Hosting exige para cada dominio (propiedad con `TXT` y
  dirección con `A`) MUST declararse como infraestructura como código en la zona del entorno, sin
  copiarlos a mano. No MUST existir ningún registro `AAAA` en un dominio servido por Hosting, porque
  impide emitir el certificado.
- **FR-023**: Antes de cambiar los servidores de nombres del registrador, cualquier otro registro
  que el propietario necesite conservar (correo u otros) MUST haberse trasladado a la zona; si el
  dominio no tiene ninguno, se documenta que se ha comprobado.
- **FR-024**: Las identidades de Terraform y la de solo lectura de los planes MUST recibir solo
  los permisos de Cloud DNS necesarios, concedidos por el propietario (Principio V); el agente no
  usa credenciales personales.

### Key Entities

- **Dominio propio**: `inserttask.es`, comprado por el propietario; es la variante canónica de
  producción, y `www.inserttask.es` redirige a ella.
- **Dominio de ensayo**: `staging.inserttask.es`, subdominio del anterior que sirve la web de
  staging; no tiene variante `www`.
- **Certificado de seguridad**: acredita el dominio ante los navegadores; gratuito, emitido y
  renovado automáticamente; tiene fecha de caducidad y estado (pendiente, activo, fallo de
  renovación).
- **Registro DNS de verificación y de apuntado**: valores públicos que el propietario debe
  configurar en su proveedor para demostrar la propiedad y dirigir el tráfico.
- **Dominio autorizado de inicio de sesión**: dirección desde la que el proveedor de identidad
  admite el acceso con Google.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las aperturas del dominio propio en los navegadores principales
  (Chrome, Safari, Firefox y Edge actuales) muestran conexión segura sin ningún aviso.
- **SC-002**: El coste adicional por certificados es de 0 € durante toda la vida del dominio.
- **SC-003**: Ninguna renovación del certificado requiere intervención manual ni provoca una
  interrupción del servicio; el estado del certificado es consultable y la guía permite
  comprobarlo en menos de 5 minutos.
- **SC-004**: Una persona invitada puede iniciar sesión y llegar a su tablero desde el dominio
  propio en menos de 1 minuto, el 100 % de las veces con una cuenta invitada.
- **SC-005**: La mediana de tres cargas iniciales en frío desde el dominio propio no supera en más de
  150 ms la mediana desde la dirección técnica `run.app`, medidas (evento `Load` del navegador, con la
  caché desactivada) desde la misma red y a la misma hora, alternando ambas direcciones. El umbral es
  absoluto porque, con cargas de unos 450 ms, un porcentaje exige una precisión de pocos milisegundos
  que tres muestras no dan.
- **SC-006**: Los escenarios de validación de producción (tablero, perfil, avatar, administración
  de accesos) pasan al 100 % desde el dominio propio sin errores de seguridad en la consola.
- **SC-007**: Tras la publicación, el 100 % de las solicitudes `http://` y de la variante no
  canónica acaban en la dirección canónica `https://`.
- **SC-008**: El propietario, siguiendo solo la guía de la RUNBOOK y sin ayuda adicional, deja el
  dominio con sus servidores de nombres cambiados en menos de 1 hora de trabajo efectivo
  (sin contar la propagación DNS); el tiempo y si necesitó ayuda se anotan en el registro del ensayo.
- **SC-009**: `staging.inserttask.es` llega a certificado activo y pasa la validación de
  funciones y de inicio de sesión antes de dar por validado `inserttask.es` (ambos tras el cambio de servidores de nombres).

- **SC-010**: Un resolvedor público devuelve, para `inserttask.es` y `staging.inserttask.es`, los
  servidores de nombres de Cloud DNS del entorno correspondiente y los registros declarados en
  Terraform, sin que quede ningún registro de Hosting puesto a mano; el coste mensual de Cloud DNS
  se verifica en la factura de staging tras la primera semana (research R16).

## Assumptions

- El propietario es el titular del dominio y puede cambiar sus servidores de nombres en el
  registrador donde lo compró (el registrador **no** admite un `NS` de subdominio, así que `staging`
  se delega desde la zona de producción); esa parte queda fuera de Google Cloud y la hace él. El resto del DNS vive en Cloud DNS (FR-021).
- Si el dominio tiene o tuvo ya otros registros en el registrador (correo, por ejemplo), el
  propietario lo indica antes del cambio de servidores de nombres (FR-023). No se asume que no los
  haya.
- DNSSEC no forma parte de esta feature: se deja como decisión pendiente del propietario (el
  registro `.es` lo admite y Cloud DNS lo ofrece, pero exige publicar el registro `DS` en el
  registrador y dejar de usarlo mal puede romper la resolución del dominio).
- `inserttask.es` y `www.inserttask.es` se aplican **solo a producción** (`pdlco-mytasks`).
  Staging (`pdlco-mytasks-stg`) recibe únicamente el subdominio de ensayo `staging.inserttask.es`,
  decidido por el propietario para probar el mecanismo (Principio IV). Los registros DNS de ambos
  los escribe Terraform en Cloud DNS.
- El propietario ha decidido que el dominio se atiende a través de Firebase (Hosting) porque Cloud
  Run está en `europe-southwest1` (Madrid), donde el mapeo de dominios nativo no está disponible.
  La forma exacta (qué región de Cloud Run admite el encaminamiento, si hay que cambiar la
  topología) se decide en el plan; si Firebase no pudiera encaminar hacia esa región, se
  presentará como riesgo en el plan para decidir con el propietario, sin cambiar de región por
  iniciativa propia.
- El certificado gratuito es el que gestiona Firebase para el dominio; no se compra ni se importa
  ninguno.
- La API de la aplicación sigue en su dirección técnica actual; el dominio propio atiende la
  aplicación web. Si el plan recomienda servir también la API bajo el dominio propio, se valora
  como parte del diseño.
- La dirección técnica antigua de la web (`run.app`) sigue operativa y sin redirección (la usa el
  pipeline); no se anuncia más.
- Al poner Hosting delante de la web, cada entorno gana además su dirección `<proyecto>.web.app`
  (`pdlco-mytasks.web.app` y `pdlco-mytasks-stg.web.app`). Sirve la misma versión, **no redirige** a la
  canónica y no se anuncia: se necesita para validar el camino de Hosting antes de que exista el DNS y
  ya figura entre los dominios autorizados del inicio de sesión. La única dirección canónica anunciada
  es `https://inserttask.es`; `run.app` y `web.app` son alias técnicos (la sesión y las preferencias
  locales son por dirección, así que quien las use verá su sesión separada de la del dominio propio).
- Se cumple el flujo habitual: la feature pasa por staging y por la release a producción. El
  dominio de ensayo (`staging.inserttask.es`) se valida en staging tras el cambio de servidores de nombres,
  antes de la validación final de `inserttask.es`, que es en producción, por el propietario, tras el
  despliegue del pipeline.
- Las personas usuarias son las ya invitadas; no se prevé tráfico que requiera dimensionado
  adicional.
- La aplicación no tiene correo ni subdominios de servicio que gestionar; fuera de alcance: correo
  con el dominio, subdominios adicionales (salvo el de ensayo de staging) y protección extra (WAF,
  CDN de terceros).
