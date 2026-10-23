# Informe de Auditoría de Seguridad — Feature 003, revisión final: acceso por invitación y administración

**Fecha**: 2026-10-23
**Rama revisada**: `feature/003-user-roles-invitations-fase-4` (sobre `develop` con las Fases 1, 2 y 3 fusionadas)
**Alcance**: la feature completa (T001–T062) y la documentación de la Fase 4 (T053–T055): `infra/RUNBOOK.md` sección 12, `README.md`, el contrato `specs/001-eisenhower-task-manager/contracts/openapi.yaml` v1.2.0 y las anotaciones en `spec.md`, `plan.md` y `data-model.md` de la 001. Esta revisión consolida las de las fases (`security-review-fase-1.md`, `-fase-2.md`, `-fase-3.md`) y añade el riesgo residual de Identity Platform y el enlace cuenta↔`uid` frente al correo, que T056 reservaba.
**Tipología detectada**: aplicación web (React, SPA en nginx) + API REST (FastAPI) + cloud-native/GCP (Firestore, Cloud Run, Identity Platform).
**Marcos aplicados**: OWASP Top 10 (A01, A04, A07, A09), OWASP ASVS (V2, V3, V4), OWASP API Security Top 10 (API1, API2, API4, API5), CIS Google Cloud Foundation Benchmark (identidad y registro).
**Nivel de riesgo global**: **Bajo**

---

## Resumen ejecutivo

La feature cumple su objetivo de seguridad: **un desconocido con una cuenta de Google ya no obtiene ni cuenta ni datos**, el rol se decide siempre en el servidor y la revocación de acceso es inmediata. No hay hallazgos críticos, altos ni medios en el conjunto de la feature; **nada bloquea la fusión de la Fase 4 ni el paso a producción**. Quedan abiertos, ninguno con impacto sobre la confidencialidad de las tareas de otra persona, **tres hallazgos bajos nuevos** de esta revisión y **ocho bajos heredados** de las revisiones por fase (tabla de estado más abajo). Tres cosas conviene cerrar **antes del release a producción**: LOW-001 de la Fase 3 (vaciar la caché del cliente al cambiar de usuario), la comprobación manual de la configuración de Identity Platform (solo Google y una cuenta por correo) y la validación en staging (T057).

La documentación de la Fase 4 se contrastó con el código y **se corrigieron en ella dos afirmaciones que no eran ciertas** (ver «Correcciones hechas durante la revisión»).

---

## Controles verificados

Comprobados leyendo el código y los documentos, y con las suites de cada fase (387 de backend, 113 unitarias de frontend y 36 e2e en verde en la Fase 3; esta fase no cambia código).

| Control | Evidencia |
|---|---|
| **Sin cuenta, sin datos** | `get_active_user` es dependencia de todos los endpoints de tareas y `require_admin` de los de administración; `test_access_enforcement.py` recorre cada ruta de tareas y comprueba que el conjunto coincide con el esquema OpenAPI. Un `user`, un revocado y un desconocido reciben el mismo 403. |
| **Las cuentas solo nacen en un sitio** | `AccessService.resolve_session` (vía `GET /api/v1/me`): invitación pendiente de un correo **verificado** o el correo de `BOOTSTRAP_ADMIN_EMAIL`. Ningún endpoint de tareas tiene efectos de alta. |
| **Aceptación atómica** | `_accept_invitation` lee y escribe sobre la misma instantánea; probado con llamadas concurrentes (una cuenta, un evento). |
| **El rol no viene del cliente** | Sale del documento `users/{uid}`; `InvitationIn` tiene `extra="forbid"`; no existe endpoint que cree, degrade o cambie roles. |
| **El último administrador no se pierde** | `revoke_account` del dominio rechaza a cualquier `admin` (409), dentro de la transacción. |
| **Firestore cerrado al cliente** | `firestore.rules`: `allow read, write: if false` sobre `/{document=**}`; `users` e `invitations` solo se leen y escriben desde la API. |
| **Interfaz sin autoridad** | `useIsAdmin`/`AdminRoute` solo ocultan y redirigen; las llamadas de administración las vuelve a autorizar el servidor. Sin almacenamiento en el navegador ni `dangerouslySetInnerHTML`; CSP y cabeceras sin cambios (`script-src 'self' https://apis.google.com`, sin `unsafe-inline`). |
| **Tope de invitaciones** | 50 pendientes, contados dentro de la transacción; probado con dos peticiones simultáneas por el último hueco. |
| **Auditoría** | Eventos `access_denied`, `invitation_created`, `invitation_accepted`, `invitation_revoked`, `access_revoked`, `access_reactivated` y `bootstrap_admin_created` con lista cerrada de campos; ni tokens ni correos en claro. |
| **Pipeline** | `deploy.yml` exige exactamente una dirección válida en `BOOTSTRAP_ADMIN_EMAIL` antes de desplegar. T029 (variable creada en ambos entornos) está marcada como hecha por el propietario. |
| **Contrato** | `contracts/openapi.yaml` v1.2.0 comparado con el exportado por `backend/scripts/export_openapi.py`: los endpoints nuevos, el 403 de las operaciones de tareas y los esquemas `MeOut`, `InvitationIn/Out`, `AccountOut`, `InviteResultOut`, `AccessListOut` y `TaskOut` coinciden en rutas, códigos, propiedades y campos obligatorios. Las únicas diferencias son anteriores a la feature (el 503, que la API nunca declara, y los 401/404/409 de las operaciones de tareas que el router no declara pero el contrato sí). |

---

## Hallazgos nuevos de esta revisión

### [LOW-001] Los desconocidos siguen creando identidades en Identity Platform (riesgo residual aceptado, ahora verificado)
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A04: Insecure Design / CIS GCP (identidad) |
| **Componente afectado** | Identity Platform (`infra/modules/environment/identity.tf`) |

**Descripción**
La feature impide *usar* la aplicación, no *registrarse* en Identity Platform: cualquier cuenta de Google que pulse «Iniciar sesión» crea un usuario de Firebase Authentication en el proyecto, aunque después reciba un 403 y no obtenga ninguna cuenta ni dato. Esas identidades ocupan cuota y cuentan en los usuarios activos mensuales, que se facturan a partir de un umbral (no verificado aquí). Se confirma que no hay mitigación activa. Cerrar el alta en Identity Platform **no es una opción compatible con este diseño**: la persona invitada también es nueva en Identity Platform la primera vez que entra, así que habría que crearle el usuario a mano antes.

**Evidencia**
`identity.tf` declara `google_identity_platform_config.default` solo con `authorized_domains`, sin ajustes de alta de usuarios ni funciones de bloqueo; el proveedor de Google se configura a mano (`RUNBOOK.md` §9). `research.md` R1 rechazó las funciones de bloqueo y el cierre del alta por coste y complejidad. No hay límite de tasa por identidad (`security-review-fase-1.md`, LOW-002). Mitigante: el volumen de abuso está acotado por `api_max_instances` y por la necesidad de una cuenta de Google real.

**Remediación requerida**
Mantener la decisión de diseño y añadir una alerta de presupuesto o de usuarios activos mensuales en Identity Platform para ver un abuso; revisar la decisión si el número de identidades ajenas crece.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-architect` (diseño de la alerta); aplicarla en la nube exigiría `mytasks-google-cloud-operator` con confirmación del propietario
- Tipo de cambio: Arquitectónico

---

### [LOW-002] Las invitaciones no caducan: un correo reciclado puede reclamar una invitación antigua
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A01: Broken Access Control / ASVS V2 (ciclo de vida de credenciales) |
| **Componente afectado** | `_accept_invitation` (`account_repository.py`), invitaciones sin caducidad |

**Descripción**
Una invitación se acepta por coincidencia de correo verificado, sin límite de tiempo. Si una dirección se reasigna a otra persona (por ejemplo, una cuenta corporativa reciclada) mientras su invitación sigue `pending`, la nueva titular, que obtiene un `uid` distinto, puede aceptarla y crear una cuenta con rol `user`. Solo afecta a invitaciones pendientes y concede el rol mínimo sin acceso a datos ajenos; el efecto es que alguien no previsto entre en la aplicación.

**Evidencia**
`spec.md` (supuestos): «Sin caducidad de invitaciones en esta versión; se revocan manualmente». `_accept_invitation` busca `invitations/{correo}` y comprueba solo `status == pending`; `resolve_session` exige `email_verified`, que no distingue entre titulares sucesivos de una misma dirección. Mitigante: el tope de 50 pendientes y la pantalla Accesos permiten ver y revocar las pendientes.

**Remediación requerida**
Decidir una de dos: (a) caducar las invitaciones pendientes tras un plazo (y mostrar su antigüedad en Accesos, que ya muestra la fecha de creación), o (b) documentar como práctica de operación revisar y revocar las pendientes que no se hayan usado, con un plazo orientativo.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (tras decisión del propietario)
- Tipo de cambio: De implementación

---

### [LOW-003] El correo guardado nunca se actualiza: una invitación pendiente puede quedar huérfana para siempre
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A04: Insecure Design / integridad de datos |
| **Componente afectado** | `AccessService.resolve_session`, documento `users/{uid}` |

**Descripción**
La cuenta queda ligada al `uid` y su correo se fija al crearla; si la persona cambia el correo de su cuenta de Google, el que figura en Accesos es el antiguo. Si el administrador invita el correo nuevo, la persona entra con su cuenta existente (que tiene prioridad), así que **la invitación nueva nunca se acepta**: sigue `pending`, cuenta para el tope de 50 y no se puede distinguir de una invitación no usada. La documentación decía lo contrario (que el correo se actualizaba desde el token); se ha corregido.

**Evidencia**
`resolve_session`: `existing = get_account(uid)` y `return existing` sin tocar la invitación ni el correo. `grep` de actualizaciones del campo `email` en `account_repository.py`: solo se escribe al crear (`_account_to_document`). Corregido en esta fase: `data-model.md`, `research.md` R4 y `RUNBOOK.md` §12.

**Remediación requerida**
Decidir una de dos: (a) actualizar el correo guardado cuando el token trae otro verificado para el mismo `uid`, o (b) dejarlo y documentar que revocar la invitación huérfana a mano es la forma de liberar el hueco (ya recogido en el runbook).

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (tras decisión del propietario)
- Tipo de cambio: De implementación

---

## Observaciones informativas

### [INFO-001] Un administrador comprometido solo se puede retirar a mano, y ese procedimiento no está probado
Por diseño (R6) la aplicación no revoca a un `admin`. `RUNBOOK.md` §12 documenta cómo retirarlo (poner `status = "revoked"` en `users/{uid}` desde la consola de Firestore, con credenciales del propietario) y cómo recuperar el acceso si se pierde la cuenta (cambiar `BOOTSTRAP_ADMIN_EMAIL` y redesplegar). Ambos procedimientos están marcados como **no probados**, y el relanzado del despliegue también. Conviene probarlos una vez en staging (puede ir junto con T057) y anotar el resultado. *Destinatario*: el propietario (no encaja en una fila de la tabla de `CLAUDE.md`).

### [INFO-002] La seguridad del bootstrap sigue descansando en configuración que el repositorio no puede comprobar
Heredada de la Fase 1 (INFO-001 e INFO-002): solo el proveedor Google habilitado, una cuenta por correo, y los Environments `staging` y `production` con revisores obligatorios y control de quién edita sus variables. Se ha dejado escrita como requisito en `RUNBOOK.md` §12; sigue pendiente su comprobación por el propietario en ambos entornos. *Destinatario*: el propietario.

---

## Estado acumulado de los hallazgos de las fases

| Origen | ID | Resumen | Estado |
|---|---|---|---|
| Fase 1 | LOW-001 | El bootstrap puede crear más de un `admin` con el mismo correo | **Abierto.** Requisito de configuración documentado en `RUNBOOK.md` §12 y `data-model.md` (que ya no afirma una unicidad que no se aplica). Decisión del propietario pendiente: acotar el bootstrap o aceptarlo. |
| Fase 1 | LOW-002 | Sin límite de tasa por identidad | **Abierto, riesgo aceptable** (ver LOW-001 de esta revisión). |
| Fase 1 | LOW-003 | La huella del correo en los logs se puede invertir por diccionario | **Abierto.** Documentado en `RUNBOOK.md` §12. |
| Fase 1 | LOW-004 | Identidades creadas por desconocidos | **Evaluado en esta revisión** (LOW-001 nuevo). |
| Fase 1 | INFO-001, INFO-002 | Configuración fuera del repositorio | **Abierto**, a cargo del propietario (INFO-002 de esta revisión). |
| Fase 1 | INFO-003 | Revocación a mitad de sesión se ve como error genérico hasta refrescar | **No verificado en esta revisión.** |
| Fase 2 | MED-001 | Listas truncadas a 100 y sin tope de creación | **Parcialmente resuelto**: tope de 50 pendientes (T059–T062) y aviso en la interfaz; el resto, abajo (Fase 3, LOW-002). |
| Fase 2 | LOW-001 | Carrera entre buscar la cuenta e invitar puede sobrescribir una invitación aceptada | **Abierto.** |
| Fase 2 | LOW-002 | Los intentos rechazados sobre administradores no dejan evento de auditoría | **Abierto.** |
| Fase 2 | LOW-003 | El correo viaja en la ruta del `DELETE` | **Abierto**, documentado en `RUNBOOK.md` §12. |
| Fase 3 | LOW-001 | La caché de datos del cliente no se vacía al cerrar sesión | **Abierto. Cerrar antes del release.** |
| Fase 3 | LOW-002 | El tope de 50 no garantiza ver las pendientes (la lista mezcla estados) | **Abierto.** |
| Fase 3 | INFO-002 | `a11y.spec.ts` no cubre `/admin/access` | **Abierto.** |

---

## Correcciones hechas durante la revisión

Dos afirmaciones de los documentos de diseño no coincidían con el código y se corrigieron en esta fase, para que la documentación no prometa lo que no se cumple:

1. `data-model.md`: decía que el correo es único entre cuentas; **no se hace cumplir** en Firestore (se espera por la configuración de Identity Platform). Esto cumple la remediación pendiente de LOW-001 de la Fase 1.
2. `data-model.md` y `research.md` R4: decían que el correo guardado se actualiza desde el token en `/me`; **la implementación no lo hace** (LOW-003 de esta revisión).

---

## Categorías sin información suficiente

- **Seguridad de red y perímetro**: sin cambios en esta feature; los servicios Cloud Run siguen siendo públicos por diseño y la autorización es de aplicación. No se ha revisado una posible exposición de la consola de Firestore o de Identity Platform fuera del repositorio.
- **Configuración real de Identity Platform en cada entorno** (proveedores habilitados, «una cuenta por correo»): no se puede leer desde el repositorio ni con la cuenta del agente; la comprueba el propietario.
- **Gestión de incidentes**: hay procedimiento escrito para perder o comprometer la cuenta de administrador (`RUNBOOK.md` §12), no probado.

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| LOW-001 | Baja | Arquitecto (y operador si se aplica) | `mytasks-google-cloud-architect` / `mytasks-google-cloud-operator` |
| LOW-002 | Baja | Desarrollador backend (tras decisión del propietario) | `mytasks-backend-developer` |
| LOW-003 | Baja | Desarrollador backend (tras decisión del propietario) | `mytasks-backend-developer` |
| INFO-001 | Informativa | Propietario (probar los procedimientos en staging) | Sin destinatario en la tabla: decide el propietario |
| INFO-002 | Informativa | Propietario (verificar la configuración en ambos entornos) | Sin destinatario en la tabla: decide el propietario |

## Recomendación

Sin hallazgos que bloqueen la fusión de la Fase 4 ni el paso a producción. Antes del release a producción: (1) corregir LOW-001 de la Fase 3 (caché del cliente); (2) comprobar la configuración de Identity Platform de ambos entornos (INFO-002) y probar en staging la recuperación del administrador (INFO-001); (3) completar la validación del propietario (T057). El resto de los hallazgos bajos puede ir al backlog técnico, con las decisiones del propietario sobre el bootstrap (Fase 1, LOW-001), la caducidad de invitaciones (LOW-002) y el correo guardado (LOW-003).
