# Informe de Auditoría de Seguridad — Feature 007 · Fase 7 (historial de progreso)

**Rama**: `feature/007-daily-progress-arcade-fase-7`
**Fecha**: 2026-10-31
**Tipología detectada**: API REST (FastAPI) sobre Firestore, en Cloud Run, con SPA React
**Marcos aplicados**: OWASP API Security Top 10 (2023), OWASP Top 10 (2021)
**Nivel de riesgo global**: Bajo

---

## Resumen ejecutivo

Se auditaron los tres endpoints de lectura nuevos (`GET /api/v1/me/progress/days`,
`/days/{day}` y `/stats`), la lectura de tareas por identificador del detalle de un día y la
pantalla `/progreso` del frontend. La fase no escribe datos, no cambia el modelo de Firestore ni la
infraestructura.

**Resultado**: no hay hallazgos críticos, altos ni medios. Hay **un defecto de corrección** que se
detectó durante la revisión y se corrige en esta PR (OBS-001), y **un bajo** para el backlog.

---

## Comprobaciones del alcance (T113)

| Punto | Resultado | Evidencia |
|---|---|---|
| Autorización en las tres rutas | ✅ | `routers/progress.py`: las tres usan `Depends(get_active_user)`; la validación del día de la ruta (`valid_day`) depende también de la autenticación, así que un 401 nunca se enmascara con un 404. Tests: `test_the_three_routes_require_an_active_account` (401 sin token, 403 sin cuenta). |
| `uid` solo del token | ✅ | Ninguna ruta lleva `uid` en ruta, consulta ni cuerpo; `ProgressRepository` construye siempre `users/{uid}/…`. Tests: `test_each_account_only_reads_its_own_days_and_stats`. |
| El detalle solo lee tareas propias | ✅ | `get_live_tasks` lee `users/{uid}/tasks/{id}` con identificadores salidos del `progress_days` de la propia cuenta (escritos por el servidor, nunca por el cliente). Un identificador ajeno no podría resolverse bajo otro `uid`. |
| Sin las tareas de la papelera ni las purgadas | ✅ | Se descartan las que tienen `in_trash` (las purgadas por tiempo siguen en la papelera hasta borrarse) y las que ya no existen. Test: `test_day_detail_lists_the_tasks_without_the_trashed_or_the_purged`. |
| Límite de 84 días | ✅ | `check_day_range` rechaza `from > to` y más de 84 días con 422 `validation_error`, tras analizar ambas fechas con el tipo `date`. Tests: rango inválido parametrizado y `test_days_accepts_exactly_84_days`. |
| Un día ajeno o inexistente da el mismo 404 | ✅ | Un día sin documento, una forma que no es fecha y el día de otra cuenta producen `ProgressDayNotFoundError` con el mismo código y mensaje. Test: la respuesta de otra cuenta es idéntica a la de un día inexistente. |
| El cliente no fija valores de juego | ✅ | Las tres rutas son `GET` sin cuerpo; la puntuación, la racha y los logros salen del `progress/state` del servidor. |
| `arcade_mode` desactivado | ✅ | `points` de los días y el bloque `arcade` de las estadísticas salen `null`. Tests incluidos. |
| Registros | ✅ | La fase no añade eventos de registro; ninguna ruta escribe títulos ni descripciones en los logs. |
| Frontend | ✅ | Los títulos se pintan como texto de React (sin `dangerouslySetInnerHTML`); el día de la URL sale de las claves del calendario calculadas en el cliente, y las fechas de la consulta van con `encodeURIComponent`. |

---

## Hallazgos

### [OBS-001] El detalle listaba como completada una tarea reabierta otro día — CORREGIDO
| Campo | Valor |
|---|---|
| **Severidad** | Informativa (corrección, sin impacto de seguridad) |
| **Categoría** | Corrección funcional |
| **Componente afectado** | `services/progress_service.py` (`get_day`) |

**Descripción**: reabrir una tarea otro día no la quita de `completed_task_ids` del día en que se
completó, porque ese día está cerrado y conserva su crédito (FR-006). El detalle de ese día la
listaba aunque ahora esté abierta.

**Corrección**: `get_day` solo devuelve tareas con estado `completed`. El recuento del día no
cambia. Test: `test_day_detail_leaves_out_a_task_reopened_on_a_later_day`.

**Destinatario**: `mytasks-backend-developer` (de implementación). Hecho.

### [LOW-001] Sin tope de tareas leídas por día en el detalle
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `repositories/progress_repository.py` (`get_live_tasks`) |

**Descripción**: el detalle lee, en bloques de 100, todas las tareas de `completed_task_ids`. La
lista de un día no tiene tope propio, así que una cuenta que complete cientos de tareas en un día
hace cientos de lecturas en cada consulta de ese día. Solo afecta a la propia cuenta, que está
acotada por el límite de 500 tareas activas y por sus propias completaciones.

**Remediación**: aceptar el riesgo o limitar la lista del detalle (con un aviso de «y N más»).

**Destinatario**: `mytasks-backend-developer`. Backlog.

---

## Resumen de enrutamiento

| ID | Severidad | Estado | Skill/Agente |
|---|---|---|---|
| OBS-001 | Informativa | Corregido en la PR | mytasks-backend-developer |
| LOW-001 | Baja | Backlog | mytasks-backend-developer |

**Reservas**: la revisión es de código; no se ha probado el endpoint con volúmenes grandes de
tareas por día.
