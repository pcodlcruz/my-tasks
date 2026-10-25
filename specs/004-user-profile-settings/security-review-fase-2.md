# Informe de Auditoría de Seguridad — Feature 004, Fase 2 (backend del perfil)

**Fecha**: 2026-10-24 · **Rama**: `feature/004-user-profile-settings-fase-2`

**Tipología detectada**: API REST (FastAPI) + Cloud-native/GCP (Firestore). Sin cambios de
infraestructura, IAM ni variables.

**Marcos aplicados**: OWASP API Security Top 10, OWASP Top 10, CIS Google Cloud Foundation
Benchmark (sin cambios aplicables en esta fase).

**Nivel de riesgo global**: Bajo (un hallazgo medio, ya corregido en esta misma PR).

---

## Resumen ejecutivo

Se auditó el código nuevo de la fase: `GET/PATCH/DELETE /api/v1/me/profile`, el modelo de datos
`users/{uid}/settings/profile` (y la baja de `settings/avatar`), los parámetros `order` y
`within_days` de `GET /api/v1/tasks` y los eventos de registro `profile_updated` y
`profile_reset`.

No hay hallazgos críticos ni altos. **No bloquea la fusión.** Se encontró un hallazgo **medio**
(MED-001) que se **corrigió en esta PR** antes de cerrar el informe, y tres bajos para el
backlog. Lo auditado cumple lo que pide la fase:

| Control | Resultado | Evidencia |
|---|---|---|
| Autenticación en cada endpoint | ✅ | Los tres usan `Depends(get_active_user)` (`routers/profile.py`); `test_profile.py` comprueba 401 sin token en los tres métodos |
| Cuenta activa (403 uniforme) | ✅ | Sin cuenta y con cuenta revocada reciben `access_denied` en GET, PATCH y DELETE (`test_profile.py`) |
| Aislamiento por `uid` | ✅ | El `uid` sale solo de `current_user.uid`; ruta, consulta, cabeceras y cuerpo no lo admiten (`test_profile_isolation.py`; el cuerpo con `uid` da 422 por `extra="forbid"`) |
| Validación en el límite, atómica | ✅ | Listas cerradas en Pydantic, `extra="forbid"`, al menos un campo; un 422 no escribe nada (`test_a_rejected_patch_saves_nothing…`) |
| `avatar_kind = upload` no fijable por perfil | ✅ | `AvatarChoiceIn.kind` solo admite `initials`/`preset`; `choose_avatar` lo rechaza también en dominio |
| Nombre como texto plano | ✅ en backend | Se devuelve literal, sin interpretar (`test_a_display_name_with_html_is_returned_literally`); ver LOW-002 |
| Caracteres de control / de formato | ✅ | Se rechazan categorías Unicode `Cc` y `Cf` (incluye invisibles y anulaciones bidireccionales), salvo la unión de ancho cero de los emoji |
| Registros sin datos personales | ✅ | `profile_updated`/`profile_reset` llevan `uid` y **nombres** de campos; `fields` entra en la lista cerrada de `logging_config.py`; `test_audit_logging.py` comprueba que ni el nombre, ni el correo, ni el token, ni el id del avatar aparecen |
| Parámetros nuevos de `/tasks` | ✅ | `order` (enum) y `within_days` (`IntEnum` 30/90) validados por FastAPI → 422; la consulta usa el índice existente `status, in_trash, completed_at` (comprobado contra `firestore.indexes.json`) |
| Sin migración ni cambios de reglas | ✅ | Sin documento, valores por defecto; el cliente nunca accede a Firestore |
| Dependencias | ✅ | Ninguna nueva en esta fase (Pillow llega en la Fase 6) |

---

## Hallazgos

### [MED-001] Transacción de avatar con envoltorio compartido y sin reintento ante abortos — CORREGIDO
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption / robustez (disponibilidad) |
| **Componente afectado** | `repositories/profile_repository.py` (cambio de avatar) |

**Descripción**
La primera versión decoraba la transacción del cambio de avatar con
`@firestore.async_transactional` a nivel de módulo. El repositorio de cuentas (feature 003) ya
documenta que ese envoltorio guarda en sí mismo los identificadores de la transacción en curso,
de modo que compartido entre peticiones concurrentes entrega el reintento de una la transacción
de otra, que espera a sus bloqueos hasta agotar el tiempo. Además, un aborto por carrera de
bloqueos no se reintentaba. Dos pestañas de la misma persona (o una persona maliciosa lanzando
cambios de avatar en paralelo) podían provocar esperas largas y errores 500.

**Evidencia**
`task_repository.py` usa el patrón de módulo; `account_repository.py:31-71` explica y resuelve el
problema con `_transactional` y `_retry_on_abort`.

**Remediación aplicada**
El repositorio de perfil usa ahora `_transactional` (un envoltorio nuevo por llamada) y
`_retry_on_abort` del repositorio de cuentas. Se añadió
`test_two_simultaneous_avatar_choices_both_succeed_and_count_twice`, que lanza dos cambios
simultáneos y exige dos 200 y versión final 2.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (ya aplicado)
- Tipo de cambio: De implementación

---

### [LOW-001] Sin límite de frecuencia en `PATCH`/`DELETE /me/profile`
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `routers/profile.py` |

**Descripción**
Cada petición escribe un documento de Firestore y una persona autenticada puede repetirla sin
límite. El impacto está acotado: solo cuentas invitadas y activas, un documento por persona
(sin crecimiento de datos) y el coste de escritura es mínimo. Es la misma situación que el resto
de la API de tareas (la 001 solo limita las tareas activas).

**Evidencia**
No existe ningún limitador en `factory.py` ni en los routers; el plan (R6) reserva el límite de
frecuencia solo a la subida de imágenes (Fase 6).

**Remediación requerida**
Aceptar el riesgo o, si se decide cubrirlo, hacerlo para toda la API y no solo para el perfil.
No se corrige en esta fase.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (si el propietario decide abordarlo)
- Tipo de cambio: De implementación

---

### [LOW-002] El nombre para mostrar se escapa en el cliente, no en el servidor
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A03: Injection (XSS almacenado, vía el consumidor) |
| **Componente afectado** | API → interfaz (Fases 3 a 5) |

**Descripción**
Por diseño el servidor devuelve el nombre literal (puede contener `<`, `>` o `&`) y confía en que
la interfaz lo pinte como texto. React escapa por defecto, pero basta una sola
`dangerouslySetInnerHTML` o una inserción en `title`/atributos con HTML para abrir un XSS
almacenado, que además se vería en la cabecera de todas las páginas.

**Evidencia**
`test_a_display_name_with_html_is_returned_literally` documenta el comportamiento. La CSP
vigente (`script-src 'self'`) reduce el impacto pero no sustituye al escape.

**Remediación requerida**
En la Fase 5, mostrar el nombre solo como nodo de texto de React (nunca como HTML) y añadir un
test de interfaz con un nombre con marcado que verifique que se ve literal y no se interpreta.

**Destinatario**
- Skill/agente: `mytasks-frontend-developer`
- Tipo de cambio: De implementación

---

### [LOW-003] El perfil leído no se vuelve a validar y los valores corruptos se sustituyen en silencio
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API8: Security Misconfiguration (robustez de datos) |
| **Componente afectado** | `domain/profile.py::profile_from_document` |

**Descripción**
Al leer, un valor fuera de su lista cerrada se sustituye por el de defecto (para no devolver un
500), pero `display_name` y `avatar_preset` se devuelven tal cual están guardados, y la
sustitución no deja rastro en los registros. Solo el backend escribe estos documentos, así que
hoy no es explotable; sería relevante si alguien escribiera en Firestore por otra vía (consola,
script de migración).

**Evidencia**
`profile_from_document` aplica `_enum_or_default` a los enumerados pero no a `display_name` ni a
`avatar_preset`; no hay `log_event` en la rama de sustitución.

**Remediación requerida**
Si se endurece: pasar el nombre por `normalize_display_name` y el preset por el catálogo al leer,
y registrar un evento (solo `uid` y nombre del campo) cuando se sustituya un valor.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación

---

## Categorías sin hallazgos o fuera de alcance

- **Seguridad de red y perímetro, hardening, gestión de incidentes**: sin cambios en esta fase
  (no hay IaC, IAM, endpoints de diagnóstico ni secretos nuevos).
- **Decisión documentada, no hallazgo**: revocar una cuenta conserva su perfil (data-model.md);
  el acceso se deniega igual que al resto de datos y se comprueba en `test_profile_isolation.py`.
- **Nota operativa (no de seguridad)**: `test_two_invitations_at_once_with_one_slot_left_create_only_one`
  (feature 003) falló una vez bajo la carga de la suite completa por contención del emulador y
  pasa aislado; no guarda relación con esta fase.

## Resumen de enrutamiento

| ID | Severidad | Estado | Destinatario | Skill/Agente |
|---|---|---|---|---|
| MED-001 | Media | **Corregido en esta PR** | Desarrollador backend | `mytasks-backend-developer` |
| LOW-001 | Baja | Backlog (decisión del propietario) | Desarrollador backend | `mytasks-backend-developer` |
| LOW-002 | Baja | Para la Fase 5 | Desarrollador frontend | `mytasks-frontend-developer` |
| LOW-003 | Baja | Backlog | Desarrollador backend | `mytasks-backend-developer` |
