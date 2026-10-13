# Informe de Auditoría de Seguridad — Fase 3: IAM, federación e identidades de `plan` en PR (T061)

**Fecha**: 2026-10-13 | **Rama**: `feature/002-cloud-run-cicd-fase-3` (`da2f7e3`) | **Auditor**: `mytasks-security-auditor`
**Tipología detectada**: Cloud-native / GCP (IAM, federación de identidad, estado de Terraform) con pipeline CI/CD en un repositorio público.
**Marcos aplicados**: CIS Google Cloud Foundation Benchmark (IAM, registro), documentación de *Workload Identity Federation*, OWASP CI/CD Security Top 10 (CICD-SEC-2, 4, 5, 6, 9).
**Nivel de riesgo global**: **Medio** (sin hallazgos críticos ni altos; ninguno bloquea fusionar la PR de la Fase 3).

## Resumen ejecutivo

Se auditó el código de la fase: `.github/workflows/infra.yml`, `infra/platform/` (federación, cuentas `terraform-*`, `terraform-plan-*`, `deployer-*`, registro de imágenes, bucket de estado, auditoría), el RUNBOOK §4–§8 y lo verificado en el informe `security-review-t046.md`. No se ha operado sobre Google Cloud ni leído la configuración de GitHub (los *environments*, los *rulesets* y los ajustes de Actions no son legibles con las herramientas del agente).

**Bien resuelto, sin hallazgos**: acciones de terceros fijadas por SHA completo y Terraform por versión exacta; `.terraform.lock.hcl` versionado con hashes; `permissions: contents: read` por defecto y `id-token: write` solo en los tres jobs que se autentican; entradas de evento pasadas por `env` (sin inyección de scripts); sin `pull_request_target`; `persist-credentials: false`; condición del proveedor por ids numéricos y sin comodines; cada cuenta se vincula a un único sujeto exacto; `plan` con `-lock=false` y sin rol de escritura; bucket de estado con acceso uniforme, prevención de acceso público, versionado y `prevent_destroy`; repositorio de imágenes con etiquetas inmutables; sin claves en ningún punto.

**Requiere acción**: el plan guardado se sube como artefacto descargable de un repositorio público (MED-001); el aislamiento de la federación depende de ajustes de GitHub todavía sin confirmar (MED-002); y hay tres mejoras menores de detección y endurecimiento (LOW-001 a LOW-003).

**No bloquea** fusionar la Fase 3. MED-001 debe resolverse antes de que un `plan` contenga valores sensibles (Fase 4, T068), y MED-002 antes del primer `apply` de producción.

---

## Hallazgos

### [MED-001] El `plan` guardado se publica como artefacto en un repositorio público

> **CORREGIDO el 2026-10-13.** Eliminados los dos pasos `upload-artifact` de `infra.yml`; el `apply` sigue usando el fichero del disco del mismo job. Contrato `pipeline.md` y T057 actualizados.
| Campo | Valor |
|---|---|
| **Severidad** | Media (latente: hoy el plan no contiene secretos; pasa a Alta si los contiene) |
| **Categoría** | OWASP CICD-SEC-6 — higiene de credenciales; CIS GCP — protección de datos sensibles |
| **Componente afectado** | `.github/workflows/infra.yml`, jobs `apply-staging` y `apply-production` |

**Descripción.** Un fichero `.tfplan` contiene la configuración completa y los valores del estado en claro, **incluidos los marcados como `sensitive`**: el enmascarado solo afecta a la salida de texto. Los jobs de `apply` lo suben con `actions/upload-artifact` (retención de 30 días). En un repositorio público, cualquier usuario autenticado de GitHub puede descargar los artefactos de las ejecuciones. El diseño asume que el plan no tiene secretos (research R8), pero la Fase 4 añade Identity Platform y el proveedor de Google (T063, T068), cuya configuración puede incluir el secreto del cliente OAuth.

**Evidencia.** `infra.yml:278-283` (`tfplan-staging-<sha>`) y `infra.yml:343-348` (`tfplan-production-<sha>`). El `apply` lee el fichero de `$RUNNER_TEMP` del mismo job (`infra.yml:291`, `:356`); **el artefacto no lo consume nadie**, solo existe como registro.

**Remediación requerida.** Dejar de subir el binario del plan. Si se quiere conservar un registro, conservar solo el texto del plan (ya publicado en el resumen del job) o, si debe ser el binario, hacerlo fuera de un artefacto público. Añadir a `contracts/pipeline.md` la regla «ningún artefacto de plan en repositorios públicos» y revisar R8 cuando la Fase 4 introduzca valores sensibles. Considerar el borrado de los artefactos ya generados (hoy no hay ninguna ejecución de `apply`).

**Destinatario**: `mytasks-iac-developer` (ningún skill cubre GitHub Actions, ver nota del propietario) · Tipo: De implementación.

### [MED-002] El aislamiento de las identidades depende de ajustes de GitHub sin confirmar
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP CICD-SEC-1/5 — control del flujo y acceso al pipeline; *Best practices for WIF* |
| **Componente afectado** | Vinculaciones `workloadIdentityUser` de `terraform-production`, `terraform-plan-production` y `deployer-production` |

**Descripción.** Las vinculaciones identifican al llamante por el `sub` del OIDC de GitHub: `…:environment:infra-production` y `…:pull_request`. El `sub` **no incluye la rama ni el fichero de workflow**:
- `environment:infra-production` lo cumple cualquier workflow de cualquier rama que declare ese *environment*. Lo único que lo limita a `main` es la política de ramas del *environment* en GitHub y el revisor obligatorio.
- `pull_request` lo cumple cualquier ejecución de PR. Una PR que modifique `infra.yml` (incluida la guarda `SAME_REPO`) obtiene a `terraform-plan-*` si GitHub le entrega un token OIDC; para forks lo impide GitHub por defecto, pero depende de los ajustes de Actions del repositorio. `terraform-plan-*` puede leer el estado de su prefijo, y `terraform init` / `plan` ejecuta código de la PR (fuentes de datos `external`, proveedores).

El propio RUNBOOK deja ambas confirmaciones como pendientes (`TODO(propietario)` de T044 y nota de HIGH-001 de `security-review-t046.md`).

**Evidencia.** `infra/platform/main.tf:82-94` y `:164-169`; `attribute_mapping` (`main.tf:42-46`) solo mapea `repository_id` y `repository_owner_id`, sin `ref` ni `job_workflow_ref`. RUNBOOK §8 (T044 y alerta). Configuración de GitHub no legible desde el agente.

**Remediación requerida.**
1. El propietario confirma y anota en el RUNBOOK, antes del primer `apply`: (a) `infra-production` e `infra-staging` con revisor obligatorio, *Allow administrators to bypass* desmarcada y ramas permitidas `main` y `develop` respectivamente; (b) aprobación obligatoria de workflows de colaboradores externos y sin tokens de escritura ni secretos para forks; (c) los *rulesets* que exigen `terraform-validate`.
2. Valorar un segundo seguro independiente de GitHub: mapear `assertion.ref` y `assertion.job_workflow_ref` en el proveedor y sustituir la vinculación por una de `principalSet` con atributo, de modo que `terraform-production` solo se obtenga desde `refs/heads/main` y desde `infra.yml`. Decisión arquitectónica, no urgente si (1) se confirma.

**Destinatario**: propietario (1); `mytasks-google-cloud-architect` y `mytasks-iac-developer` (2) · Tipo: De configuración / Arquitectónico.

### [LOW-001] Sin detección de cambios en la federación ni en la auditoría
La alerta existente cubre `SetIamPolicy` sobre cuentas de servicio hecho por `terraform-*`. `terraform-production` tiene `workloadIdentityPoolAdmin` y `platform` gestiona el proveedor: ampliar `attribute_condition` (por ejemplo, a otro repositorio) o modificar `auditConfigs` no dispara nada. Evidencia: `main.tf:40`, `:242-266`; RUNBOOK §8 (alerta). Remediación: ampliar la alerta, o crear otra, a `UpdateWorkloadIdentityPoolProvider`, `CreateWorkloadIdentityPoolProvider` y a la actualización de `auditConfigs` por `terraform-*`; los nombres de método se confirman con el primer `apply`. Destinatario: propietario con `mytasks-google-cloud-operator` (las alertas no las crea el agente).

### [LOW-002] Registros de auditoría sin retención ampliada ni destino protegido
Los registros de acceso a datos (T055) van al *bucket* `_Default` (30 días) y no hay exportación a un destino protegido contra modificación. Para un sistema de un solo propietario es aceptable, pero un incidente descubierto tras más de un mes no se podría reconstruir. Remediación: valorar un *sink* a un bucket con retención bloqueada, o ampliar la retención de `_Default`, en la Fase 6 (observabilidad). Destinatario: `mytasks-google-cloud-architect`.

### [LOW-003] Granularidad de `deployer-staging` sobre el repositorio de producción
Riesgo ya aceptado (RUNBOOK §8, T049). Se anota que la inmutabilidad de etiquetas impide sobrescribir una imagen publicada, pero no impide **publicar** una nueva, que producción solo debe promover por digest verificado. Remediación: en la Fase 5 (T07x), que el despliegue de producción referencie el digest probado en staging y lo verifique. Destinatario: `mytasks-iac-developer`.

## No verificado (información insuficiente)
- Configuración real de los *environments*, *rulesets* y ajustes de Actions de GitHub (MED-002).
- Comportamiento de `terraform init` con las condiciones por prefijo del bucket y de la alerta de IAM con tráfico real: pendiente de T058/T059 tras el primer `apply`.
- Si `roles/viewer` expone documentos de Firestore para `terraform-plan-*` (MED-001 de `security-review-t046.md`, sigue abierto y se cierra en la Fase 4).
- Incidentes y recuperación (categoría 7): sin plan de respuesta documentado más allá de la revocación de la clave del agente (RUNBOOK §3); no hay procedimiento para comprometer `terraform-production`. Se propone añadirlo al RUNBOOK en la Fase 6.

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| MED-001 | Media | Desarrollador IaC / CI | `mytasks-iac-developer` (justificar en la PR que ningún skill cubre Actions) |
| MED-002 | Media | Propietario; arquitecto e IaC | `mytasks-google-cloud-architect`, `mytasks-iac-developer` |
| LOW-001 | Baja | Propietario y operador | `mytasks-google-cloud-operator` |
| LOW-002 | Baja | Arquitecto | `mytasks-google-cloud-architect` |
| LOW-003 | Baja | IaC | `mytasks-iac-developer` |

## Conclusión sobre T061
Sin hallazgos **bloqueantes** (críticos o altos). T061 puede darse por cumplida cuando el propietario acepte el informe; MED-001 debería corregirse en esta misma PR (cambio pequeño en `infra.yml`) y MED-002 (1) confirmarse antes del primer `apply` desde `main`.
