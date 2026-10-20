# Informe de Auditoría de Seguridad — Revisión final de la feature 002 (T092)

**Fecha**: 2026-10-19
**Tipología detectada**: Aplicación web (React) + API REST (FastAPI) + Cloud-native/GCP (Cloud Run, Firestore, Identity Platform) + pipeline CI/CD (GitHub Actions, Workload Identity Federation).
**Marcos aplicados**: OWASP Top 10, OWASP API Security Top 10, CIS Google Cloud Foundation Benchmark.
**Alcance**: identidades, permisos, IAM, federación, identidades de `plan` (`terraform-plan-*`) y custodia de la clave del agente. Parte de los informes de las fases 1 a 5, `security-review-t046.md` y `security-review-t081.md`.
**Método**: solo lectura. Estado de `pdlco-mytasks` y `pdlco-mytasks-stg` por el MCP de Google Cloud (cuenta `mytasks-ai-agent`) y estado de GitHub por la API pública. No se ha cambiado ninguna infraestructura ni permiso.
**Nivel de riesgo global**: **Medio**

---

## Resumen ejecutivo

**No hay hallazgos críticos ni altos: nada bloquea la aceptación de la feature.** Las identidades del pipeline, la federación y la custodia de la clave del agente están en el estado diseñado. Quedan dos hallazgos medios y tres bajos, más dos controles con fecha.

Lo comprobado y correcto:

- **Federación**: el proveedor `github-actions` está activo y su condición exige `repository_owner_id=='210847116'` y `repository_id=='1370451186'` (ids numéricos, sin comodines).
- **Cuentas del pipeline**: `terraform-*`, `terraform-plan-*` y `deployer-*` existen en ambos proyectos y las seis tienen `keys list --managed-by=user` vacío (solo se autentican por federación). La excepción a vigilar es la suplantación por `serviceAccountTokenCreator` de proyecto en staging (MED-001).
- **Roles personalizados**: `mytasksEnvironmentAdmin`, `mytasksPlanReader` y `mytasksPlatformPlanReader` están concedidos como se diseñó. `terraform-plan-*` solo tiene roles de lectura. `projectIamAdmin` de `terraform-*` está acotado a `roles/datastore.user`.
- **Agente**: solo `roles/viewer` permanente. Todo lo demás lleva la condición `request.time < 2026-10-30T23:00:00Z`. No tiene ningún rol de Cloud Run ni de despliegue.
- **Clave del agente**: una sola clave de usuario, creada el 2026-09-30.
- **Detección**: las alertas «Terraform: cambio de IAM en una cuenta de servicio» y «Agente: operación de IAM o intento denegado» están activas en ambos proyectos. La auditoría de datos de `datastore` e `iam` está activa en ambos.
- **Sin exposición**: ninguna política de proyecto contiene `allUsers` ni `allAuthenticatedUsers`.
- **GitHub**: los cuatro *rulesets* (`main`, `develop`, `release/*`, `hotfix/*`) están activos, con PR obligatoria, borrado y *force-push* bloqueados y los **nueve** checks requeridos. `production`, `infra-production` e `infra-staging` tienen `can_admins_bypass: false` y al propietario como revisor.

---

## Hallazgos

### [MED-001] `firebase-adminsdk-fbsvc` de staging conserva `serviceAccountTokenCreator` a nivel de proyecto

| Campo | Valor |
|---|---|
| **Estado** | **Cerrado (2026-10-20)**: el propietario retiró el rol; comprobado por el MCP en solo lectura, `firebase-adminsdk-fbsvc` solo conserva `roles/firebase.sdkAdminServiceAgent` en `pdlco-mytasks-stg`. Si se vuelve a activar el login en la consola de Firebase, comprobar que no se reañade. |
| **Severidad** | Media (sin clave de usuario ni uso conocido: baja probabilidad) |
| **Categoría** | CIS GCP 1.5 — `serviceAccountTokenCreator` a nivel de proyecto |
| **Componente afectado** | `pdlco-mytasks-stg`: cuentas `terraform-staging`, `deployer-staging`, cuentas de ejecución |

**Descripción**
`firebase-adminsdk-fbsvc` puede generar tokens de cualquier cuenta de servicio del proyecto. En `security-review-t046.md` (HIGH-002) se retiró este rol y se advirtió de que regenerar las claves del Admin SDK desde la consola de Firebase podía volver a añadirlo. En producción sigue retirado; en staging está otra vez.

**Evidencia**
Política IAM de `pdlco-mytasks-stg`: `roles/iam.serviceAccountTokenCreator → firebase-adminsdk-fbsvc@pdlco-mytasks-stg…` (sin condición). En `pdlco-mytasks` la misma cuenta solo tiene `firebase.sdkAdminServiceAgent` y `firebaseauth.admin`. `keys list --managed-by=user` de la cuenta está vacío en los dos proyectos. Causa probable, **no verificada**: la activación del acceso con Google desde la consola de Firebase en staging (T068).

**Remediación requerida**
Comprobar que nada de la aplicación usa esa cuenta en staging (como en producción) y retirar la concesión de proyecto. Anotar en el RUNBOOK que activar proveedores desde la consola de Firebase puede reañadirla y repetir esta comprobación en cada entorno nuevo. Revisar también producción tras cualquier cambio en la consola de Firebase.

**Destinatario**
- Skill/agente: propietario, con `mytasks-google-cloud-operator` para comprobar
- Tipo de cambio: De configuración

---

### [MED-002] La recreación de un entorno y su retirada no se han probado (SC-007)

| Campo | Valor |
|---|---|
| **Severidad** | Media (riesgo residual **aceptado por el propietario el 2026-10-19**) |
| **Categoría** | Gestión de incidentes y recuperación |
| **Componente afectado** | `infra/RUNBOOK.md` §11, raíces `infra/envs/*` y `infra/platform/` |

**Descripción**
T089 paso 2 se descartó: nadie ha seguido el RUNBOOK para recrear un entorno en un proyecto desechable, y el procedimiento de «Retirar un entorno» (levantar `prevent_destroy` y `deletion_protection`) tampoco se ha ejercitado. Si hay que reconstruir tras un incidente, pueden aparecer pasos manuales no documentados (hay varios conocidos: Identity Platform a mano, roles personalizados, vinculaciones de proyecto).

**Evidencia**
`tasks.md` T089 (paso 2 descartado) y RUNBOOK §11, «Retirar un entorno» («Procedimiento no probado»).

**Remediación requerida**
Mantener el riesgo aceptado y visible: SC-007 consta como no verificado en T093. Sugerencia de bajo coste: la primera vez que se cree un entorno real nuevo, hacerlo siguiendo solo el RUNBOOK y anotar los pasos que falten.

**Destinatario**
- Skill/agente: propietario (decisión tomada)
- Tipo de cambio: De configuración

---

### [LOW-001] El *environment* `staging` permite a los administradores saltarse la aprobación

| Campo | Valor |
|---|---|
| **Estado** | **Cerrado (2026-10-20)** en lo que afecta a la seguridad: `can_admins_bypass: false`, comprobado por la API pública de GitHub (`updated_at` 2026-10-20). El revisor (`pcodlcruz`) se mantiene; la decisión de si quitarlo o evitar despliegues redundantes sigue aplazada (no es un hallazgo de seguridad). |
| **Severidad** | Baja |
| **Categoría** | Configuración y hardening |
| **Componente afectado** | *Environment* `staging` de GitHub |

**Descripción**
`staging` tiene `can_admins_bypass: true`; `production`, `infra-staging` e `infra-production` lo tienen en `false` (LOW-001 de `security-review-fase-5.md`, corregido solo en los otros tres). Está además la decisión aplazada del revisor de `staging`: hoy cada push a `develop` lanza un despliegue que espera aprobación.

**Evidencia**
`GET /repos/pcodlcruz/my-tasks/environments`: `staging.can_admins_bypass = true`, `updated_at` 2026-10-01.

**Remediación requerida**
Poner `can_admins_bypass` en `false` en `staging`, o retirar el revisor si se decide que no hace falta (decisión pendiente del propietario). Debe quedar coherente con los demás *environments*.

**Destinatario**
- Skill/agente: propietario (ajuste de GitHub; ningún skill cubre Actions)
- Tipo de cambio: De configuración

---

### [LOW-002] Clave del agente sin fecha de rotación registrada

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | Autenticación; gestión de secretos |
| **Componente afectado** | `mytasks-ai-agent`, RUNBOOK §2 |

**Descripción**
La clave de usuario no caduca (`validBeforeTime` 9999-12-31) y la política es rotarla cada 90 días. El RUNBOOK sigue con `TODO(propietario): fecha` (LOW-003 de `security-review-fase-1.md`, abierto). Por la fecha de creación, la rotación vence el **2026-12-29**.

**Evidencia**
`keys list`: clave `7195d296…`, `USER_MANAGED`, creada el 2026-09-30T19:37:35Z. RUNBOOK §2, línea con el `TODO(propietario)`.

**Remediación requerida**
Anotar en el RUNBOOK la fecha de creación (2026-09-30) y la de rotación (2026-12-29) y confirmar el recordatorio del calendario.

**Destinatario**
- Skill/agente: propietario
- Tipo de cambio: De configuración

---

### [LOW-003] Presupuestos y alertas de facturación sin crear (FR-026)

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | Logging, auditoría y detección |
| **Componente afectado** | Cuenta de facturación (fuera de Terraform por decisión del propietario) |

**Descripción**
Sin presupuestos no hay aviso ante un gasto inesperado, y la API pública con escalado automático es un vector de abuso económico. El máximo de instancias (2 en staging, 5 en producción) limita el techo, pero no avisa.

**Evidencia**
`tasks.md` T085 abierta; `guia-propietario-t085.md` sin ejecutar. El agente no tiene acceso a la facturación y no se ha podido comprobar.

**Remediación requerida**
Crear los dos presupuestos (10 y 15 USD/mes, alertas al 50, 90 y 100 %) con la guía y confirmar los importes.

**Destinatario**
- Skill/agente: propietario
- Tipo de cambio: De configuración

---

## Controles con fecha y cierres de informes anteriores

| Asunto | Estado | Acción |
|---|---|---|
| Permisos temporales del agente (T060) | Caducan solos el **2026-10-30 23:00 UTC**, condición verificada en ambos proyectos. Incluye `artifactregistry.admin` (permitiría publicar imágenes, no desplegar) y `storage.admin` en producción. | Tras el 31: verificar que solo queda `roles/viewer`, anotar la fecha en RUNBOOK §4 y marcar T060. Las vinculaciones caducadas siguen listadas pero inertes; el propietario puede limpiarlas. Sin `logging.viewer` el agente deja de leer registros. |
| «Checks de CI» (constitución 1.3.1) | **Verificable ya**: `release/*` y `hotfix/*` tienen los nueve checks requeridos (leído hoy de la API pública). | Pasar el mecanismo a *activo* con una enmienda PATCH. |
| MED-003 y resto de fase 1 (permisos temporales, MCP fijado, hook) | Cerrados por los controles aplicados. LOW-002 (operación de control en el registro) sigue abierto. | Backlog. |
| HIGH-001, MED-002, MED-003 de `security-review-t046.md` | Cerrados/aceptados con controles; HIGH-002 resuelto en producción (ver MED-001 aquí para staging). | — |
| MED-001 de `security-review-t081.md` (`terraform-production` reescribe federación) | Riesgo aceptado, detección activa (alerta de IAM en cuentas de servicio). | — |
| LOW de fases 2, 3 y 4 (LOW-001/002/003 de fase 2; LOW-001/002/003 de fase 3; LOW-001/004 de fase 4) | **No reverificados en esta revisión**: son del backlog técnico y no figuran como corregidos en `tasks.md`. | Seguir en backlog. |

## Categorías sin evidencia suficiente en esta revisión

- **Cifrado en reposo y TLS**: se asume el comportamiento por defecto de Cloud Run y Firestore; no se ha verificado de forma independiente.
- **Dependencias y CVEs**: no se ha repetido el análisis (LOW-003 de fase 2 sigue en backlog). El escaneo de secretos sobre el historial completo (T089) dio 0 resultados.
- **Cuentas de Compute por defecto**: sin `roles/editor` (MED-002 de T046, resuelto); no se ha reverificado hoy.

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| MED-001 | Media | Propietario (comprobación y cambio de IAM) | `mytasks-google-cloud-operator` |
| MED-002 | Media (aceptada) | Propietario | — (decisión tomada) |
| LOW-001 | Baja | Propietario (ajuste de GitHub) | Ninguno cubre Actions |
| LOW-002 | Baja | Propietario | — |
| LOW-003 | Baja | Propietario | — |

## Conclusión

**Sin hallazgos bloqueantes.** T092 puede cerrarse con MED-001 anotado como acción del propietario antes de dar la feature por terminada, y con MED-002 explícito como riesgo aceptado en T093.
