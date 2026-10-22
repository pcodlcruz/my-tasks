# Informe de Auditoría de Seguridad — Feature 003, Fase 1: acceso por invitación

**Fecha**: 2026-10-22
**Rama revisada**: `feature/003-user-roles-invitations-fase-1` (sin commitear en el momento de la revisión)
**Alcance**: tareas T001–T028 de `tasks.md`: dominio, repositorio y servicio de cuentas, `GET /api/v1/me`, dependencia `get_active_user` en todos los endpoints de tareas, bootstrap del administrador, frontend mínimo (consulta de cuenta y pantalla sin acceso), fixtures e2e y `deploy.yml`/`ci.yml`.
**Tipología detectada**: aplicación web (React) + API REST (FastAPI) + cloud-native/GCP (Firestore, Cloud Run, Identity Platform).
**Marcos aplicados**: OWASP Top 10 (A01, A04, A07, A09), OWASP API Security Top 10 (API1, API2, API5, API6), CIS Google Cloud Foundation Benchmark (identidad y registro).
**Nivel de riesgo global**: **Bajo**

---

## Resumen ejecutivo

La fase cumple su objetivo de seguridad: **un desconocido con una cuenta Google válida ya no obtiene ni datos ni cuenta**. La decisión se toma en el servidor en cada petición, falla cerrado y no distingue entre «nunca invitado» y «acceso retirado». No hay hallazgos críticos, altos ni medios, **nada bloquea la fusión**. Hay cuatro hallazgos bajos y tres observaciones informativas. Tres de ellas dependen de configuración que vive fuera del repositorio (proveedor de login y variables de GitHub Environment) y que solo el propietario puede comprobar.

Esta fase cierra además de forma efectiva el riesgo aceptado LOW-004 de la feature 001 (un token de una cuenta deshabilitada seguía siendo válido ~1 h): la revocación de acceso a datos es inmediata porque el estado de la cuenta se lee en cada petición.

---

## Controles verificados

Comprobados leyendo el código y ejecutando las pruebas (296 de backend, 74 unitarias y 29 e2e en verde):

| Control | Evidencia |
|---|---|
| **Autorización en el servidor, no en la UI** | `auth.py::get_active_user` es dependencia de los 9 endpoints de `/api/v1/tasks` y de `valid_task_id`; `test_access_enforcement.py` recorre cada ruta y comprueba que el conjunto cubierto coincide con el esquema OpenAPI. |
| **401 antes que 403** | `get_active_user` depende de `get_current_user`; probado con y sin token. |
| **Fallo cerrado** | Un error del repositorio se propaga (500); nunca concede. `test_resolve_session_does_not_grant_access_when_the_repository_fails`. |
| **Sin enumeración** | Misma respuesta 403 y mismo cuerpo para desconocido y revocado (`access_denied_handler`, probado para los 9 endpoints y en `/me`). La clave de búsqueda es el correo verificado del propio llamante, así que nadie puede sondear direcciones ajenas. |
| **Correo verificado obligatorio** | `email_verified is True` en `get_current_user` y comprobación en `resolve_session`; el bootstrap y las invitaciones no se aceptan con un correo sin verificar (probado). |
| **El `uid` y el rol nunca vienen del cliente** | `users/{uid}` se indexa con el `uid` del token verificado; el rol sale del documento. `MeOut` no acepta entrada. |
| **Una invitación se acepta una sola vez** | Transacción que lee y escribe sobre la misma instantánea (`_accept_invitation`); probado con 5 llamadas concurrentes: una cuenta, un evento `invitation_accepted`. |
| **El bootstrap no sustituye cuentas existentes** | `_create_bootstrap_admin` devuelve la cuenta existente sea cual sea su rol (probado). |
| **Reglas de Firestore** | `firestore.rules`: `allow read, write: if false` sobre `/{document=**}` cubre `users` e `invitations`. |
| **Sin secretos ni dependencias nuevas** | `BOOTSTRAP_ADMIN_EMAIL` es una dirección, no una credencial; `pyproject.toml` y `package.json` sin cambios. |
| **Pipeline** | `deploy.yml` exige exactamente una dirección válida antes de desplegar; el valor solo llega a la revisión de la API; se pasa por `env` y se cita siempre; los 12 pasos `run:` pasan `bash -n`. |
| **Auditoría** | Eventos `access_denied`, `invitation_accepted` y `bootstrap_admin_created` con `uid` y causa; sin tokens ni correos en claro (lista cerrada de campos). |
| **Fixtures e2e** | La siembra de invitaciones se hace desde el proceso de Playwright contra el emulador (`127.0.0.1`), nunca desde el bundle. |

---

## Hallazgos

### [LOW-001] El bootstrap puede conceder `admin` a más de una cuenta con el mismo correo
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A01: Broken Access Control (riesgo condicionado a configuración) |
| **Componente afectado** | `services/access_service.py::resolve_session`, `repositories/account_repository.py::_create_bootstrap_admin` |

**Descripción**
La regla de bootstrap se evalúa por `uid`: cualquier identidad cuyo token traiga el correo configurado, verificado y sin cuenta, obtiene rol `admin`. A diferencia de las invitaciones, no se «consume» ni comprueba que ya exista un administrador. Si Identity Platform llegara a tener dos identidades distintas con el mismo correo verificado, ambas serían administradoras.

**Evidencia**
`access_service.py`: la rama `normalized == self._bootstrap_admin_email` llama a `create_bootstrap_admin(uid, …)` sin otra condición. `data-model.md` afirma que el correo es único entre cuentas, pero la fase no lo hace cumplir (el hallazgo F4 de `/speckit-analyze` quedó diferido). Con solo Google habilitado y la opción «una cuenta por correo» activa, Identity Platform no genera esa situación; no es explotable en la configuración prevista.

**Remediación requerida**
Decidir una de dos: (a) acotar el bootstrap a «mientras no exista ningún administrador» en el entorno, o (b) mantenerlo tal cual y dejar escrito como requisito de configuración que solo Google está habilitado y que hay una cuenta por correo (ver INFO-001). Corregir también `data-model.md` para que no afirme una unicidad que no se aplica.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (tras decisión del propietario)
- Tipo de cambio: De implementación

---

### [LOW-002] Sin límite de tasa: cada petición de un desconocido autenticado cuesta lecturas de Firestore
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `get_active_user`, `GET /api/v1/me`, Cloud Run |

**Descripción**
Cualquier titular de una cuenta Google puede obtener un token válido y llamar a la API. Cada llamada denegada cuesta una lectura de Firestore (`users/{uid}`); `/me` cuesta además la lectura transaccional de la invitación. Es un coste pequeño pero ahora existe para quien no debería usar la aplicación, y no hay límite de tasa por identidad.

**Evidencia**
Ningún límite de tasa en `backend/src` (búsqueda de `rate_limit`/`slowapi` sin resultados); el único tope es `api_max_instances` (2 en staging, 5 en producción, `infra/envs/*/terraform.tfvars`). Las peticiones sin token se rechazan antes de leer Firestore, por lo que el vector exige una cuenta Google real.

**Remediación requerida**
Aceptar el riesgo explícitamente, o diseñar un límite de tasa por identidad o por IP en la capa de entrada (no en el código de la aplicación) y alertas de presupuesto de lecturas de Firestore. Al ser un proyecto personal, la primera opción es razonable.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-architect`
- Tipo de cambio: Arquitectónico

---

### [LOW-003] La huella del correo en los logs se puede invertir por diccionario
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A09: Security Logging and Monitoring Failures / minimización de datos |
| **Componente afectado** | `logging_config.py::email_fingerprint`, evento `invitation_accepted` |

**Descripción**
`target` es un SHA-256 truncado y sin sal del correo. Quien lea los logs puede confirmar si una dirección concreta fue invitada probando candidatos. No revela direcciones desconocidas, pero tampoco anonimiza: es seudonimización débil, y la documentación de la fase la presenta como «sin correos en claro».

**Evidencia**
`email_fingerprint` aplica `hashlib.sha256(email.encode()).hexdigest()[:12]` sin clave.

**Remediación requerida**
Elegir: usar una huella con clave secreta de entorno (HMAC), o dejar de registrar `target` y apoyarse en `uid`, o mantenerlo y documentar que es solo seudonimización. La opción más simple es la última dada la audiencia de los logs (el propietario).

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación

---

### [LOW-004] Los desconocidos siguen creando identidades en Identity Platform
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A04: Insecure Design (riesgo residual aceptado en el diseño) |
| **Componente afectado** | Identity Platform (`infra/modules/environment/identity.tf`) |

**Descripción**
La feature impide el *uso* de la aplicación, pero no el *registro* en Firebase Auth: cualquier cuenta Google que pulse «Iniciar sesión» crea una identidad en el proyecto. No obtiene ningún dato, pero ocupa cuota y entra en el recuento de usuarios activos mensuales, que se factura a partir de cierto umbral.

**Evidencia**
`research.md` R1 rechazó las funciones de bloqueo y el cierre del alta por coste y complejidad. `identity.tf` no gestiona el proveedor de login.

**Remediación requerida**
Mantener la decisión de diseño. Añadir una alerta de presupuesto o de usuarios activos en Identity Platform para detectar abuso, y revisar la decisión si el número de identidades ajenas crece.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-architect` (diseño de la alerta); su aplicación real exigiría `mytasks-google-cloud-operator` con confirmación del propietario
- Tipo de cambio: Arquitectónico

---

## Observaciones informativas

### [INFO-001] La seguridad del bootstrap descansa en configuración que no está en el repositorio
El proveedor de login se configura a mano en cada entorno (`identity.tf`, `infra/RUNBOOK.md`). Las garantías de la fase suponen que **solo Google está habilitado** y que Identity Platform mantiene **una cuenta por correo**. La comprobación `email_verified` protege incluso si hubiera un proveedor adicional con correos sin verificar, pero no sustituye a la configuración. No se puede verificar desde el código; debe comprobarlo el propietario en staging (T057) y producción. *No encaja en una fila de la tabla de `CLAUDE.md`: decisión del propietario sobre quién lo verifica.*

### [INFO-002] La variable `BOOTSTRAP_ADMIN_EMAIL` decide quién administra el entorno
Quien pueda editar variables del GitHub Environment puede designar al administrador del siguiente despliegue. No es un riesgo nuevo (esa misma persona controla el despliegue), pero conviene proteger los Environments `staging` y `production` con revisores obligatorios y limitar quién puede editar sus variables. *No encaja en la tabla de `CLAUDE.md`: decisión del propietario.*

### [INFO-003] Una revocación a mitad de sesión se ve como error genérico hasta el siguiente refresco
El backend deniega de inmediato, pero el cliente solo reevalúa la cuenta al recuperar el foco de la ventana. Mientras tanto, las acciones sobre tareas muestran el aviso genérico. No es un fallo de seguridad (el servidor ya no concede nada), pero afecta a la experiencia de la Historia 3. *Destinatario*: `mytasks-frontend-developer`, en la Fase 3.

---

## Categorías sin información suficiente

- **Gestión de incidentes y recuperación**: fuera del alcance de esta fase; la recuperación del acceso de administrador si se pierde la cuenta está prevista en T053 (`RUNBOOK.md`) y deberá revisarse entonces.
- **Seguridad de red y perímetro**: sin cambios en esta fase (los servicios Cloud Run siguen siendo públicos por diseño; la autorización es de aplicación).

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| LOW-001 | Baja | Desarrollador backend (tras decisión del propietario) | `mytasks-backend-developer` |
| LOW-002 | Baja | Arquitecto | `mytasks-google-cloud-architect` |
| LOW-003 | Baja | Desarrollador backend | `mytasks-backend-developer` |
| LOW-004 | Baja | Arquitecto (y operador si se aplica) | `mytasks-google-cloud-architect` / `mytasks-google-cloud-operator` |
| INFO-001 | Informativa | Propietario (verificación manual) | Sin destinatario en la tabla: decide el propietario |
| INFO-002 | Informativa | Propietario (configuración de GitHub) | Sin destinatario en la tabla: decide el propietario |
| INFO-003 | Informativa | Desarrollador frontend | `mytasks-frontend-developer` |

## Recomendación

Sin hallazgos que bloqueen la fusión de la Fase 1. Antes de fusionar, el propietario debe crear la variable `BOOTSTRAP_ADMIN_EMAIL` en ambos Environments (T029) y decidir qué hacer con LOW-001 (acotar el bootstrap o documentar el requisito). El resto puede ir al backlog técnico.
