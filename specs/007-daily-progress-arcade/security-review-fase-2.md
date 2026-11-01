# Informe de Auditoría de Seguridad — Feature 007 · Fase 2 (backend del progreso)

**Rama**: `feature/007-daily-progress-arcade-fase-2` (commits `ff8bec7` y `d65b556` sobre `62152b3`)
**Fecha**: 2026-10-30
**Tipología detectada**: API REST (FastAPI) sobre Firestore, en Cloud Run
**Marcos aplicados**: OWASP API Security Top 10 (2023), OWASP Top 10 (2021)
**Nivel de riesgo global**: Bajo, una vez corregido MED-001 en esta misma PR

---

## Resumen ejecutivo

Se auditaron los endpoints nuevos (`GET /api/v1/me/progress`, `POST /review`,
`PUT /today/mission` y `POST /ack`), los campos nuevos del perfil, el cambio de
`complete`/`reopen`/`trash` (ahora escriben también el día de progreso y el marcador en una sola
transacción) y el reloj inyectable con la cabecera `X-Test-Now`.

**Resultado**: no hay hallazgos críticos ni altos.
- **Autorización**: todos los endpoints exigen cuenta activa.
- **Aislamiento**: el `uid` sale siempre del token, y la API no acepta del cliente ningún valor de
  juego (puntos, racha, nivel ni logros).
- **`X-Test-Now`**: es inerte fuera de `APP_ENV=local`. Esa variable no puede valer `local` en
  Cloud Run, porque la configuración exige entonces un proyecto `demo-*`.
- **Registros**: no llevan títulos, descripciones ni identificadores de tarea en los eventos nuevos.

Hay **un hallazgo medio** de disponibilidad: una consulta auxiliar del logro «Sin urgencias» puede
romper el completado de tareas. Se corrige en esta PR (T047). Hay **tres bajos** para el backlog.

---

## Comprobaciones del alcance (T047)

| Punto | Resultado | Evidencia |
|---|---|---|
| Autorización en cada endpoint nuevo | ✅ | `routers/progress.py`: las cuatro rutas usan `Depends(get_active_user)`. Tests: `test_progress.py` (401 sin token y 403 sin cuenta o revocada, en las cuatro). |
| `uid` solo del token | ✅ | Ninguna ruta lleva `uid` en ruta, consulta ni cuerpo. Los repositorios construyen `users/{uid}/…` con el `uid` de `CurrentUser`. Tests: `test_progress_isolation.py`. |
| Valores de juego no aceptados del cliente | ✅ | `MissionIn`, `AckIn` y `ProfileUpdateIn` con `extra="forbid"`. `TaskUpdate` sigue con `extra="forbid"`, así que `completed_day` y `points_awarded_on` no se pueden fijar desde fuera. Tests: `test_no_endpoint_accepts_game_values_or_another_uid`. |
| Misión con tareas ajenas | ✅ | `_set_mission` lee las tareas bajo `users/{uid}/tasks`. Una tarea de otra cuenta se trata como inexistente, con el mismo 422 `mission_invalid_task` y un mensaje fijo que no revela si existe. |
| `X-Test-Now` solo en local | ✅ | `clock.get_clock` solo la atiende si `settings.is_local`. En cualquier otro entorno se ignora y se registra `test_clock_ignored` con `reason=<app_env>`, sin el valor de la cabecera. Tests: `test_clock.py` y `test_test_clock_header.py` (staging simulado). |
| `GET` con efectos idempotente | ✅ | `ProgressRepository.close_days` no hace nada si `last_closed_day` es ayer. `_close_days` vuelve a comprobarlo dentro de la transacción y `close_days` del dominio salta los días ya cerrados. Tests: `test_repeating_the_call_changes_nothing` y `test_closing_twice_changes_nothing`. La API usa *Bearer* en cabecera, sin *cookies*, así que no hay vía de CSRF. |
| Límites | ✅ (ver LOW-001) | Misión ≤ 5 (esquema y dominio); `AckIn` ≤ 20 + 20 ids de ≤ 64 caracteres; anuncios y avisos guardados ≤ 20 (`MAX_ANNOUNCEMENTS`, `MAX_NOTICES`); cierre ≤ 84 días (`MAX_DAYS_TO_CLOSE`). |
| Registros sin datos de tareas | ✅ | `_LOGGED_FIELDS` solo añade `day` y `count`. `progress_mission_set` lleva `uid`, `day` y `count`. Tests: `test_setting_the_mission_logs_the_day_and_count_but_no_task_data` y `test_json_formatter_never_emits_task_titles_of_a_progress_event`. |
| Cabeceras | ✅ | `Cache-Control: no-store` en `GET /me/progress` por el *middleware* existente (test). |
| Dependencias | ✅ | `tzdata` fijado en `uv.lock` (2026.6). Es solo datos IANA, sin código ejecutable. |

---

## Hallazgos

### [MED-001] Un fallo de la consulta auxiliar de «Sin urgencias» impide completar tareas
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4:2023 (consumo de recursos / disponibilidad); requisito FR-034 |
| **Componente afectado** | `services/task_service.py` (`_complete_rule`), `repositories/task_repository.py` (`count_active_do_now`) |

**Descripción**
Para decidir el logro «Sin urgencias», `complete_task` cuenta las tareas activas de «Hacer ahora»
antes de la transacción. Usa una agregación con cuatro filtros de igualdad (`status`, `in_trash`,
`urgent` e `important`) que **no tiene índice compuesto declarado** en `firestore.indexes.json`.
El emulador no exige índices. En producción, Firestore puede resolverla combinando índices de un
solo campo, pero no está verificado. Si responde `FailedPrecondition` o cualquier otro error, la
excepción se propaga y **completar una tarea de «Hacer ahora» devuelve 500**.

Así, una función accesoria, un logro cosmético, rompe una operación principal. Eso contradice
FR-034: un fallo de la gamificación no debe impedir usar el tablero.

**Evidencia**
`task_service.py`, `_complete_rule`: `await self._repository.count_active_do_now(uid)` sin manejo
de errores. `firestore.indexes.json` no contiene ningún índice sobre `urgent` ni `important`.

**Remediación requerida**
- Que un error de esa consulta auxiliar no aborte el completado: se registra un aviso, se omite la
  comprobación del logro y la transacción sigue.
- Añadir un test unitario que lo demuestre.
- Comprobar en staging (T122) que la consulta funciona con los índices de un solo campo.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: de implementación (en esta PR)

**Estado (2026-10-31)**: **corregido en esta PR**. `TaskService._count_do_now_left` captura el
error, registra `progress_do_now_count_failed` (solo `uid` y el tipo de error) y completa la tarea
sin comprobar el logro. Test: `tests/unit/services/test_task_service_progress.py`. Sigue
pendiente comprobarlo en staging (T122).

---

### [LOW-001] La lista de completadas de un día no tiene tope propio
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4:2023 (consumo de recursos sin límite) |
| **Componente afectado** | `domain/progress.py` (`ProgressDay.completed_task_ids`) |

**Descripción**
Cada completado añade un id al documento del día. El tope de 500 tareas activas no limita los
completados: se puede crear, completar y repetir. Un día con decenas de miles de completados se
acercaría al límite de 1 MiB del documento. A partir de ahí las transacciones fallarían y esa
persona no podría completar más tareas ese día.

El impacto se limita a la propia cuenta (autoinfligido): ninguna otra persona ve ni comparte ese
documento. Tampoco existe hoy un límite de frecuencia de creación de tareas (feature 001).

**Evidencia**
`apply_complete` hace `completed_task_ids=(*day.completed_task_ids, task.id)` sin tope.

**Remediación requerida**
Fijar un máximo razonable de completados contados por día (por ejemplo, 1 000). Por encima, la
tarea se completa, pero no cuenta en el progreso ni da puntos, y se registra un aviso. Se puede
hacer en la fase de cierre.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: de implementación (backlog)

---

### [LOW-002] `X-Test-Now` en un entorno real genera un aviso por petición
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A09:2021 (registro y monitorización) |
| **Componente afectado** | `clock.py` (`get_clock`) |

**Descripción**
Fuera de local, cada petición con la cabecera escribe `test_clock_ignored` como `WARNING`.
Alguien autenticado podría llenar el registro de avisos sin efecto funcional. Es el mismo riesgo
que ya tienen `auth_failed` y `task_not_found`. No se registra el valor de la cabecera, así que no
hay inyección en los registros.

**Evidencia**
`clock.py`: `log_event(logger, logging.WARNING, "test_clock_ignored", reason=settings.app_env)`.

**Remediación requerida**
Aceptable tal cual. Si molesta en la monitorización, bajarlo a `INFO` o muestrear. Además, la
cabecera no está en `ALLOWED_HEADERS` del CORS (`factory.py`): un navegador de otro origen no
puede ni enviarla. Aviso para la Fase 3: los e2e del navegador necesitarán añadirla al CORS
**solo** con `APP_ENV=local`, o enviarla desde el propio origen.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: de configuración (backlog; revisar al preparar los e2e de la Fase 3)

---

### [LOW-003] Lectura estricta del día de progreso
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | Robustez / FR-034 |
| **Componente afectado** | `domain/progress.py` (`day_from_document`) |

**Descripción**
`day_from_document` exige el campo `date` (`data["date"]`). Un documento de día dañado, escrito
a mano en la consola o por un error futuro, lanzaría `KeyError` dentro de la transacción e
impediría completar tareas ese día. El resto de la lectura ya es tolerante, porque los valores
inesperados toman su valor por defecto.

**Evidencia**
`day_from_document`: `date=str(data["date"])`.

**Remediación requerida**
Tomar la fecha del identificador del documento, que es la clave del día, en lugar de exigir el
campo.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: de implementación (backlog)

---

## Observaciones sin hallazgo

- **Carrera del logro «Sin urgencias»**: el recuento se hace antes de la transacción. Con dos
  pestañas, el logro podría concederse o no con un margen de una tarea. Es cosmético y está
  documentado en el código.
- **Puntuación inflable por la propia persona**: crear y completar tareas triviales sube los
  puntos. La spec lo permite expresamente (edge cases), y la puntuación es privada (FR-031).

## Categorías sin cambios en esta fase

- **Red y perímetro**: sin cambios.
- **Infraestructura e IAM**: sin cambios; la fase no toca `infra/` ni las cuentas de servicio.
- **Gestión de incidentes**: sin cambios.

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente | Cuándo |
|---|---|---|---|---|
| MED-001 | Media | Desarrollador backend | `mytasks-backend-developer` | En esta PR (**corregido**) |
| LOW-001 | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog (fase de cierre) |
| LOW-002 | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog; revisar en la Fase 3 |
| LOW-003 | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog |
