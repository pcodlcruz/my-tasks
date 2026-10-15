# Informe de Auditoría de Seguridad — Fase 4: staging y despliegue automático

**Feature**: `002-cloud-run-cicd` | **Rama**: `feature/002-cloud-run-cicd-fase-4` (PR #29) | **Fecha**: 2026-10-14

**Tipología detectada**: Cloud-native / GCP (IaC, IAM, Identity Platform, Cloud Run, Firestore), pipeline CI/CD (cadena de suministro) y API REST (un endpoint anónimo).
**Marcos aplicados**: CIS Google Cloud Foundation Benchmark, OWASP API Security Top 10 (API4, API8) y OWASP CI/CD Security Risks.
**Nivel de riesgo global**: **Medio**

---

## Resumen ejecutivo

Se auditó el diff de la fase: el módulo `infra/modules/environment/` y la raíz `infra/envs/staging/`, los tres roles personalizados de `infra/iam/roles/`, `deploy.yml`, `deploy-staging.yml`, los cambios de `infra.yml`, el script de humo y la caché de `/readyz`.

**No hay hallazgos críticos ni altos.** Hay **uno medio** (la procedencia de la imagen no se comprueba antes de validarla) y **tres bajos**. Ninguno bloquea fusionar la PR a `develop`; el medio debería resolverse antes de la Fase 5, porque es lo que sostiene la puerta «solo producción lo validado en staging» (FR-006).

Lo más importante de lo que está bien hecho: los roles personalizados excluyen documentos, cuentas de usuario, secretos de OAuth y borrado; la identidad de `plan` no puede escribir; todos los permisos de despliegue son a nivel de recurso; se despliega por *digest* y con etiquetas inmutables; ningún valor se interpola en los scripts de los workflows.

**Limitaciones de esta auditoría** (ver «Información insuficiente»): `terraform validate` y `plan` no se han ejecutado, así que el comportamiento real del módulo contra Google Cloud no se ha observado, y varios ajustes de GitHub de los que depende la seguridad del pipeline no son legibles para el agente.

---

## Hallazgos

### [MED-001] La procedencia de la imagen no se comprueba antes de desplegarla y validarla
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP CI/CD: Insufficient flow control / Artifact integrity validation |
| **Componente afectado** | `deploy.yml` (pasos «Find the images» y «Mark the images as validated»), repositorio `mytasks` |

**Descripción**
En staging, si ya existe una imagen con la etiqueta `<hash de árbol>`, el pipeline no la reconstruye: la despliega tal cual y, tras el humo, le añade `validated-<hash>`. Producción solo promueve lo que lleva esa etiqueta. Nada comprueba que esa imagen se construyera a partir del contenido de ese árbol. Las etiquetas inmutables impiden *mover* una etiqueta, pero no que alguien *cree antes* la etiqueta de un hash futuro con otro contenido.

**Evidencia**
- `deploy.yml`, «Find the images»: `digest=$(digest_of "$REGISTRY/$name:$hash")` y `if [ -n "$digest" ]; then build=false`.
- `infra/platform/main.tf`, `deployer_staging_writer`: `deployer-staging` tiene `roles/artifactregistry.writer` sobre el repositorio de producción, que incluye crear etiquetas.
- «Mark the images as validated» añade `validated-<hash>` al *digest* que haya, sin más comprobación.

**Impacto y condiciones**
Para explotarlo hace falta ejecutar código con la identidad `deployer-staging`, es decir, que un workflow se ejecute en `develop`, `release/*` o `hotfix/*`. Esas ramas están protegidas por *rulesets* y el *environment* `staging` restringe las ramas, así que exige comprometer antes el control de revisión. Por eso es media y no alta. Pero la puerta de FR-006 descansa hoy solo en esa confianza.

**Remediación requerida**
Registrar la procedencia al construir (etiquetas o anotaciones de la imagen con el *commit* y el hash de árbol, y quién la construyó) y exigirla antes de desplegar una imagen ya existente y antes de añadirle `validated-<hash>`; si no coincide, reconstruir con una etiqueta distinta o fallar. Alternativamente, evaluar atestaciones de procedencia firmadas.

**Destinatario**
- Skill/agente: ningún skill cubre GitHub Actions (decisión previa del propietario para `infra.yml`); a mano, o `mytasks-google-cloud-architect` si se quiere un diseño de firma de artefactos primero.
- Tipo de cambio: De implementación (workflow) y, si se firma, arquitectónico.

**Estado (2026-10-15): corregido en la rama `feature/002-cloud-run-cicd-fase-5-med-001`** (opción A del propietario). `deploy.yml` construye con una etiqueta temporal y `image-provenance.sh stamp` republica `<hash>` con las etiquetas de procedencia; el paso «Check the provenance» las exige por *digest* antes de crear revisiones o añadir `validated-<hash>`, en staging y en producción. Test con un `docker` falso (26 casos, verificado contra una mutación). **Riesgo residual aceptado:** las etiquetas no protegen frente a una identidad con escritura en el registro (`deployer-staging`); lo cubriría una atestación firmada (opción C, backlog). Se cambia un comentario en `backend/project.toml` y `frontend/Dockerfile` a propósito: las imágenes ya publicadas en staging no llevan etiquetas y son inmutables, así que el nuevo hash fuerza una reconstrucción. Sin verificar contra Artifact Registry real hasta el primer despliegue (`docker buildx imagetools inspect --format '{{json .Image}}'` y `docker build --provenance=false`).

---

### [LOW-001] El contrato afirma que `deployer-*` no puede tocar los datos, pero puede ejecutar código con la identidad que sí puede
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | CIS GCP 1.x: mínimo privilegio / documentación de riesgo |
| **Componente afectado** | `contracts/environments.md` (matriz de identidades), `infra/modules/environment/iam.tf` y `cloud_run.tf` |

**Descripción**
La matriz dice que `deployer-<env>` no puede «tocar Firestore». Pero tiene `roles/run.developer` sobre los dos servicios y `roles/iam.serviceAccountUser` sobre `mytasks-api-run-<env>`, que lleva `roles/datastore.user`. Quien controle un job de despliegue puede desplegar una revisión con una imagen arbitraria que se ejecute como esa cuenta y lea o escriba todos los datos del entorno. Es inherente a desplegar, no un fallo del diseño, pero el contrato lo oculta.

**Evidencia**
`iam.tf`: `deployer_acts_as_api`; `cloud_run.tf`: `deployer_api`; `google_project_iam_member.api_datastore_user`.

**Remediación requerida**
Corregir la redacción de la matriz y anotarlo como riesgo aceptado en el RUNBOOK, indicando que lo acotan las restricciones de rama del *environment* y la aprobación del propietario en `production`. Comprobar que el *environment* `production` exige esa aprobación (ver «Información insuficiente»).

**Estado (2026-10-14): parcial.** La matriz y la regla de `contracts/environments.md` ya lo reflejan. Falta que el propietario confirme la aprobación de `production` (Fase 5, T079).

**Destinatario**
- Skill/agente: `mytasks-google-cloud-architect` (contrato) / propietario (aceptación del riesgo).
- Tipo de cambio: De documentación y de configuración.

---

### [LOW-002] La imagen de marcador es de terceros, no está fijada por *digest* y corre con la identidad de la API
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | Cadena de suministro; Principio III (nada de `latest`) |
| **Componente afectado** | `infra/modules/environment/variables.tf` (`placeholder_image`), servicios de Cloud Run |

**Descripción**
La primera revisión de cada servicio usa `us-docker.pkg.dev/cloudrun/container/hello`, sin etiqueta (es decir, `latest`) ni *digest*. En `mytasks-api` se ejecuta con `mytasks-api-run-<env>`, que tiene acceso de datos al entorno, hasta el primer despliegue real. Es una imagen de ejemplo de Google, pero la regla del proyecto es no usar etiquetas móviles.

**Evidencia**
`variables.tf`: `default = "us-docker.pkg.dev/cloudrun/container/hello"`.

**Remediación requerida**
Fijar la imagen por *digest* en el valor por defecto (o usar una imagen mínima del propio repositorio).

**Estado (2026-10-14): corregido.** `placeholder_image` apunta al *digest* `sha256:e2a01cf1…` leído por el MCP en solo lectura.

**Destinatario**
- Skill/agente: `mytasks-iac-developer`
- Tipo de cambio: De configuración.

---

### [LOW-003] Firestore sin recuperación a un punto en el tiempo ni copias programadas
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | Gestión de incidentes y recuperación (categoría 7); CIS GCP |
| **Componente afectado** | `infra/modules/environment/main.tf` (`google_firestore_database`) |

**Descripción**
La base se crea con `point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"` y sin copias programadas. La papelera conserva las tareas 30 días, pero un borrado definitivo por un fallo de la aplicación o de un token comprometido no se puede deshacer. Las especificaciones no exigen copias de seguridad, así que no es un incumplimiento; es una decisión que conviene tomar de forma explícita para producción.

**Evidencia**
`main.tf`, bloque `google_firestore_database.default`. El módulo es el mismo para staging y producción.

**Remediación requerida**
Decidir para producción (Fase 5) si se habilita la recuperación a un punto en el tiempo, que es barata para este volumen, o copias programadas, y dejar la decisión por escrito. En staging puede seguir desactivada; para ello el módulo necesitaría una variable.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-architect` (decisión) y luego `mytasks-iac-developer`.
- Tipo de cambio: Arquitectónico y de configuración.

**Resuelto (2026-10-14):** producción habilita la recuperación a un punto en el tiempo (variable `firestore_point_in_time_recovery` del módulo, `true` en producción y `false` en staging); no se añaden copias programadas. Decisión y límites en `infra/RUNBOOK.md` §10. El efecto real llega con el primer `apply` de producción.

---

## Qué está bien

- **Roles personalizados** (`infra/iam/roles/`): sin `datastore.entities.*`, `firebaseauth.users.*`, `firebaseauth.configs.getSecret`, borrado de bases ni de claves. `mytasksPlanReader` no tiene ningún permiso de escritura ni de cambio de política IAM. `roles/viewer` se descartó con evidencia de la documentación (incluye `datastore.entities.get` y `firebaseauth.users.get`).
- **Mínimo privilegio en el módulo**: `mytasks-web-run-<env>` sin roles; `mytasks-api-run-<env>` solo `roles/datastore.user`; los permisos de `deployer-*` son sobre cada servicio y cada cuenta, no sobre el proyecto.
- **Protección contra borrado**: `delete_protection_state`, `prevent_destroy` y `deletion_protection` en los servicios; además, `mytasksEnvironmentAdmin` no incluye `datastore.databases.delete`, así que Terraform no puede borrar la base aunque se retirase la protección del código.
- **Identity Platform**: sin `localhost` en los dominios autorizados; la clave de API está restringida a dos APIs y a los orígenes del entorno; el proveedor de Google (con su secreto) no pasa por Terraform ni por el estado.
- **Pipeline**: federación sin claves; `id-token: write` solo en el job que despliega; acciones fijadas por SHA; los valores llegan a los scripts por `env`, no interpolados; despliegue por *digest*; etiquetas de imagen inmutables; producción falla antes de tocar nada si falta `validated-<hash>`; reversión de la API si falla la web; la etiqueta de revisión se retira siempre.
- **`/readyz`** (T065a): el coste de un llamante anónimo queda acotado por instancia (una lectura cada 5 s), los fallos no se filtran y se registra un error por ventana.
- **Auditoría**: la de datos de Firestore e IAM del entorno está declarada (`manage_data_access_audit`).

---

## Información insuficiente (no se ha podido auditar)

| Tema | Por qué no se pudo | Qué haría falta |
|---|---|---|
| Comportamiento real del módulo | `terraform validate` y `plan` no se ejecutan en el sandbox del agente; solo `fmt` | El resultado de `terraform-validate` del CI y, tras fusionar, del primer `apply` |
| La lista de permisos de los roles | Sale de los recursos del módulo y de los roles predefinidos, no de un `plan` real | Un `plan` y un `apply` reales |
| Que `release/*` y `hotfix/*` no se puedan crear con un `push` directo | Ajuste de GitHub, no legible por el agente | Que el propietario confirme los *rulesets* y que no hay *bypass* |
| Que el *environment* `staging` solo admite `develop`, `release/*` y `hotfix/*`, y que `production` exige la aprobación del propietario | Ajuste de GitHub, no legible por el agente | Confirmación del propietario (afecta a LOW-001 y a la Fase 5) |
| Alta abierta de usuarios | Es por diseño (FR-001 de la feature 001: cualquier cuenta de Google obtiene su espacio) y no se audita aquí | — |

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| MED-001 | Media | Workflow (a mano); diseño de firma si se quiere | ninguno cubre Actions; `mytasks-google-cloud-architect` |
| LOW-001 | Baja | Contrato y aceptación de riesgo | `mytasks-google-cloud-architect` / propietario |
| LOW-002 | Baja | IaC | `mytasks-iac-developer` |
| LOW-003 | Baja | Decisión de arquitectura, luego IaC | `mytasks-google-cloud-architect` → `mytasks-iac-developer` |

---

## Adenda (2026-10-14): PR #30, plan visible antes de aprobar el `apply`

**Alcance**: `infra.yml` (jobs `plan-*` y `apply-*`), `infra-plan.sh`, y las vinculaciones de federación de `terraform-plan-staging` y `terraform-plan-production` a los pushes a `develop` y `main`, creadas por el MCP con confirmación del propietario.

**Resultado**: sin hallazgos críticos, altos ni medios. Mejora la seguridad: el propietario aprueba un `apply` habiendo leído el plan (FR-020) y el pipeline se niega a aplicar un plan distinto del mostrado.

### [LOW-004] La huella del plan no cubre los valores sensibles
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP CI/CD: integridad del flujo aprobado |
| **Componente afectado** | `.github/scripts/infra-plan.sh` (`actions_of`, huella) |

**Descripción**
La huella se calcula sobre el texto del plan, donde Terraform enmascara los valores sensibles. Un cambio que solo afecte a un valor sensible aparecería igual en el plan mostrado y en el aplicado.

**Evidencia**
Los valores sensibles del módulo son `google_apikeys_key.web.key_string` y el bloque `env` que lo contiene, ambos con valor público por diseño (va en `/config.js`). No hay secretos en el estado (research R8).

**Remediación requerida**
Ninguna ahora. Si algún día entra un secreto en Terraform, la huella debería cubrirlo sin publicarlo (por ejemplo, un resumen del JSON del plan calculado dentro del job, sin subirlo) o el secreto no debería pasar por Terraform.

**Destinatario**
- Skill/agente: `mytasks-iac-developer`
- Tipo de cambio: De implementación, solo si cambia el supuesto.

### Riesgo aceptado: quién puede suplantar las cuentas `terraform-plan-*`

Las dos vinculaciones nuevas usan como sujeto la rama (`…:ref:refs/heads/develop` y `…:ref:refs/heads/main`), porque el job de plan no tiene *environment*. Cualquier workflow que corra en esas ramas, incluido uno añadido después, puede usarlas. Está acotado por tres cosas: las ramas están protegidas por *rulesets* (el código llega por PR revisada); las cuentas son de solo lectura y no ven documentos, usuarios ni secretos (roles personalizados de MED-001); y la condición del *pool* sigue exigiendo el repositorio y el propietario por identificador numérico. Es el mismo límite de confianza que ya tienen los despliegues.

### Comprobado en esta revisión

- Los valores que llegan a los scripts (`$ROOTS`, la huella, las etiquetas) salen de nombres de directorio fijos y de salidas de jobs del propio workflow; no se interpola nada de la PR.
- El job de plan usa `-lock=false` y una identidad sin escritura: no puede modificar el estado ni la infraestructura.
- El fichero de sustitución del *backend* de la vista previa se escribe y se borra en el *runner* y lo genera el script, no la PR.
- Una vista previa que falla es un aviso, pero no abre ninguna vía de aplicar algo sin ver: el plan real se hace en `plan-*` y el `apply` exige su huella.
- Tests del script con un `terraform` falso (22), verificados contra una mutación de la huella.

### Información insuficiente

| Tema | Por qué no se pudo | Qué haría falta |
|---|---|---|
| Que el resumen publicado del plan no contiene ningún secreto | El agente no puede leer los resúmenes de los jobs | Que el propietario lo lea al revisar el plan y avise si algún valor parece un secreto |
| Que el `plan` real de `staging` no tiene errores de permisos | La vista previa de la PR no dio aviso, pero el agente no ve su contenido | La lectura del resumen de `terraform-validate` de la PR #30 |
