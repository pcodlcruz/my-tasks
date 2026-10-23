# Informe de Auditoría de Seguridad — Feature 003, Fase 2: administración de invitaciones y accesos

**Fecha**: 2026-10-23
**Rama revisada**: `feature/003-user-roles-invitations-fase-2` (sin commitear en el momento de la revisión)
**Alcance**: tareas T031–T040 de `tasks.md`: `routers/admin.py` (cinco endpoints de `/api/v1/admin`), dependencia `require_admin` en `auth.py`, `AccessService` (`invite`, `list_access`, `revoke_invitation`, `revoke_account`), transacciones de `account_repository.py`, esquemas de `schemas/access.py`, manejadores de error de `factory.py` y eventos de auditoría.
**Tipología detectada**: aplicación web (React) + API REST (FastAPI) + cloud-native/GCP (Firestore, Cloud Run, Identity Platform). Esta fase solo toca el backend.
**Marcos aplicados**: OWASP Top 10 (A01, A04, A09), OWASP API Security Top 10 (API1, API3, API5, API6, API4), CIS Google Cloud Foundation Benchmark (registro).
**Nivel de riesgo global**: **Bajo**

---

## Resumen ejecutivo

El control de roles es correcto: **solo un administrador con cuenta activa llega a `/api/v1/admin`**, el rol sale del documento de la cuenta en cada petición y un `user`, un revocado y un desconocido reciben exactamente el mismo 403. No hay ningún endpoint que cambie roles, así que no existe camino de escalada de privilegios, y el último administrador no se puede perder porque el dominio rechaza revocar a cualquier `admin`. Las operaciones de escritura son transaccionales y se probaron con concurrencia.

No hay hallazgos críticos ni altos; **nada bloquea la fusión**. Hay **un hallazgo medio** (las listas tienen un tope de 100 sin paginación, de modo que accesos antiguos pueden quedar fuera de la vista del administrador), tres bajos y dos observaciones informativas.

---

## Controles verificados

Comprobados leyendo el código y ejecutando la suite (375 pruebas de backend en verde, `ruff` y `mypy` limpios).

| Control | Evidencia |
|---|---|
| **Rol verificado en el servidor** | `auth.py::require_admin` depende de `get_active_user`, que lee la cuenta en cada petición; el rol nunca viene del token ni del cuerpo. Un administrador revocado pierde el acceso de inmediato. |
| **401 antes que 403; mismo 403 para todos** | `require_admin` reutiliza `AccessDeniedError`, atendido por un único manejador con cuerpo fijo; un `user`, un revocado y un desconocido son indistinguibles. |
| **Los cinco endpoints están protegidos** | Los cinco handlers de `routers/admin.py` declaran `Depends(require_admin)`. |
| **Sin escalada de rol** | `InvitationIn` tiene `extra="forbid"` y solo el correo; las cuentas creadas por invitación son siempre `Role.USER`. No hay endpoint que modifique `role`. |
| **El último administrador no se pierde** | `domain/account.py::revoke_account` lanza `AdminAccountProtectedError` (409) para cualquier `admin`; la comprobación está en el dominio, dentro de la transacción `_revoke_account`, no en el endpoint. |
| **Identificadores acotados** | El correo se normaliza y valida (`normalize_email`: ≤ 254, sin `/` ni espacios) antes de usarse como id de documento; el `uid` de la ruta debe cumplir `_UID_PATTERN` (sin ids reservados `__x__`) o se responde 404. |
| **Idempotencia y concurrencia** | Invitar, revocar invitación, revocar cuenta y reactivar leen y escriben sobre la misma instantánea (`_upsert_pending_invitation`, `_revoke_pending_invitation`, `_revoke_account`, `_reactivate_account`); reintento en `Aborted` con envoltorio nuevo por llamada. |
| **Revocar conserva los datos** | `_revoke_account` solo actualiza `status` y `revoked_at`; las tareas no se tocan y vuelven al reactivar. |
| **Respuestas mínimas** | `AccountOut`/`InvitationOut` no exponen `invited_by` ni `accepted_uid`; ningún token en respuestas ni logs. |
| **Reglas de Firestore** | `firestore.rules` mantiene `allow read, write: if false` sobre toda la base: `users` e `invitations` solo son accesibles vía API. |
| **Sin dependencias nuevas** | `pyproject.toml` sin cambios en la fase. |

### Auditoría (R8)

| Evento | Dónde | Campos |
|---|---|---|
| `invitation_created` | `AccessService.invite` | `actor_uid`, `target` (huella) |
| `access_reactivated` | `AccessService.invite` | `actor_uid`, `uid`, `target` |
| `invitation_revoked` | `AccessService.revoke_invitation` | `actor_uid`, `target` |
| `access_revoked` | `AccessService.revoke_account` | `actor_uid`, `uid` (solo si cambió algo) |
| `invitation_accepted` | `resolve_session` (Fase 1) | `uid`, `target` |
| `access_denied` | `_deny` y `require_admin` (`reason="not_admin"`) | `uid`, `reason` |

Los campos pasan por la lista cerrada `_LOGGED_FIELDS`: no se puede colar un correo ni un token por descuido.

---

## Hallazgos

### [MED-001] Las listas se truncan a 100 elementos sin paginación y sin tope de creación: accesos antiguos quedan invisibles
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption / OWASP A04: Insecure Design |
| **Componente afectado** | `AccessService.list_access`, `AccountRepository.list_invitations` / `list_accounts`, `POST /api/v1/admin/invitations` |

**Descripción**
`GET /admin/access` devuelve las 100 invitaciones y las 100 cuentas más recientes, ordenadas por `created_at` descendente y mezclando todos los estados. Una invitación **pendiente** antigua o una cuenta **activa** antigua desaparece de la lista en cuanto hay más de 100 elementos más recientes, pero sigue siendo válida: el administrador no puede verla ni, para las cuentas, conocer su `uid` para revocarla desde la interfaz. Como además `POST /admin/invitations` no limita cuántas invitaciones se crean, un administrador (o una sesión de administrador comprometida) puede expulsar de la vista accesos legítimos creando 100 invitaciones nuevas, o simplemente puede perderlos de vista por crecimiento normal. Es un fallo de visibilidad del control de acceso, no un acceso indebido.

**Evidencia**
`access_service.py`: `ACCESS_LIST_LIMIT = 100` ("there is no paging in this version"). `account_repository.py::list_invitations` y `list_accounts`: `.order_by("created_at", DESCENDING).limit(limit)` sin filtro de estado. El endpoint de invitar no cuenta ni acota los documentos existentes.

**Remediación requerida**
Elegir: (a) paginar por cursor la lista, o (b) listar siempre los **pendientes** y las cuentas **activas** completos y limitar solo el histórico (aceptadas/revocadas), y (c) en cualquier caso fijar un tope de invitaciones pendientes simultáneas (con 409/422 al superarlo). Dejar escrita la decisión en `plan.md`, porque condiciona la pantalla de la Fase 3.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (decisión previa del propietario sobre el alcance)
- Tipo de cambio: De implementación

---

### [LOW-001] Carrera entre `find_account_by_email` y `upsert_pending_invitation`: puede sobrescribir una invitación aceptada
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A04: Insecure Design (concurrencia) |
| **Componente afectado** | `AccessService.invite`, `_upsert_pending_invitation` |

**Descripción**
`invite` busca primero la cuenta por correo y después crea la invitación en otra transacción. Si entre ambos pasos la persona acepta una invitación pendiente (y se crea su cuenta), `_upsert_pending_invitation` ve la invitación en estado `accepted` y, por la rama «una invitación aceptada cuya cuenta ya no existe», la reemplaza por una nueva `pending`. No concede acceso adicional (en `resolve_session` la cuenta existente tiene prioridad), pero se pierde el rastro `accepted_at`/`accepted_uid` y la lista mostrará una invitación pendiente de alguien que ya tiene cuenta.

**Evidencia**
`access_service.py::invite` (líneas de búsqueda y de upsert separadas) y `account_repository.py::_upsert_pending_invitation` (rama `else`, sin leer `users`).

**Remediación requerida**
Que la decisión «el correo ya tiene cuenta / invitación aceptada» y la escritura ocurran en la misma transacción, o que una invitación `accepted` nunca se sobrescriba mientras exista la cuenta a la que apunta `accepted_uid`.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación

---

### [LOW-002] Los intentos rechazados sobre operaciones privilegiadas no dejan evento de auditoría
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A09: Security Logging and Monitoring Failures |
| **Componente afectado** | `AccessService.revoke_account`, `revoke_invitation`, manejadores de `factory.py` |

**Descripción**
Se auditan los éxitos y los 403, pero no el intento de revocar a un administrador (`AdminAccountProtectedError`, 409), ni las revocaciones de cuentas o invitaciones inexistentes (404), ni el 409 de invitar a quien ya tiene acceso. Un intento de revocar al administrador es justo el tipo de señal que interesa ver.

**Evidencia**
`revoke_account` solo registra `access_revoked` si `changed`; los manejadores `admin_protected_handler`, `account_not_found_handler` e `invitation_not_found_handler` no registran nada.

**Remediación requerida**
Registrar un evento de nivel `WARNING` (por ejemplo `access_change_rejected` con `actor_uid`, `uid` y `reason`) cuando el dominio rechaza una operación sobre un administrador, y opcionalmente en los 404.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación

---

### [LOW-003] El correo viaja en la ruta de `DELETE /admin/invitations/{email}`
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A09 / minimización de datos |
| **Componente afectado** | `routers/admin.py::revoke_invitation`, registros de petición de Cloud Run |

**Descripción**
La aplicación no registra la ruta (los logs propios solo emiten la huella del correo), pero el correo completo va en la URL y, por comportamiento conocido de Cloud Run, los registros de petición de la plataforma incluyen la URL. Así el correo en claro acaba en Cloud Logging aunque el código evite escribirlo. Solo lo ven quienes ya tienen acceso a los logs del proyecto (el propietario); no se ha verificado la configuración de registro del entorno.

**Evidencia**
`admin.py`: `@router.delete("/invitations/{email}")`. `grep` de `path`/`url` en `factory.py` y `logging_config.py`: la aplicación no registra rutas.

**Remediación requerida**
Aceptar el riesgo explícitamente (audiencia = propietario) y corregir la afirmación «sin correos en claro» de `tasks.md` T034/R8 para que sea exacta, o cambiar el contrato para identificar la invitación por un identificador opaco. Se arrastra además LOW-003 de la Fase 1 (huella SHA-256 sin clave, invertible por diccionario), que aplica ahora a los nuevos eventos.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (si cambia el contrato); decisión del propietario
- Tipo de cambio: De implementación / de contrato

---

## Observaciones informativas

### [INFO-001] Sin límite de tasa en `/api/v1/admin`
Es el LOW-002 de la Fase 1 aplicado a los endpoints nuevos. Aquí el llamante ya es un administrador autenticado, así que el riesgo adicional es bajo; se cubre con la misma decisión de aceptar o diseñar un límite en la capa de entrada. *Destinatario*: `mytasks-google-cloud-architect`, junto con el hallazgo original.

### [INFO-002] Un documento corrupto produce un 500, no un acceso
`_document_to_account` hace `Role(data["role"])`/`AccountStatus(...)`; un valor inesperado lanza `ValueError` y la petición falla cerrada. Es el comportamiento deseado; se anota para que no se «arregle» con un valor por defecto permisivo.

---

## Categorías sin información suficiente

- **Seguridad de red y perímetro**, **configuración de Identity Platform** y **gestión de incidentes**: sin cambios en esta fase; las observaciones de la Fase 1 (INFO-001/INFO-002, T053) siguen vigentes.

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| MED-001 | Media | Desarrollador backend (tras decisión del propietario) | `mytasks-backend-developer` |
| LOW-001 | Baja | Desarrollador backend | `mytasks-backend-developer` |
| LOW-002 | Baja | Desarrollador backend | `mytasks-backend-developer` |
| LOW-003 | Baja | Desarrollador backend / propietario | `mytasks-backend-developer` |
| INFO-001 | Informativa | Arquitecto | `mytasks-google-cloud-architect` |
| INFO-002 | Informativa | — | Sin acción |

## Recomendación

Sin hallazgos críticos ni altos: **nada bloquea la fusión de la Fase 2**. Antes de la Fase 3 conviene que el propietario decida cómo resolver MED-001, porque determina qué muestra la pantalla de administración. LOW-001 a LOW-003 pueden ir al backlog técnico.
