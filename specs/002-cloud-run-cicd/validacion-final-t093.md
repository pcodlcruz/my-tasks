# Validación final de la feature 002 (T093)

**Fecha**: 2026-10-19 · **Rama**: `feature/002-cloud-run-cicd-fase-6` · **Referencias**: [quickstart.md](./quickstart.md), [security-review-t092.md](./security-review-t092.md)

Cada escenario se marca con lo que se ha **demostrado** y lo que **no**. Las comprobaciones sobre Google Cloud son de solo lectura por el MCP.

## Resultado por escenario

| # | Escenario | Estado | Evidencia | Falta |
|---|---|---|---|---|
| 1 | Identidad del agente | **Parcial** | Comprobaciones 2 y 3: el hook rechaza `--account` y `--impersonate-service-account` (hoy). 6: `gcloud` directo denegado por la regla `deny`. 1: los errores del MCP identifican como cuenta activa a `mytasks-ai-agent`. 7: solo existe el servidor `gcloud` del proyecto. 8: sin operaciones de otras identidades en el registro de auditoría de producción en las últimas 24 h. | 4 y 5: denegadas hoy por el clasificador del modo automático, no por la capa del sandbox y las reglas de lectura, así que esa capa no queda demostrada (la probó la Fase 1). 8: el agente no tiene `privateLogViewer`, por lo que no ve los registros `data_access` ni puede comprobar que sus propias lecturas figuran a su nombre (LOW-002 de la fase 1). 9: no se reinició la sesión. |
| 2 | Las PR comprueban y no despliegan | **Cumplido** | Los nueve checks corren en cada PR a `develop` (#45, #46…). La PR #46 (borrador) con un test que falla puso `backend-tests` en rojo. Los *rulesets* de los cuatro patrones exigen los nueve checks (leído hoy). | Negativo `api-contract-compat` (retirar un campo del contrato) no ejecutado. |
| 3 | Staging desde `develop` | **Cumplido** | Run 38591380788 del 2026-10-14: revisiones, digests, `/health`, `/readyz`, `/config.js`, `validated-<hash>`; tarea creada y completada. Hoy `/health` de staging responde `ok` con versión `fc5caa28…`. | Duración < 15 min (SC-001) no registrada. |
| 4 | Un fallo no sustituye la versión activa | **No demostrado** | — (T076 abierta) | Humo fallido sin cambio de tráfico y variable ausente que falla nombrándola. |
| 5 | Aislamiento entre entornos | **Cumplido** | T083: tarea de staging ausente en producción; tokens cruzados `401` en ambos sentidos; control `200`; definiciones comparadas por el MCP. | — |
| 6 | Producción desde `main`, misma imagen | **Cumplido** | T081/T082 (2026-10-16): mismos digests en staging y producción (api `317be3af…`, web `da94f609…`); `/config.js` apunta a producción. `/health` de ambos devuelve hoy la misma versión de la API. | Duración SC-002 y variante negativa («versión no validada en staging») sin medir. |
| 7 | Nadie más puede desplegar | **Parcial** | El agente no tiene ningún rol de Cloud Run ni de despliegue en ninguno de los dos proyectos (política IAM leída hoy). La federación solo acepta entornos concretos del repositorio con sus ids numéricos. | Intento activo de crear una revisión como agente y de usar `deployer-*` desde `feature/*` (T059, abierta). |
| 8 | Fallos visibles y estado consultable | **Cumplido** | T084: notificación en 2 min, móvil y correo, con el paso fallido y el enlace. `/health` consultable en ambos entornos. | Se probó con un fallo de `ci`, no de `deploy-staging`. En *Deployments* `staging` figura pendiente de aprobación (decisión del revisor aplazada). |
| 9 | Concurrencia | **No demostrado** | — (T076 abierta) | Dos fusiones seguidas en `develop`. |
| 10 | Sin secretos y reproducibilidad | **Parcial** | `gitleaks` sobre 125 commits: 0 credenciales (SC-008). | Recreación del entorno desde el RUNBOOK (SC-007): descartada por el propietario el 2026-10-19; riesgo aceptado (MED-002 de T092). |

**Criterios de la feature** (`quickstart.md`, «Criterio de aceptación»): la revisión de `mytasks-security-auditor` no tiene hallazgos bloqueantes (T092). Los diez escenarios **no** pasan completos: los escenarios 4 y 9 no se han ejecutado, y los 1, 7 y 10 solo en parte.

## Definition of Done (constitución)

| Punto | Estado | Evidencia |
|---|---|---|
| Complejidad justificada (I) | ✅ | `plan.md`: *Constitution Check* y *Complexity Tracking*. |
| Tests del nivel correspondiente en verde (II) | ✅ | Los nueve checks de CI son obligatorios en los cuatro patrones de rama. |
| Sin secretos; revisión de seguridad si toca auth, autorización o datos (III) | ✅ | `gitleaks` 0 resultados; informes de las fases 1 a 5, T046, T081 y T092. |
| Staging validado antes de producción y despliegue siempre vía pipeline (IV, VI) | ✅ | T081/T082: mismos digests; los despliegues los hacen `deployer-*`. |
| Nada en Google Cloud fuera del MCP ni con credenciales personales (V) | ✅ | Constitución 1.3.2: mecanismos *activos*. En esta sesión, solo MCP y consultas HTTP públicas (`/health`, API pública de GitHub). |
| PR fusionada por el propietario; ningún agente ejecutó `merge` (VII) | ⏳ | La PR de la Fase 6 aún no existe. |
| Tarea hecha con el agente/skill correspondiente o excepción justificada (VIII) | ✅ | Excepción documentada: ningún skill cubre GitHub Actions (`infra.yml`, `deploy*.yml`). |
| Código y commits en inglés, PR, Issues y docs en español (IX) | ✅ | Conventional Commits en todos los commits de la fase. |

## Aceptación de riesgos (pendiente de ratificar por el propietario)

Propuesta de cierre de T093: en lugar de ejecutar las comprobaciones que faltan, el propietario acepta
expresamente los riesgos siguientes. Hasta que lo ratifique, T093 sigue abierta.

| # | Qué no se ha demostrado | Riesgo que se acepta | Por qué es tolerable | Cómo se mitiga |
|---|---|---|---|---|
| R-1 | Escenario 4 (T076): un humo fallido no cambia el tráfico; una variable ausente falla nombrándola | Un defecto en esas ramas de `deploy.yml` solo se descubriría con un fallo real | El pipeline de staging y de producción ha desplegado correctamente de extremo a extremo; la lógica de comprobación tiene tests en `scripts-tests`; un despliegue fallido deja la revisión anterior sirviendo tráfico en Cloud Run por diseño | Recuperación de despliegue fallido en RUNBOOK; el primer fallo real se tratará como la prueba del escenario |
| R-2 | Escenario 9 (T076): dos fusiones seguidas en `develop` | Que la concurrencia no serialice o cancele mal las ejecuciones | Está configurada con `concurrency` por entorno; el revisor del *environment* de `staging` ya serializa de hecho los despliegues | Revisión manual de *Actions* si coinciden dos ejecuciones |
| R-3 | Escenario 7 (T059): intento activo de desplegar como agente o con `deployer-*` desde `feature/*` | Que un permiso o condición de federación no sea tan restrictivo como se lee | Lectura de la política IAM: el agente no tiene roles de despliegue; la federación exige entorno concreto y ids numéricos de propietario y repositorio; informes de seguridad T046, T081 y T092 sin críticos ni altos | Los *environments* con revisores y los *rulesets* son una segunda capa; la caducidad del 2026-10-30 reduce aún más el alcance del agente (T060) |
| R-4 | Escenario 10 / SC-007 (MED-002 de T092): recreación de un entorno desde el RUNBOOK y retirada de un entorno | El RUNBOOK podría tener pasos erróneos u omitidos al recrear o retirar un entorno | Staging y producción se crearon siguiendo esos mismos pasos; la decisión ya se tomó el 2026-10-19 | Las correcciones que aparezcan al usarlo se anotan en el RUNBOOK |
| R-5 | FR-026 (T085): sin presupuestos ni alertas de gasto | Un coste inesperado no avisaría al propietario | Es un requisito **DEBERÍA**, no DEBE; la carga es de uso personal y de bajo volumen; Cloud Run escala a cero y Firestore e Identity Platform tienen capa gratuita (R11) | El propietario revisa la facturación a mano con la periodicidad que decida; `maxScale` limita el escalado (2 en staging, 5 en producción) |
| R-6 | Negativos sin ejecutar: `api-contract-compat`, versión no validada en staging (escenario 6); duraciones SC-001 y SC-002 | Esas ramas negativas y los tiempos objetivo no están medidos | Las ramas positivas están demostradas | Se medirán en el siguiente cambio real |

**Ratificación**: _Nombre y fecha del propietario: ____________________ ._

## Pendientes antes de dar la feature por terminada

**Del propietario**
- ~~T085: crear los presupuestos con alertas~~ **Descartada (2026-10-20)**: riesgo R-5.
- ~~MED-001 de T092~~ **Hecho (2026-10-20)**, verificado por el MCP.
- ~~LOW-001 de T092~~ **Hecho (2026-10-20)**: `can_admins_bypass: false` en `staging`, verificado. La decisión del revisor sigue aplazada (afecta a R-2).
- ~~LOW-002 de T092~~ **Hecho (2026-10-20)**: fechas anotadas en RUNBOOK §2 (rotación el 2026-12-29).

**Escenarios por ejecutar**
- 4 y 9 (T076): necesitan fusiones reales en `develop`, que hace el propietario.
- 7 (T059): intento activo de despliegue denegado.

**Con fecha**
- T060: verificar tras el 2026-10-31 que el agente solo conserva `roles/viewer`.
