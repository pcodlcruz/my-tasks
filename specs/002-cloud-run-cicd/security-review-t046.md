# Informe de Auditoría de Seguridad — Identidades `terraform-*` y arranque de la federación (T043–T046)

**Fecha**: 2026-10-09 | **Rama**: `feature/002-cloud-run-cicd-fase-3` | **Auditor**: `mytasks-security-auditor`
**Tipología detectada**: Cloud-native / GCP (IAM, federación de identidad, almacenamiento de estado) con pipeline CI/CD.
**Marcos aplicados**: CIS Google Cloud Foundation Benchmark (IAM y cuentas de servicio), documentación de *Workload Identity Federation* y de *limited role granting*.
**Nivel de riesgo global**: **Alto** (aceptable con los controles de este informe; ningún hallazgo crítico).

## Resumen ejecutivo

Se auditó lo aplicado en T043–T046 (bucket de estado, *pool* y proveedor, cuentas `terraform-*`, vinculaciones y acceso al bucket) y la lista de roles de proyecto que el propietario concederá a `terraform-production` y `terraform-staging`.

**Bien resuelto, sin hallazgos**: la condición del proveedor usa ids numéricos y no comodines; cada cuenta se vincula a **un único sujeto exacto** (`principal://…/subject/…`, no `principalSet`); el `sub` real lleva los ids dentro (T045); no hay claves de usuario en `firebase-adminsdk-fbsvc` ni en la cuenta de Compute por defecto de producción; el acceso al bucket está acotado por prefijo.

**Requiere acción antes de conceder roles**: `serviceAccountAdmin` no se puede acotar por nombre de cuenta (HIGH-001); dos roles propuestos darían acceso a datos de usuarios de la aplicación (MED-001); y hay concesiones heredadas que abren caminos laterales hacia las cuentas del pipeline (HIGH-002, MED-002, MED-003).

**No bloquea la producción** (aún no existe aplicación en producción), pero HIGH-001 y HIGH-002 deben tener su control aplicado **antes de conceder roles de proyecto a `terraform-*`**.

## Lista de roles propuesta (mínima)

Concede el propietario en consola, con sus credenciales. «Condición» = condición IAM en la concesión.

| Rol | `terraform-staging` (`pdlco-mytasks-stg`) | `terraform-production` (`pdlco-mytasks`) | Para qué |
|---|---|---|---|
| `roles/serviceusage.serviceUsageAdmin` | sí | sí | Habilitar APIs del módulo de entorno |
| `roles/run.admin` | sí | sí | Servicios de Cloud Run y su permiso de invocación |
| `roles/iam.serviceAccountAdmin` | sí | sí | Crear las cuentas de ejecución y su IAM (ver HIGH-001) |
| `roles/resourcemanager.projectIamAdmin` **con condición** `api.getAttribute('iam.googleapis.com/modifiedGrantsByRole', []).hasOnly(['roles/datastore.user'])` | sí | sí | Conceder `datastore.user` a la cuenta de la API. Las demás concesiones se hacen a nivel de recurso |
| Rol personalizado de aprovisionamiento de Firestore (ver MED-001) | sí | sí | Base de datos, índices y política TTL, **sin** acceso a documentos |
| Rol personalizado de configuración de Identity Platform (ver MED-001) | sí | sí | Configuración de Identity Platform, **sin** gestión de usuarios |
| `roles/iam.workloadIdentityPoolAdmin` | no | sí | Raíz `platform`: *pool* y proveedor |
| `roles/artifactregistry.admin` | no | sí | Raíz `platform`: repositorio de imágenes |
| Lectura de metadatos del bucket de estado (`roles/storage.legacyBucketReader` sobre el bucket) | no | sí | `plan` e importación del bucket sin poder reconfigurarlo |

`terraform-plan-staging` y `terraform-plan-production`: lectura de su proyecto y de **su** prefijo de estado, sin escritura. El `plan` debe ejecutarse con `-lock=false` (el bloqueo del estado exige crear un objeto y esas cuentas no escriben).

**Qué no se concede**: `roles/owner`, `roles/editor`, `roles/iam.serviceAccountUser` ni `roles/iam.serviceAccountTokenCreator` a nivel de proyecto, `roles/storage.admin` a nivel de proyecto, `roles/iam.roleAdmin`. El permiso `actAs` sobre las cuentas de ejecución lo concede Terraform a nivel de **cada cuenta** (puede, porque administra cuentas), no a nivel de proyecto.

**`projectIamAdmin` acotado: sí se puede.** La documentación (*Setting limits on granting roles*) confirma el mecanismo con `modifiedGrantsByRole` y `hasOnly` (hasta 10 roles, solo constantes, sin roles con `setIamPolicy` ni personalizados modificables). `roles/datastore.user` no contiene `setIamPolicy`, así que cumple. Dos precisiones: (1) no cubre cambios de `auditConfigs`, que no son concesiones, así que T055 sigue funcionando pero la identidad podría también debilitar la auditoría (ver LOW-001); (2) no se pueden unir varios `hasOnly` con `||`, hay que listar los roles en un único `hasOnly`.

---

## Hallazgos

### [HIGH-001] `serviceAccountAdmin` de `terraform-*` no se puede acotar y alcanza a las cuentas protegidas

> **CONTROLES APLICADOS el 2026-10-09 (riesgo aceptado).** Alerta `Terraform: cambio de IAM en una cuenta de servicio` creada por el propietario y verificada en solo lectura (activa) en `pdlco-mytasks` y `pdlco-mytasks-stg`. Revisor obligatorio `pcodlcruz` confirmado por el propietario en los *environments* de infraestructura. **Pendiente de confirmar por el propietario:** que *Allow administrators to bypass* está desmarcada y que las ramas permitidas son `main` (`infra-production`) y `develop` (`infra-staging`).
| Campo | Valor |
|---|---|
| **Severidad** | Alta (riesgo R-5 aceptado con controles) |
| **Categoría** | CIS GCP 1.x — mínimo privilegio en cuentas de servicio; escalada por `setIamPolicy` |
| **Componente afectado** | `terraform-production`, `terraform-staging`; cuentas `mytasks-ai-agent`, `deployer-*` y `terraform-plan-*` |

**Descripción.** Para crear las cuentas de ejecución, `terraform-*` necesita `iam.serviceAccounts.create` y `setIamPolicy`. `roles/iam.serviceAccountAdmin` incluye `setIamPolicy` sobre **todas** las cuentas del proyecto, no solo las que crea. La documentación de atributos de recurso no lista `iam.googleapis.com` entre los servicios que admiten condiciones por nombre de recurso (`conditions-resource-attributes`), así que no hay forma documentada de limitarlo a `mytasks-*-run-*`. En producción, `terraform-production` podría concederse suplantación de `mytasks-ai-agent`, de `deployer-production` o de las cuentas `terraform-plan-*`.

**Evidencia.** Política IAM de `pdlco-mytasks` (2026-10-09): `mytasks-ai-agent` vive en ese proyecto. Lista de atributos de recurso admitidos de la documentación consultada, sin `iam.googleapis.com`. En staging el agente no existe, así que el alcance de `terraform-staging` queda limitado a las cuentas de staging.

**Remediación requerida.**
1. Aceptar el riesgo de forma explícita (queda dentro de R-5) y aplicar los controles detectivos: ampliar la alerta del propietario a `SetIamPolicy` sobre cuentas de servicio cuyo autor sea `terraform-*` y cuyo recurso sea `mytasks-ai-agent`, `deployer-*` o `terraform-*`.
2. Verificar que `infra-production` e `infra-staging` exigen aprobación del propietario y limitan las ramas (`main` y `develop`) **antes** de conceder los roles; hoy no está comprobado desde fuera de GitHub.
3. Tras T060 (el agente queda de solo lectura) el valor de suplantar al agente disminuye; revisar el hallazgo entonces.
4. Valorar a la larga mover las cuentas de ejecución a un proyecto aparte sin cuentas protegidas.

**Destinatario**: `mytasks-google-cloud-architect` (decisión de topología) y el propietario (aprobaciones). Tipo: Arquitectónico / de configuración.

### [HIGH-002] `firebase-adminsdk-fbsvc` puede suplantar cualquier cuenta de `pdlco-mytasks`

> **RESUELTO el 2026-10-09.** Se comprobó que nada usa la cuenta (el backend solo verifica ID tokens; sin entradas en los registros de los últimos 30 días; sin claves ni política propia). El propietario retiró `serviceAccountTokenCreator` del proyecto y se verificó en solo lectura: `firebase-adminsdk-fbsvc` conserva solo `roles/firebase.sdkAdminServiceAgent` y `roles/firebaseauth.admin`. No regenerar claves de Admin SDK desde la consola de Firebase sin avisar: puede volver a añadirla.
| Campo | Valor |
|---|---|
| **Severidad** | Alta (sin clave de usuario hoy: baja probabilidad, impacto total en producción) |
| **Categoría** | CIS GCP 1.x — `serviceAccountTokenCreator` a nivel de proyecto |
| **Componente afectado** | Cuentas `terraform-production`, `mytasks-ai-agent`, `deployer-production` |

**Descripción.** `roles/iam.serviceAccountTokenCreator` está concedido a `firebase-adminsdk-fbsvc` **en el proyecto**, no sobre una cuenta concreta. Quien pueda actuar como esa cuenta puede generar tokens de cualquier otra del proyecto, incluida `terraform-production`, saltándose la federación, la aprobación del *environment* y el prefijo del estado.

**Evidencia.** Política IAM de `pdlco-mytasks`: `roles/iam.serviceAccountTokenCreator → firebase-adminsdk-fbsvc@pdlco-mytasks…`. Se comprobó que **no hay claves de usuario** de esa cuenta ni de la de Compute por defecto (`keys list --managed-by=user` vacío).

**Remediación requerida.** El propietario sustituye la concesión de proyecto por una concesión sobre la propia cuenta `firebase-adminsdk-fbsvc` (si la aplicación firma tokens personalizados) o la retira si nada la usa; comprobar antes qué componente de la feature 001 depende de ella. Hasta entonces, no crear claves de esa cuenta.

**Destinatario**: propietario con `mytasks-google-cloud-operator` (comprobación) · Tipo: De configuración.

### [MED-001] Roles de Firestore e Identity Platform propuestos exponen datos de usuarios
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP A01 / mínimo privilegio sobre datos personales |
| **Componente afectado** | `terraform-*` en ambos proyectos |

**Descripción.** `roles/datastore.owner` incluye `datastore.entities.create/delete/get/list/update` (todas las tareas de los usuarios) y `datastore.userCreds.*`. `roles/identitytoolkit.admin` incluye `firebaseauth.users.create/delete/get/update`, `sendEmail` y `configs.getSecret`. Terraform solo necesita gestionar la base de datos, los índices, la política TTL y la configuración, no leer ni escribir datos de personas. Un compromiso del pipeline daría acceso a los datos.

**Evidencia.** Permisos incluidos obtenidos con `iam roles describe` (2026-10-09).

**Remediación requerida.** Dos roles personalizados a nivel de proyecto, creados por el propietario, sin `datastore.entities.*`, `datastore.userCreds.*` ni `firebaseauth.users.*`. Los permisos exactos se fijan en la Fase 4 con un `terraform plan` real. Mientras tanto, no conceder los roles amplios. El propietario no concede `roles/iam.roleAdmin` a `terraform-*`, para que no puedan ampliar esos roles.

**Destinatario**: `mytasks-iac-developer` (permisos exactos) y propietario (creación) · Tipo: De configuración.

### [MED-002] La cuenta de Compute por defecto tiene `roles/editor` en ambos proyectos

> **RESUELTO el 2026-10-09.** El propietario retiró `roles/editor` de `2195266360-compute@…` (producción) y `838389521553-compute@…` (staging). Verificado en solo lectura: ninguna de las dos tiene ya concesiones en su proyecto. Queda como criterio del módulo de entorno (Fase 4) exigir cuenta de ejecución explícita en los servicios de Cloud Run.

> **Evidencia añadida 2026-10-09:** no hay servicios de Cloud Run en `pdlco-mytasks` y no hay actividad registrada de ninguna de las dos cuentas de Compute por defecto en los últimos 30 días. La API de Compute no está habilitada en producción.
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | CIS GCP 4.1 — cuenta por defecto con rol Editor |
| **Componente afectado** | `2195266360-compute@…`, `838389521553-compute@…` |

**Descripción.** Cloud Run usa esa cuenta si un servicio no declara cuenta de ejecución. Con `roles/editor` ejecutaría código de la aplicación con permisos de edición sobre casi todo el proyecto, y leería y escribiría el estado de Terraform por los enlaces heredados del bucket (MED-003).

**Evidencia.** `roles/editor → …-compute@developer.gserviceaccount.com` en ambos proyectos.

**Remediación requerida.** Retirar `roles/editor` de las dos cuentas por defecto (confirmando antes que nada las usa) y, en el módulo de entorno, exigir cuenta de ejecución explícita en los dos servicios de Cloud Run (criterio de aceptación de la Ficha 6).

**Destinatario**: propietario (retirada) y `mytasks-iac-developer` (módulo) · Tipo: De configuración.

### [MED-003] Enlaces heredados del bucket de estado

> **CORREGIDO el 2026-10-09 (autocorrección del auditor).** La remediación original (retirar los enlaces heredados del bucket) **no restringe nada**: `roles/editor`, `roles/owner` y `roles/viewer` concedidos en el proyecto ya incluyen permisos de Cloud Storage sobre todos sus buckets, con o sin esos enlaces. La exposición real es quién tiene esos roles de proyecto, y se cierra con MED-002 (retirar `roles/editor` de las cuentas de Compute por defecto). Se reclasifica a **Baja / informativo** y no se modifica el bucket. Por si hiciera falta aislar el estado de cualquier rol básico en el futuro, la vía sería un bucket en un proyecto aparte.
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | Mínimo privilegio sobre el estado de Terraform (puede contener datos sensibles de recursos) |
| **Componente afectado** | `gs://pdlco-mytasks-tfstate` |

**Descripción.** El bucket conserva `projectOwner`, `projectEditor` y `projectViewer` de `pdlco-mytasks` con `legacyBucketOwner`, `legacyObjectOwner` y lectura. Cualquier cuenta con esos roles en producción lee o reescribe el estado fuera de los prefijos acotados.

**Evidencia.** Política del bucket tras T046 (`storage buckets add-iam-policy-binding`).

**Remediación requerida.** Retirar los enlaces heredados de escritura y dejar solo las concesiones explícitas más el propietario; ejecutarlo con confirmación explícita (cambio en el bucket de estado). Conserva `prevent_destroy` y versionado.

**Destinatario**: `mytasks-google-cloud-operator` · Tipo: De configuración.

### [LOW-001] `projectIamAdmin` acotado no impide debilitar los registros de auditoría
Un `auditConfigs` modificado no es una concesión, así que la condición no lo bloquea. Es el mecanismo que necesita T055, de modo que no se puede impedir. Remediación: alerta detectiva sobre cambios de `auditConfigs` hechos por `terraform-*` (ya cubierta por la alerta de `setiampolicy`) y revisión del `plan` antes de aprobar. Destinatario: propietario.

### [LOW-002] Repositorio público
El resultado del `plan` publicado en la PR será visible. Sin secretos, pero revela recursos y cuentas. Remediación: publicarlo como artefacto o resumen del job en lugar de comentario (T056) y aplicar los ajustes de Actions para forks ya anotados en el RUNBOOK. Destinatario: `mytasks-iac-developer`.

## No verificado (información insuficiente)
- Si `roles/viewer` (para `terraform-plan-*`, alcanzables desde cualquier PR del repositorio) incluye lectura de documentos de Firestore: `iam roles describe` no admite filtrar permisos y no se pudo comprobar. Si los incluye, usar un rol personalizado de lectura de metadatos para esas cuentas.
- La condición del bucket con `objectListPrefix`: se comprobará con un `terraform init` real (T058/T059).
- La configuración real de los *environments* de GitHub (aprobación y ramas): no legible desde las herramientas del agente.

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| HIGH-001 | Alta | Arquitecto y propietario | `mytasks-google-cloud-architect` |
| HIGH-002 | Alta | Propietario / operador | `mytasks-google-cloud-operator` |
| MED-001 | Media | IaC y propietario | `mytasks-iac-developer` |
| MED-002 | Media | Propietario e IaC | `mytasks-iac-developer` |
| MED-003 | Baja (reclasificado) | — | — |
| LOW-001 | Baja | Propietario | — |
| LOW-002 | Baja | IaC | `mytasks-iac-developer` |

## Documentación consultada
`google-developer-knowledge` (2026-10-09): *Setting limits on granting roles* (`iam/docs/setting-limits-on-granting-roles`), *Conditions attribute reference* y *Resource attributes* (`conditions-attribute-reference`, `conditions-resource-attributes`), *Best practices for using Workload Identity Federation* y *Deny permissions support*.
