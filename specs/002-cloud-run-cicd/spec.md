# Feature Specification: Infraestructura en Google Cloud y pipeline CI/CD

**Feature Branch**: `feature/002-cloud-run-cicd`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Pasemos a crear la Feature de Infraestructura y CICD. Quiero que usemos la nube de Google Cloud y despleguemos la aplicación en Cloud Run (ambos, front y back). Quiero que el pipeline de CICD disponga de un entorno de development que se integrará con los pushes a develop. Cuando los pushes sean a master la aplicación desplegará en los Cloud Run productivos"

## Clarifications

### Session 2026-09-29

- Q: ¿Qué mecanismo técnico debe garantizar que el agente nunca pueda usar las credenciales personales del propietario en Google Cloud? → A: Almacén de credenciales aislado para el MCP (solo con la identidad del agente) más bloqueo técnico de acceso a las credenciales personales (sandbox, `deny` de lectura y hook contra cambios de identidad); no basta una instrucción al LLM.
- Q: ¿Qué credencial debe contener el almacén aislado del MCP para que el agente actúe como su cuenta de servicio? → A: Una clave de la propia cuenta de servicio del agente, en un fichero fuera del repo y fuera del alcance de lectura del agente, usada directamente (sin suplantación) y rotada periódicamente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Despliegue automático a staging al integrar en `develop`, `release/*` o `hotfix/*` (Priority: P1)

Como propietario del proyecto, cuando una PR se fusiona en `develop` (o se actualiza una rama
`release/*` o `hotfix/*`, FR-002), quiero que la aplicación
completa (frontend y backend) se construya, se pruebe y se despliegue sola en un entorno de
staging alojado en Google Cloud, para poder validar el cambio en un entorno real sin ninguna
acción manual.

**Why this priority**: es el primer entorno real de la aplicación y la base de todo lo demás:
sin staging funcionando no hay dónde validar ni desde dónde promocionar a producción. Por sí
sola ya entrega valor (la app accesible en la nube).

**Independent Test**: fusionar una PR trivial en `develop` y comprobar, sin intervenir, que el
pipeline termina en verde y que la URL de staging sirve la versión nueva del frontend y del
backend, con el flujo principal de tareas funcionando.

**Acceptance Scenarios**:

1. **Given** una PR fusionada en `develop` con todos los tests en verde, **When** termina la
   fusión, **Then** el pipeline se inicia automáticamente y publica la nueva versión del
   frontend y del backend en staging.
2. **Given** un despliegue a staging terminado, **When** el propietario abre la URL de staging,
   **Then** el frontend carga y se comunica con el backend de staging (no con el de local ni con
   el de producción).
3. **Given** una PR fusionada en `develop` cuyos tests fallan en el pipeline, **When** el
   pipeline se ejecuta, **Then** no se despliega nada y el propietario recibe la indicación
   clara del paso que falló, quedando staging en la última versión buena.
4. **Given** el pipeline de staging en ejecución, **When** termina, **Then** el resultado
   (versión desplegada, commit de origen, éxito o fallo) queda registrado y es consultable.

---

### User Story 2 - Despliegue automático a producción al integrar en `main` (Priority: P1)

Como propietario del proyecto, cuando una release o un hotfix se fusiona en `main`, quiero que
la misma aplicación se despliegue automáticamente en el entorno de producción en Google Cloud,
para publicar a los usuarios reales solo mediante el pipeline y sin pasos manuales.

**Why this priority**: es el objetivo final de la feature (entregar el producto real) y
materializa los Principios IV y VI de la constitución. Depende de la historia 1 porque
producción replica la topología de staging.

**Independent Test**: fusionar una release en `main` y comprobar que el pipeline despliega en
producción y que la URL de producción sirve la nueva versión, sin haber tocado staging ni
ninguna otra vía de despliegue.

**Acceptance Scenarios**:

1. **Given** una PR de release o hotfix fusionada en `main` con los tests en verde, **When**
   termina la fusión, **Then** el pipeline despliega frontend y backend en producción.
2. **Given** un despliegue a producción terminado, **When** un usuario abre la URL de
   producción, **Then** el frontend carga y usa exclusivamente el backend y los datos de
   producción.
3. **Given** una fusión en `main`, **When** el pipeline de producción se ejecuta, **Then**
   despliega la misma versión de la aplicación que ya se validó en staging (mismos artefactos),
   no una reconstrucción distinta.
4. **Given** un fallo durante el despliegue a producción, **When** el pipeline lo detecta,
   **Then** la versión anterior sigue sirviendo el 100 % del tráfico y el propietario es
   avisado del fallo.

---

### User Story 3 - Entornos aislados y reproducibles (Priority: P2)

Como propietario, quiero que staging y producción estén completamente aislados entre sí (datos,
identidades, configuración) y definidos como código, para que un error en staging jamás afecte
a datos reales y para poder recrear cualquier entorno de forma predecible.

**Why this priority**: es lo que hace seguros los dos despliegues anteriores, pero puede
abordarse tras tener el flujo mínimo funcionando; sin ella el riesgo crece pero el pipeline
opera.

**Independent Test**: comparar las definiciones de ambos entornos y verificar que difieren solo
en valores de dimensionado y de identidad; comprobar que un dato creado en staging no aparece en
producción y viceversa.

**Acceptance Scenarios**:

1. **Given** los entornos de staging y producción, **When** se comparan sus definiciones,
   **Then** tienen la misma topología y solo difieren en dimensionado y valores propios de cada
   entorno.
2. **Given** una tarea creada en staging, **When** se consulta producción, **Then** la tarea no
   existe (datos separados).
3. **Given** el repositorio completo, **When** se inspecciona, **Then** no contiene ningún
   secreto ni credencial; cualquier secreto que la aplicación llegara a necesitar se inyecta en
   tiempo de ejecución desde el gestor de secretos del entorno (hoy no hay ninguno).
4. **Given** las definiciones de infraestructura, **When** se solicita crear un entorno desde
   cero, **Then** el resultado es equivalente al existente sin pasos manuales no documentados.

---

### User Story 4 - Visibilidad del estado y de los fallos (Priority: P3)

Como propietario, quiero ver de un vistazo qué versión está desplegada en cada entorno y si la
aplicación está sana, y recibir aviso cuando un pipeline o un servicio falle, para reaccionar
sin tener que vigilar activamente.

**Why this priority**: mejora la operación pero no bloquea el despliegue; puede llegar después
de que ambos entornos funcionen.

**Independent Test**: provocar un fallo controlado de pipeline en una rama de prueba y comprobar
que el aviso llega; consultar la versión desplegada de cada entorno sin acceder a la
infraestructura.

**Acceptance Scenarios**:

1. **Given** un pipeline que falla, **When** termina, **Then** el propietario recibe una
   notificación con el paso fallido y el enlace al detalle.
2. **Given** cada entorno desplegado, **When** el propietario consulta su estado, **Then**
   puede saber qué commit/versión está sirviendo y si responde correctamente.

---

### Edge Cases

- ¿Qué ocurre si dos fusiones consecutivas en `develop` (o en `main`) disparan pipelines
  solapados? Debe prevalecer la más reciente sin dejar el entorno en un estado mezclado.
- ¿Qué ocurre si el despliegue del backend termina bien pero el del frontend falla (o al
  revés)? El entorno no debe quedar con versiones incompatibles sirviendo tráfico.
- ¿Qué ocurre si un cambio de contrato entre frontend y backend llega en la misma PR? Ambos
  deben desplegarse como una unidad coherente.
- ¿Qué ocurre si el pipeline no encuentra un secreto o configuración obligatoria de un
  entorno? Debe fallar antes de desplegar, con un mensaje que indique qué falta.
- ¿Qué ocurre si se fusiona en `main` algo que nunca pasó por `develop` (p. ej. un hotfix)?
  El hotfix sigue el flujo `hotfix/*` → `main` con retro-merge a `develop` y aun así solo se
  despliega vía pipeline tras pasar los tests.
- ¿Qué ocurre si alguien intenta desplegar a mano en staging o producción? Debe estar
  impedido por permisos: solo la identidad del pipeline puede desplegar.
- ¿Qué ocurre si el agente intenta, por error o por una instrucción maliciosa, usar la cuenta
  personal (leer sus credenciales, forzar otra identidad en un comando o usar un SDK con las
  credenciales por defecto)? La operación falla por falta de acceso técnico, no por decisión del
  agente, y el intento queda registrado.
- ¿Qué ocurre con las PR abiertas (antes de fusionar)? Deben ejecutar los tests en CI, pero
  nunca desplegar a staging ni a producción.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE alojar el frontend y el backend de la aplicación como dos
  servicios independientes en Cloud Run de Google Cloud, en cada entorno (staging y
  producción).
- **FR-002**: El pipeline DEBE ejecutarse automáticamente en cada fusión (push) en `develop`,
  `release/*` y `hotfix/*` y desplegar frontend y backend en el entorno de staging, de modo que
  todo lo que llegue a `main` se haya validado antes en staging (Principio IV).
- **FR-003**: El pipeline DEBE ejecutarse automáticamente en cada fusión (push) en `main` y
  desplegar frontend y backend en el entorno de producción.
- **FR-004**: El pipeline DEBE ejecutar, antes de cualquier despliegue, los tests de los tres
  niveles exigidos por la constitución (unitarios, integración contra el emulador y
  end-to-end) y NO DEBE desplegar si alguno falla.
- **FR-005**: El pipeline DEBE ejecutar los mismos tests como *checks* en las PR hacia
  `develop`, `main`, `release/*` y `hotfix/*` (sin desplegar), de modo que puedan configurarse
  como *required status checks* de los rulesets de GitHub.
- **FR-006**: El despliegue a producción DEBE promover los mismos artefactos ya validados en
  staging, en lugar de reconstruirlos.
- **FR-007**: Un despliegue fallido NO DEBE sustituir la versión que está sirviendo tráfico; el
  entorno DEBE seguir sirviendo la última versión correcta.
- **FR-008**: Frontend y backend de un mismo commit DEBEN desplegarse como una unidad: el
  entorno no DEBE servir tráfico con una combinación incompatible de versiones. Como dos
  servicios no pueden conmutarse atómicamente, los cambios del contrato de la API DEBEN ser
  compatibles hacia atrás durante una versión (hasta que la versión anterior ya no esté desplegada
  en ningún entorno) y el CI DEBE rechazar los que no lo sean.
- **FR-009**: Staging y producción DEBEN estar completamente aislados: proyectos o recursos,
  datos, identidades de ejecución y configuración propios de cada uno.
- **FR-010**: Staging y producción DEBEN tener la misma topología y configuración; solo puede
  diferir el dimensionado y los valores propios de cada entorno (Principio IV).
- **FR-011**: Toda la infraestructura DEBE estar definida como código versionado en el
  repositorio, de forma que pueda recrearse cualquier entorno de manera reproducible.
- **FR-012**: Los secretos y credenciales NO DEBEN almacenarse en el repositorio; los que la
  aplicación necesite en ejecución DEBEN inyectarse desde el gestor de secretos de Google Cloud
  (hoy la aplicación no necesita ninguno, research R8).
- **FR-013**: Solo la identidad del pipeline DEBE tener permiso de despliegue en staging y
  producción; ni la cuenta de servicio del agente ni credenciales personales pueden
  desplegar (Principios V y VI). El pipeline DEBE autenticarse en Google Cloud sin claves de
  larga duración almacenadas en GitHub.
- **FR-014**: El frontend de cada entorno DEBE comunicarse únicamente con el backend de su
  propio entorno, y las URL/valores que dependen del entorno DEBEN configurarse por entorno,
  no fijarse en el código.
- **FR-015**: El backend de cada entorno DEBE usar su propia base de datos Firestore en modo
  nativo, aislada de la del otro entorno.
- **FR-016**: El pipeline DEBE verificar, tras cada despliegue, que los servicios responden
  correctamente (comprobación de salud) y DEBE marcar el despliegue como fallido si no es así.
- **FR-017**: Cada ejecución del pipeline DEBE dejar constancia de qué commit y versión se
  desplegó, en qué entorno y con qué resultado.
- **FR-018**: El propietario DEBE recibir una notificación cuando un pipeline falle.
- **FR-019**: Cuando dos ejecuciones del mismo entorno se solapen, el pipeline DEBE evitar
  despliegues concurrentes y DEBE dejar desplegada la versión más reciente.
- **FR-020**: Cualquier cambio de infraestructura DEBE requerir la confirmación explícita del
  propietario antes de aplicarse, y toda operación sobre Google Cloud realizada por el agente
  DEBE hacerse por el MCP oficial con la cuenta de servicio del agente (Principio V).
- **FR-022**: Debe ser **técnicamente imposible**, no solo estar prohibido por instrucción, que el
  agente use credenciales personales del propietario en Google Cloud. El MCP DEBE ejecutarse con
  un almacén de credenciales aislado que contenga únicamente la identidad del agente, sin
  acceso a las credenciales personales del propietario. La identidad del agente se materializa
  como una clave de su propia cuenta de servicio, usada directamente (sin suplantación desde
  una cuenta personal).
- **FR-025**: La clave de la cuenta de servicio del agente DEBE almacenarse fuera del
  repositorio y fuera del alcance de lectura del agente, tener permisos de fichero restringidos
  al propietario, rotarse periódicamente y poder revocarse de inmediato. Es la única credencial
  de larga duración permitida para el agente; el pipeline sigue sin usar claves (FR-013).
- **FR-023**: El agente NO DEBE poder leer, copiar ni reutilizar las credenciales personales de
  Google Cloud del equipo (configuración de la CLI ni credenciales por defecto de aplicación), y
  cualquier intento de cambiar de identidad (p. ej. forzar otra cuenta o suplantación desde un
  comando, o iniciar sesión con otra cuenta) DEBE ser bloqueado técnicamente y quedar
  registrado.
- **FR-024**: La garantía de FR-022 y FR-023 DEBE ser verificable con una prueba repetible: cada
  operación del agente sobre Google Cloud se atribuye en el registro de auditoría de Google
  Cloud a la cuenta de servicio del agente, y ninguna a una identidad personal.
- **FR-021**: La feature DEBE documentar en español el flujo de despliegue, los entornos, sus
  URL y el procedimiento para recuperarse de un despliegue fallido.
- **FR-026**: El propietario DEBERÍA recibir un aviso cuando el gasto de cada proyecto de Google
  Cloud alcance umbrales definidos (50, 90 y 100 % de un presupuesto), para detectar costes
  inesperados de una API pública con escalado automático.

### Key Entities *(include if feature involves data)*

- **Entorno**: contexto de ejecución aislado de la aplicación (`staging`, `producción`), con su
  propia configuración, identidades, secretos y datos.
- **Servicio de aplicación**: cada uno de los dos servicios desplegados por entorno (frontend y
  backend), con su versión activa y su URL.
- **Ejecución de pipeline**: instancia del pipeline asociada a un commit y a una rama de origen;
  tiene resultado (éxito/fallo), pasos, y el entorno destino si llegó a desplegar.
- **Versión desplegada**: artefacto inmutable identificado por el hash de contenido de su
  componente (con el commit de origen como trazabilidad), promocionable de staging a producción.
- **Secreto/configuración de entorno**: valor sensible o dependiente del entorno, gestionado
  fuera del repositorio.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Desde la fusión de una PR en `develop`, la nueva versión está disponible en
  staging en menos de 15 minutos, sin ninguna acción manual, en el 95 % de las ejecuciones.
- **SC-002**: Desde la fusión en `main`, la nueva versión está disponible en producción en
  menos de 15 minutos, sin ninguna acción manual, en el 95 % de las ejecuciones.
- **SC-003**: El 100 % de los despliegues a staging y producción se realiza a través del
  pipeline; ninguna otra identidad tiene permiso para desplegar.
- **SC-004**: Ningún despliegue con tests fallidos llega a un entorno (0 casos).
- **SC-005**: Ante un despliegue fallido, los usuarios no perciben interrupción del servicio:
  el entorno sigue sirviendo la versión anterior (0 respuestas 5xx atribuibles al despliegue).
- **SC-006**: El propietario conoce el fallo de un pipeline en menos de 5 minutos desde que
  ocurre, sin consultar manualmente el pipeline.
- **SC-007**: Un entorno completo puede recrearse desde las definiciones del repositorio, sin
  pasos manuales no documentados.
- **SC-008**: El análisis de secretos sobre el repositorio no detecta ninguna credencial.
- **SC-009**: Los datos creados en staging son inaccesibles desde producción y viceversa
  (0 fugas en la verificación de aislamiento).
- **SC-010**: En una prueba de intrusión controlada, el 100 % de los intentos del agente de usar
  credenciales personales de Google Cloud (leerlas, forzar otra identidad, usar credenciales por
  defecto) fracasa, y el 100 % de las operaciones del agente registradas en la auditoría de
  Google Cloud figura a nombre de la cuenta de servicio del agente.

## Assumptions

- **Rama de producción**: la petición menciona `master`; en este repositorio la rama de
  producción es `main` (GitFlow definido en la constitución), por lo que producción se despliega
  desde `main`.
- **Nombre del entorno intermedio**: la petición habla de un entorno de "development" integrado
  con `develop`; la constitución (Principio IV) lo denomina **staging** y lo mapea a `develop`.
  Se usa "staging" para no crear un cuarto entorno; "local" sigue siendo el único entorno de
  desarrollo y pruebas manuales.
- **Ciclo de release**: la promoción a producción sigue el GitFlow existente (`develop` →
  `release/*` → `main`); el pipeline no añade aprobaciones propias más allá de la fusión
  explícita del propietario en `main` (Principio VII).
- **Alcance de la petición**: se despliega la aplicación existente (feature 001: frontend
  React y backend FastAPI con Firestore); no se añade funcionalidad de negocio.
- **Restricciones ya fijadas por la petición y la constitución**: Google Cloud como única nube,
  Cloud Run para frontend y backend, Firestore como persistencia, pipeline CI/CD como única vía
  de despliegue. La elección de la herramienta concreta de CI/CD, de proyectos/regiones, del
  registro de artefactos y del proveedor de IaC se decide en `/speckit-plan` con el skill
  `mytasks-google-cloud-architect`.
- **Autenticación de usuarios**: el mecanismo de autenticación de la aplicación es el ya
  implementado en la feature 001; esta feature solo debe garantizar que su configuración y
  secretos se inyectan por entorno. Su diseño no se modifica aquí.
- **Dominio propio y HTTPS**: se usarán las URL gestionadas por la plataforma (con HTTPS) en
  ambos entornos; un dominio personalizado queda fuera del alcance de esta feature.
- **Dimensionado**: staging usa el mínimo coste posible (puede escalar a cero); producción se
  dimensiona de forma acorde a un uso personal. Se aplican los estándares habituales de
  disponibilidad de un servicio gestionado, sin un objetivo de SLA formal.
- **Dependencias externas**: existe el repositorio en GitHub con los rulesets activos;
  los proyectos de Google Cloud de cada entorno y la configuración del MCP de Google Cloud con
  la cuenta de servicio del agente (`mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com`)
  son un requisito previo. Mientras el MCP no esté configurado según FR-022 a FR-025, no se
  realizan operaciones reales sobre Google Cloud y esta feature se queda en diseño.
- **Estado actual del MCP**: hoy el MCP de Google Cloud está configurado por suplantación de la
  cuenta del agente desde las credenciales personales del propietario, lo que **no** cumple
  FR-022. Migrarlo al almacén aislado es un entregable de esta feature y un requisito previo de
  cualquier operación real sobre Google Cloud. La regla `deny` de `Bash(gcloud:*)` se mantiene
  como capa adicional, pero no cuenta como garantía suficiente.
- **Constitución**: los mecanismos "Sin credenciales personales (V)" y "Despliegue solo vía
  pipeline (VI)" de la tabla de Mecanismos de Cumplimiento están *pendientes*; esta feature los
  implementa. Pasarlos a *activo* requiere una PR de enmienda ratificada por el propietario.
- **Fuera de alcance**: dominio personalizado, entornos efímeros por PR, despliegues
  *canary*/*blue-green* avanzados, monitorización y alertas de aplicación más allá de la
  comprobación de salud y la notificación de fallos del pipeline, y migración de datos entre
  entornos.
- **Revisión de seguridad**: al tocar identidades, permisos y secretos, la feature requiere
  revisión con `mytasks-security-auditor` antes de fusionarse (Principio III).
