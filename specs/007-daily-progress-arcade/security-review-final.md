# Informe de Auditoría de Seguridad — Feature 007 · Revisión final (T119)

**Fecha**: 2026-11-01 · **Rama**: `feature/007-daily-progress-arcade-fase-8`
**Tipología detectada**: aplicación web (React) + API REST (FastAPI) + cloud-native (Firestore, Cloud Run).
**Marcos aplicados**: OWASP Top 10, OWASP API Security Top 10 y CIS Google Cloud Foundation Benchmark.
**Nivel de riesgo global**: **Bajo**. Sin hallazgos críticos, altos ni medios. No bloquea el paso a staging ni a producción.

---

## Resumen ejecutivo

Revisión de cierre de la feature completa: el estado acumulado de los informes de las Fases 2, 6 y 7
(`security-review-fase-2.md`, `-fase-6.md`, `-fase-7.md`), la cabecera de reloj `X-Test-Now` y la
documentación añadida en la Fase 8 (README, runbook, quickstart).

- Los **tres medios** de las fases anteriores (MED-001 de la Fase 2, MED-001 y MED-002 de la Fase 6)
  y el defecto OBS-001 de la Fase 7 están corregidos y con test.
- Quedan **cuatro bajos abiertos** (tres de ellos por una sola causa) y **uno por confirmar** que no
  depende del código. Ninguno tiene impacto sobre otras cuentas: todos acotan recursos de la propia
  persona.
- La feature **no cambia infraestructura, IAM ni el pipeline** (sin cambios en `infra/` ni
  `.github/` respecto a `develop`), no añade variables de entorno y no incorpora credenciales al repo.

Esta revisión se basa en lectura del código y de los informes anteriores, y en las baterías de tests
(backend 920, frontend 588 unitarios y 96 e2e, en verde). **No se probó contra un entorno real**:
staging y producción se validan en T122 y T125.

---

## Comprobaciones por categoría

| Categoría | Resultado | Evidencia |
|---|---|---|
| 1. Autenticación y autorización | ✅ | Las 13 operaciones nuevas (7 de `/me/progress*` y 6 de `/schedules*`) exigen token y cuenta activa; el `uid` sale siempre del token. `test_progress_isolation` y `test_schedules` prueban el aislamiento entre cuentas, el 401 sin token y el 403 de cuenta revocada. Ningún endpoint acepta puntuación, racha, nivel, logros ni `uid` del cliente (`test_no_endpoint_accepts_game_values_or_another_uid`). |
| 2. Exposición de datos sensibles | ✅ | Los eventos de registro llevan `uid`, día y recuentos; `schedule_generation_failed` registra solo la clase del error. Sin títulos, descripciones ni puntuaciones en los registros. Búsqueda de claves, tokens y claves privadas en `backend/src`, `frontend/src`, `docs/design/export-stitch.py`, la spec, el README y el runbook: sin coincidencias. El script de exportación toma el token de la variable de entorno, sin guardarlo. |
| 3. Red y perímetro | ✅ | `firestore.rules` sigue en `allow read, write: if false` (todo pasa por la API). `ALLOWED_HEADERS` del CORS es solo `Authorization` y `Content-Type`: `X-Test-Now` **no** está, así que ningún navegador de otro origen puede enviarla (cierra LOW-002 de la Fase 2: los e2e la añaden desde su propio origen con `page.route`). |
| 4. Dependencias y cadena de suministro | ✅ | Dependencia nueva de backend: `tzdata>=2025.2`, fijada en `uv.lock`. La fuente Press Start 2P va autoalojada con su licencia OFL (`frontend/src/assets/fonts/OFL.txt`); la CSP mantiene `font-src 'self'` y `style-src 'self'`, sin orígenes nuevos. Sin llamadas a `fonts.googleapis.com`. |
| 5. Configuración y hardening | ✅ | `X-Test-Now` solo actúa con `APP_ENV=local` (`clock.py`, `get_clock`); en cualquier otro entorno se ignora (`test_test_clock_header`). Respuestas con `Cache-Control: no-store` y cabeceras de seguridad. Sin `dangerouslySetInnerHTML`, `innerHTML` ni `eval` en `frontend/src`. |
| 6. Logging y auditoría | ✅ | Eventos de generación, omisión por límite, fallo, límite de programaciones y misión (ver runbook §15). |
| 7. Incidentes y recuperación | ⚠️ | Documentado cómo corregir a mano una racha o una programación (runbook §15), marcado como **no probado**. Misma limitación que el resto de procedimientos manuales del runbook. |

---

## Estado acumulado de los hallazgos

| Origen | Hallazgo | Estado |
|---|---|---|
| Fase 2 | MED-001 · fallo de la consulta de «Sin urgencias» impedía completar | **Corregido** |
| Fase 2 | LOW-002 · `X-Test-Now` fuera de local genera un aviso por petición | **Cerrado**: aceptado; la cabecera no está en el CORS y los e2e no la necesitan allí |
| Fase 6 | MED-001 · límite de 50 programaciones eludible en paralelo | **Corregido** |
| Fase 6 | MED-002 · un fallo de generación tumbaba la lectura del progreso | **Corregido** |
| Fase 7 | OBS-001 · el detalle listaba una tarea reabierta otro día | **Corregido** |
| Fase 2 y 7 | LOW-001 (ambas) · sin tope de completadas por día | **Abierto**, ver LOW-001 |
| Fase 2 | LOW-003 · lectura estricta del día de progreso | **Abierto**, ver LOW-002 |
| Fase 6 | LOW-002 · fecha única sin cota superior | **Abierto**, ver LOW-003 |
| Fase 6 | LOW-001 · límite de 500 activas blando en la generación | **Abierto**, ver LOW-004 |

---

## Hallazgos abiertos

### [LOW-001] Sin tope de completadas por día (consolida Fase 2 LOW-001 y Fase 7 LOW-001)
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4:2023 · consumo de recursos sin restricción |
| **Componente afectado** | `domain/progress.py` (`apply_complete`) y `progress_repository.get_live_tasks` |

**Descripción**
Cada completado añade un id a `completed_task_ids` del día, sin tope. El límite de 500 tareas
activas no lo acota: se puede crear, completar y repetir. Un día con decenas de miles de ids se
acercaría al límite de 1 MiB del documento y, desde ahí, las transacciones fallarían para esa
cuenta. Además, el detalle del día (`GET /me/progress/days/{day}`) lee todas esas tareas en bloques
de 100. El impacto es solo para la propia cuenta.

**Evidencia**
`domain/progress.py:353`: `completed_task_ids=(*day.completed_task_ids, task.id)`. No hay límite de
frecuencia de creación de tareas (feature 001).

**Remediación requerida**
Fijar un máximo de completados contados por día (por ejemplo, 1 000): por encima, la tarea se
completa pero no cuenta ni puntúa, y se registra un aviso. Limitar igualmente la lista del detalle
con un «y N más».

**Destinatario**: `mytasks-backend-developer` · de implementación · backlog.

### [LOW-002] Lectura estricta del día de progreso (Fase 2 LOW-003)
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | Robustez (FR-034) |
| **Componente afectado** | `domain/progress.py` (`day_from_document`) |

**Descripción**
Exige el campo `date`. Un documento de día dañado o editado a mano lanzaría `KeyError` dentro de la
transacción e impediría completar tareas ese día para esa cuenta.

**Evidencia**
`domain/progress.py:599`: `date=str(data["date"])`.

**Remediación requerida**
Tomar la fecha del identificador del documento, que es la clave del día.

**Destinatario**: `mytasks-backend-developer` · de implementación · backlog.

### [LOW-003] Fecha única de una programación sin cota superior (Fase 6 LOW-002)
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API3:2023 · validación de entrada |
| **Componente afectado** | `schemas/schedule.py` (`OnceIn.date`) |

**Descripción**
Solo se exige que sea hoy o posterior; una fecha del año 9999 se acepta. Sin impacto funcional
(queda dormida y cuenta entre las 50), pero es una entrada sin cota.

**Evidencia**
`schemas/schedule.py`: `date: date` sin validador de rango.

**Remediación requerida**
Acotar la fecha a unos años vista y responder 422 fuera de ese rango.

**Destinatario**: `mytasks-backend-developer` · de implementación · backlog.

### [LOW-004] Límite de 500 tareas activas blando en la generación (Fase 6 LOW-001)
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4:2023 |
| **Componente afectado** | `schedule_service.generate_due` |

**Descripción**
`has_room` se calcula con un recuento previo, fuera de la transacción de cada programación. Dos
lecturas simultáneas, o una creación manual a la vez, pueden superar 500 en como mucho el número de
programaciones vencidas (≤ 50). Mismo carácter blando que el límite manual de la feature 001.

**Evidencia**
`schedule_service.py:129-137`: `count_active` antes del bucle y `has_room=active < MAX_ACTIVE_TASKS`.

**Remediación requerida**
Aceptar el riesgo (acotado, sin efecto de seguridad) o recontar dentro de la transacción de
generación.

**Destinatario**: `mytasks-backend-developer` · de implementación · backlog (aceptable).

---

## Punto por confirmar (no verificable desde el código)

**API de Stitch habilitada en `pdlco-mytasks`.** Según el registro de la Fase 1, el propietario
tenía pendiente deshabilitar `stitch.googleapis.com` en ese proyecto y retirar los permisos
usados para exportar las pantallas (manual, fuera de Terraform). Los CIS recomiendan no dejar
habilitadas las APIs que no se usan. **No lo he podido comprobar**: la regla del proyecto impide
operar sobre Google Cloud fuera del MCP con la cuenta del agente, y no se ha hecho ninguna consulta
real. Si ya está hecho, basta anotarlo; si no, es una tarea del propietario antes de la release.

**Destinatario**: propietario · de configuración (`mytasks-google-cloud-operator` si se hace con el
MCP y confirmación explícita).

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente | Cuándo |
|---|---|---|---|---|
| LOW-001 | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog técnico |
| LOW-002 | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog técnico |
| LOW-003 | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog técnico |
| LOW-004 | Baja | Desarrollador backend | `mytasks-backend-developer` | Aceptable; backlog |
| Stitch | Por confirmar | Propietario | `mytasks-google-cloud-operator` | Antes de la release |

## Conclusión

La feature puede pasar a staging. Los bajos no bloquean y se pueden planificar tras la release.
Esta revisión es obligatoria por tocar el modelo de datos (Principio III) y queda registrada para el
*Definition of Done* (T120).
