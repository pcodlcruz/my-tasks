# Informe de Auditoría de Seguridad — Feature 007 · Fase 6 (tareas programadas)

**Rama**: `feature/007-daily-progress-arcade-fase-6`
**Fecha**: 2026-10-31
**Tipología detectada**: API REST (FastAPI) sobre Firestore, en Cloud Run, con SPA React
**Marcos aplicados**: OWASP API Security Top 10 (2023), OWASP Top 10 (2021)
**Nivel de riesgo global**: Bajo, una vez corregidos MED-001 y MED-002 en esta misma PR

---

## Resumen ejecutivo

Se auditaron el CRUD `/api/v1/schedules` (con `pause` y `resume`), el modelo
`users/{uid}/schedules`, la generación de tareas dentro de la puesta al día de
`GET /me/progress`, los campos nuevos `schedule_id` y `scheduled_for` de las tareas y los eventos
de registro nuevos.

**Resultado**: no hay hallazgos críticos ni altos. Había **dos medios**, ya corregidos en esta PR
(cambios que acompañan a este informe), y quedan **dos bajos** para el backlog.

---

## Comprobaciones del alcance (T103)

| Punto | Resultado | Evidencia |
|---|---|---|
| Validación cerrada de las repeticiones | ✅ | `schemas/schedule.py`: unión discriminada por `kind`, `extra="forbid"`, días y `month_day` enteros estrictos (1–7 y 1–31), días no vacíos ni repetidos, texto con las reglas de `TaskCreate`; fecha única ≥ hoy en `check_once_date` con la zona horaria de la cuenta. Tests: `test_schedules.py`. |
| Autorización | ✅ | Todas las rutas usan `Depends(get_active_user)`; el id de ruta se valida tras autenticar (un 401 no se enmascara con un 404). |
| Aislamiento entre cuentas | ✅ | Los repositorios construyen siempre `users/{uid}/schedules` con el `uid` del token; ninguna ruta ni cuerpo lleva `uid`. La de otra cuenta responde 404. Tests: `test_progress_isolation.py`. |
| Cuentas revocadas | ✅ | La generación solo ocurre dentro de `GET /me/progress`, que exige `get_active_user`; una cuenta revocada recibe 403 y no genera nada. Al reactivarla se genera solo la ocurrencia más reciente (`latest_due`). |
| Límite de 50 programaciones | ✅ (tras MED-001) | `_create_within_limit` cuenta y escribe en una transacción. |
| Límite de 500 tareas activas | ✅ con reserva | Ver LOW-001. |
| Sin duplicados con concurrencia | ✅ | `_generate` relee la programación dentro de la transacción y `plan_generation` devuelve `None` si `next_occurrence` ya pasó de hoy. Tests de dos `GET` concurrentes. |
| Registros sin títulos | ✅ | Los eventos `schedule_*` llevan solo `uid`, `schedule_id` y `day`; los fallos registran la clase del error, nunca su texto. |
| Campos no editables | ✅ | `schedule_id` y `scheduled_for` solo salen en `TaskOut`; `TaskUpdate` sigue con `extra="forbid"`. |

---

## Hallazgos

### [MED-001] Límite de 50 programaciones eludible con peticiones paralelas — CORREGIDO
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `services/schedule_service.py`, `repositories/schedule_repository.py` |

**Descripción**: el recuento y la escritura eran operaciones separadas; una ráfaga de creaciones
podía superar las 50 y, con ellas, el coste de la puesta al día (que recorre las vencidas).

**Corrección**: `ScheduleRepository.create` cuenta y crea en una sola transacción y lanza
`ScheduleLimitError`. Test de integración con creaciones en paralelo.

**Destinatario**: `mytasks-backend-developer` (de implementación). Hecho.

### [MED-002] Un fallo en la generación podía tumbar la lectura del progreso — CORREGIDO
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4 / disponibilidad |
| **Componente afectado** | `services/schedule_service.py` (`generate_due`) |

**Descripción**: `generate_due` corre antes de cerrar los días pasados. Una excepción (transacción
perdida, *timeout*, índice ausente) hacía fallar `GET /me/progress` entero y dejaba sin marcador ni
racha a la cuenta mientras durase.

**Corrección**: `generate_due` captura los errores por programación y en la consulta inicial, los
registra (`schedule_generation_failed`, solo clase del error) y sigue. Lo no generado sigue
vencido y se reintenta en la siguiente lectura. Test unitario y de integración.

**Destinatario**: `mytasks-backend-developer` (de implementación). Hecho.

### [LOW-001] El límite de 500 tareas activas es blando en la generación
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4 |
| **Componente afectado** | `schedule_service.generate_due` |

**Descripción**: `has_room` se calcula con un recuento previo fuera de la transacción de cada
programación. Dos lecturas simultáneas, o una creación manual a la vez, pueden superar 500 en
como máximo el número de programaciones vencidas (≤ 50). Mismo carácter «blando» que el límite
manual existente.

**Remediación**: aceptar el riesgo (acotado, sin efecto de seguridad) o recontar dentro de la
transacción de generación.

**Destinatario**: `mytasks-backend-developer`. Backlog.

### [LOW-002] La fecha única admite fechas lejanísimas
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API3: Excessive Data Exposure / validación |
| **Componente afectado** | `schemas/schedule.py` (`OnceIn.date`) |

**Descripción**: solo se exige ≥ hoy; una fecha como el año 9999 se acepta. No hay impacto
(la programación queda dormida, cuenta para las 50), pero es una entrada sin cota superior.

**Remediación**: acotar la fecha (p. ej. a unos años vista) y responder 422.

**Destinatario**: `mytasks-backend-developer`. Backlog.

---

## Resumen de enrutamiento

| ID | Severidad | Estado | Skill/Agente |
|---|---|---|---|
| MED-001 | Media | Corregido en la PR | mytasks-backend-developer |
| MED-002 | Media | Corregido en la PR | mytasks-backend-developer |
| LOW-001 | Baja | Backlog | mytasks-backend-developer |
| LOW-002 | Baja | Backlog | mytasks-backend-developer |

**Reservas**: no se auditó el frontend más allá de que no añade superficie (React escapa el texto)
ni infraestructura (la fase no la cambia).
