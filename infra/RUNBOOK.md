# Runbook de operación

Procedimientos operativos de la infraestructura y del acceso del agente a Google Cloud. Se irá
completando por fases (feature `002-cloud-run-cicd`); esta versión cubre la identidad aislada del
agente (Fase 1, FR-022 a FR-025).

Contrato de diseño: [`specs/002-cloud-run-cicd/contracts/agent-identity.md`](../specs/002-cloud-run-cicd/contracts/agent-identity.md).

## 1. Identidad aislada del agente: comprobaciones repetibles

**Cuándo ejecutarlas**: tras montar la identidad aislada (Fase 1), tras cambiar `.mcp.json`,
`.claude/settings.json` o el hook, tras rotar la clave, tras cambiar la versión del paquete del
MCP y como mínimo una vez por trimestre.

**Versión del MCP**: `.mcp.json` fija `@google-cloud/gcloud-mcp` en una versión exacta (hoy
`0.5.3`), nunca `latest` ni un rango: ese proceso corre fuera del sandbox con acceso al almacén
aislado de la clave. Para actualizarla, cambia la versión en `.mcp.json` en una PR, reinicia la
sesión y repite las comprobaciones 1 a 7 antes de fusionar.

**Garantía que se comprueba**: el agente solo puede operar sobre Google Cloud como
`mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com`, por el MCP, y no puede usar
credenciales personales (SC-010).

Rutas usadas (todas fuera del repositorio):

| Qué | Ruta |
|---|---|
| Directorio aislado del agente | `~/.config/mytasks-agent/` |
| Configuración de `gcloud` del MCP (`CLOUDSDK_CONFIG`) | `~/.config/mytasks-agent/gcloud` |
| Clave de la cuenta de servicio | `~/.config/mytasks-agent/` (permisos `0600`) |
| Registro de rechazos del hook | `~/.config/mytasks-agent/identity-guard.log` |
| Configuración personal de `gcloud` (no debe ser accesible al agente) | `~/.config/gcloud` |

Ejecuta cada comprobación y anota el resultado en la PR. **Cada una debe fallar si el diseño se
rompe**. Las marcadas *(propietario)* las ejecutas tú en tu terminal; el agente no puede leer
esas rutas.

| # | Comprobación | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Cuentas con credenciales en el almacén aislado *(propietario)* | `CLOUDSDK_CONFIG="$HOME/.config/mytasks-agent/gcloud" gcloud auth list` | Solo `mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com`. Comprobación complementaria desde el MCP: `config list` muestra esa cuenta en `core/account` |
| 2 | Forzar una cuenta personal por el MCP | Pedir al MCP un comando de solo lectura con `--account=<cuenta personal>` | Rechazado por el hook (`forbidden-flag:--account`) y anotado en el registro de rechazos. Aunque pasara, no hay credencial personal que seleccionar (comprobación 1) |
| 3 | Suplantar otra cuenta por el MCP | Pedir al MCP un comando con `--impersonate-service-account=<cuenta>` | Rechazado por el hook (`forbidden-flag:--impersonate-service-account`) |
| 4 | Leer la configuración personal de `gcloud` y las credenciales por defecto | Desde el agente: `cat ~/.config/gcloud/application_default_credentials.json` por Bash y leer el mismo fichero con la herramienta de lectura | Denegado en ambos casos (sandbox y reglas `deny` de `Read`) |
| 5 | Leer la clave del agente | Desde el agente: leer `~/.config/mytasks-agent/` por Bash y con la herramienta de lectura | Denegado en ambos casos |
| 6 | Ejecutar `gcloud`, `gsutil` o `bq` directamente | Desde el agente, por Bash: `gcloud --version` | Denegado por la regla `deny` existente |
| 7 | Servidores MCP de Google Cloud de ámbito usuario | `claude mcp list` y `claude mcp get gcloud` | Un único servidor `gcloud`, de ámbito **Project** (`.mcp.json`); ninguno de ámbito User |
| 8 | Registro de auditoría de Google Cloud tras las pruebas | Por el MCP, solo lectura: `logging read` filtrando por `protoPayload.authenticationInfo.principalEmail` en `pdlco-mytasks` y el periodo de las pruebas | Todas las operaciones del agente a nombre de `mytasks-ai-agent`; ninguna iniciada por el agente a nombre de una identidad personal. Las acciones tuyas en la consola se distinguen por horario y se anotan |
| 9 | Repetir 2 a 7, 10 y 11 tras reiniciar la sesión de Claude Code | Cerrar y abrir la sesión | Mismos resultados que antes del reinicio |
| 10 | Cargar indicadores desde un fichero por el MCP | Pedir al MCP un comando de solo lectura con `--flags-file=<fichero>` | Rechazado por el hook (`forbidden-flag:--flags-file`). El comando del hook en `.claude/settings.json` termina en `|| exit 2`, de modo que un fallo del propio hook (por ejemplo, `python3` ausente) también bloquea |
| 11 | Editar los ficheros que sostienen la contención | Desde el agente, con la herramienta de edición, intentar un cambio en `.mcp.json`, `.claude/settings.json`, `.claude/settings.local.json` y `.claude/hooks/` | Denegado en los cuatro casos. Los cambios legítimos en esos ficheros los hace el propietario (o se retira la regla `deny` de forma temporal y explícita) y obligan a repetir esta lista |

Notas:
- `gcloud auth ...` está bloqueado por el hook cuando se pide por el MCP; por eso la comprobación 1
  la ejecutas tú.
- Revisa el registro de rechazos (`identity-guard.log`) después de las comprobaciones 2 y 3: debe
  contener una entrada por intento, con fecha, herramienta y motivo, y **sin** argumentos.
- Si una comprobación no da el resultado esperado, **detén las operaciones del agente sobre Google
  Cloud**, revoca la clave (sección 3) y abre una incidencia antes de continuar.

## 2. Rotación de la clave del agente (cada 90 días)

La clave de `mytasks-ai-agent` es la única credencial de larga duración del sistema (FR-025). La
rotación es un acto del propietario con sus credenciales; el agente no la hace.

**Recordatorio**: crea un evento periódico de 90 días en tu calendario (*"Rotar clave
mytasks-ai-agent"*). Anota aquí la fecha de la última rotación: `TODO(propietario): fecha`.

1. Crea una clave nueva de la cuenta de servicio con tus credenciales (consola de IAM o `gcloud`
   desde tu terminal) y guárdala en `~/.config/mytasks-agent/` con permisos `0600`.
2. Actívala en el almacén aislado, sin suplantación:
   `CLOUDSDK_CONFIG="$HOME/.config/mytasks-agent/gcloud" gcloud auth activate-service-account --key-file=<ruta de la clave nueva>`
3. Reinicia la sesión de Claude Code y ejecuta las comprobaciones 1, 2, 3 y 7 de la sección 1.
4. Elimina la clave **anterior** en IAM y borra su fichero (`shred` o borrado seguro del sistema).
5. Comprueba en IAM que la cuenta solo tiene una clave activa.

## 3. Revocación inmediata

Cuando haya sospecha de que la clave se ha expuesto, o falle una comprobación de la sección 1:

1. En la consola de IAM (con tus credenciales), **elimina todas las claves** de
   `mytasks-ai-agent` o **deshabilita la cuenta de servicio**. Es inmediato.
2. Borra el directorio `~/.config/mytasks-agent/gcloud` y el fichero de la clave.
3. Revisa el registro de auditoría del periodo sospechoso (comprobación 8) para saber qué hizo la
   cuenta.
4. Para recuperar el servicio: crea una clave nueva y actívala como en la sección 2 (pasos 1 a 3).

Mientras la cuenta esté revocada no hay operaciones reales sobre Google Cloud: el agente se
detiene y avisa.

## 4. Permisos temporales de arranque de `mytasks-ai-agent`

Concedidos por el propietario con sus credenciales el **2026-10-01** (tarea T004) para crear el
arranque de la Fase 3: estado de Terraform, federación, identidades del pipeline y registro de
imágenes. No incluyen roles de despliegue de Cloud Run (Principio VI) ni `owner`/`editor`.
Se **retiran en la tarea T060**; solo `roles/viewer` es permanente (ver `logging.viewer` abajo).

**Estado tras MED-003 (T041b, aplicado por el propietario el 2026-10-09):** los roles temporales
llevan condición de caducidad `request.time < timestamp("2026-10-30T23:00:00Z")` (las 00:00 del
2026-10-31 en Madrid; la consola convirtió la hora local) y `projectIamAdmin` está retirado en ambos
proyectos. Renovar la caducidad es decisión explícita del propietario y se anota aquí.

| Rol | `pdlco-mytasks` (producción y plataforma) | `pdlco-mytasks-stg` (staging) | Motivo | Estado | Se retira |
|---|---|---|---|---|---|
| `roles/serviceusage.serviceUsageAdmin` | sí | sí | Habilitar APIs (T042) | con caducidad | T060 |
| `roles/iam.serviceAccountAdmin` | sí | sí | Crear cuentas `terraform-*`, `terraform-plan-*` y `deployer-*` y enlazarlas a la federación (T046, T047, T049) | con caducidad | T060 |
| `roles/resourcemanager.projectIamAdmin` | **retirado** | **retirado** | Era para roles de proyecto de esas cuentas; ahora los concede el propietario | retirado 2026-10-09 | — |
| `roles/storage.admin` | sí | no | Bucket de estado de Terraform (T043) | con caducidad | T060 |
| `roles/iam.workloadIdentityPoolAdmin` | sí | no | Pool y proveedor de federación de GitHub (T044) | con caducidad | T060 |
| `roles/artifactregistry.admin` | sí | no | Repositorio de imágenes (T048) | con caducidad | T060 |
| `roles/viewer` | sí | sí | Lectura de recursos | sin condición (rol básico) | permanente |
| `roles/logging.viewer` | sí | sí | Lectura de registros de auditoría | **con caducidad** (decisión del propietario; el agente dejará de leer registros al caducar) | permanente si se renueva |

Verificado en solo lectura el 2026-10-09 con la política IAM de cada proyecto: producción tiene los
seis roles con condición y `viewer`; staging tiene tres con condición y `viewer`; ninguno tiene
`projectIamAdmin` ni filas duplicadas sin condición.

`roles/iam.serviceAccountAdmin` incluye `iam.serviceAccounts.setIamPolicy`: sin política de
denegación, el agente podría concederse a sí mismo la suplantación de una cuenta del pipeline. Es el
riesgo residual aceptado por el propietario el 2026-10-09 (contrato `agent-bootstrap-permissions.md`
§7). Lo acotan la caducidad y la alerta, y cada cambio requiere confirmación explícita.

**Política de denegación (T041a): no probada.** Los proyectos no tienen organización y
`roles/iam.denyAdmin` puede no estar disponible. El propietario la probará más adelante; hasta
entonces no hay capa preventiva.

Al terminar el arranque, T060 retira los seis roles temporales y se anota aquí la fecha.
`TODO(T060): fecha de retirada`.

## 5. Registros de auditoría de acceso a datos (T015)

Activados el **2026-10-02** por el propietario desde la consola web (IAM y administración →
Registros de auditoría) en `pdlco-mytasks`, porque el clasificador de permisos del agente bloqueó
`projects set-iam-policy` por el MCP. Es, por tanto, una excepción a "todo por el MCP", anotada
también en la PR. Verificado en solo lectura por el MCP (`projects get-iam-policy`); los bindings
no cambiaron.

| Servicio | Nombre en la consola | Lectura de datos | Escritura de datos |
|---|---|---|---|
| `datastore.googleapis.com` | Firestore/Datastore API | sí | sí |
| `iam.googleapis.com` | Identity and Access Management (IAM) API | sí | sí |

La actividad de administración está siempre activa. T055 declara este mismo `auditConfigs` en
`infra/platform/` y T064 el del entorno de staging. Pendiente de confirmar con tráfico real
que las operaciones de Firestore aparecen como `DATA_READ` / `DATA_WRITE` (T017 no lo pudo
comprobar: el agente aún no ha leído ni escrito datos de Firestore).

## 6. Resultados de las comprobaciones de identidad (T017, T018)

Ejecutadas el **2026-10-04** en la rama `feature/002-cloud-run-cicd-fase-1`. T018 se hizo en una
sesión de Claude Code nueva, tras reiniciar.

| # | Resultado |
|---|---|
| 1 | Superada el 2026-10-02 (propietario): el almacén aislado solo tiene `mytasks-ai-agent`. Tras el reinicio, `config list` por el MCP muestra `core.account = mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com` y `project = pdlco-mytasks` |
| 2 | Superada: el hook rechazó `--account` (`forbidden-flag:--account`) |
| 3 | Superada: el hook rechazó `--impersonate-service-account` |
| 4 | Superada: lectura de `~/.config/gcloud/application_default_credentials.json` denegada por Bash y por `Read` |
| 5 | Superada: lectura de `~/.config/mytasks-agent/` denegada por Bash y por `Read` |
| 6 | Superada: `gcloud --version` denegado por la regla `deny` |
| 7 | Superada (propietario): `claude mcp list` muestra un único servidor `gcloud`; `claude mcp get gcloud` indica ámbito *Project config (shared via .mcp.json)*, `CLOUDSDK_CONFIG` aislado y variables de suplantación y credenciales vacías |
| 8 | Superada con una salvedad, ver abajo |
| 9 | Superada: 2 a 7 repetidas tras reiniciar la sesión, mismos resultados |

**Comprobación 8: registro de auditoría** (`logging read`, últimos 3 días, por el MCP):

| Fecha (UTC) | Identidad | Operación |
|---|---|---|
| 2026-10-01 19:38 | cuenta personal del propietario | `SetIamPolicy` (`cloudresourcemanager.googleapis.com`) |
| 2026-10-02 09:31 | cuenta personal del propietario | `SetIamPolicy` |
| 2026-10-02 09:47 | cuenta personal del propietario | `SetIamPolicy` |

Las tres son acciones del propietario en la consola (permisos temporales de arranque y T015). Ninguna
la inició el agente con una identidad personal. No hay entradas a nombre de `mytasks-ai-agent`
porque todas sus operaciones fueron lecturas (`config list`, `projects describe`, `logging read`),
que la actividad de administración no registra por defecto. El registro confirma, por tanto, que el
agente no usó la identidad del propietario, pero no muestra operaciones suyas; que opera como la
cuenta del agente lo demuestran las comprobaciones 1 y 7.

## 7. Resultados de MED-003 (T041b, T041c, T041d)

Ejecutados el **2026-10-09** en la rama `feature/002-cloud-run-cicd-fase-3`. T041b y T041c los aplicó el propietario en la consola; T041d la ejecutó el agente por el MCP en `pdlco-mytasks-stg` con confirmación explícita.

| # | Resultado |
|---|---|
| 10 | Superada **por lectura**: el clasificador del agente bloqueó el intento de crear una clave (credencial); `roles/iam.serviceAccountAdmin` no incluye `iam.serviceAccountKeys.create` y el agente no tiene otro rol que la dé |
| 11 | **No ejecutada**: sin política de denegación la concesión de `serviceAccountTokenCreator` y su uso funcionarían (escalada real). Pendiente de T041a |
| 12 | Superada **por lectura**: el clasificador bloqueó el intento de concesión; la política de IAM de ambos proyectos no incluye `projectIamAdmin` para el agente |
| 13 | Superada en staging: la creación y el borrado de la cuenta de prueba `tmp-med003-test` provocaron el aviso por correo al propietario. **No probada en producción** (no se operó allí) |
| 14 | Superada: roles temporales con condición de caducidad, sin duplicados sin condición y sin `projectIamAdmin` en ambos proyectos |

La cuenta de prueba `tmp-med003-test` se creó y se borró en la misma sesión. Los intentos denegados por el clasificador no llegaron a Google Cloud, así que no generaron entradas de código 7 en el registro: la parte «intento denegado» de la alerta (`status.code=7`) queda sin probar.

## 8. Cambios del arranque de la Fase 3 (T042 en adelante)

### T042: APIs habilitadas (2026-10-09)

Habilitadas por el propietario desde la consola, no por el MCP: es una excepción a «todo por el MCP», anotada también en la PR. Verificado en solo lectura por el MCP (`services list --enabled`).

| Proyecto | API | Motivo | Adopción en Terraform |
|---|---|---|---|
| `pdlco-mytasks` | `sts.googleapis.com` | Intercambio de tokens de la federación de GitHub (T044) | T051 |
| `pdlco-mytasks-stg` | `run.googleapis.com` | Que exista el agente de servicio de Cloud Run de staging antes de darle lectura del repositorio de imágenes (T048); si no aparece, se resuelve en T048 | T064 |

### T043: bucket de estado de Terraform (2026-10-09)

Creado por el MCP, con confirmación del propietario, en `pdlco-mytasks`. Verificado con `buckets describe`. Se adopta en `infra/platform/` en T051 con `prevent_destroy` (T054).

| Parámetro | Valor |
|---|---|
| Nombre | `pdlco-mytasks-tfstate` |
| Región | `europe-southwest1` |
| Versionado | activado |
| Acceso uniforme | activado |
| Prevención de acceso público | `enforced` |
| Clase | Standard (por defecto; no aparece en la salida de `describe`) |

### T044: pool y proveedor de federación de GitHub (2026-10-09)

Creados por el MCP, con confirmación del propietario, en `pdlco-mytasks`. Verificado con `providers describe` (estado `ACTIVE`). Se adoptan en `infra/platform/` en T051 con `prevent_destroy` (T054). Los nombres no se pueden reutilizar durante 30 días tras borrarlos.

| Parámetro | Valor |
|---|---|
| Pool | `github` (global), nombre visible `GitHub-Actions` |
| Proveedor | `github-actions`, estado `ACTIVE` |
| Recurso | `projects/2195266360/locations/global/workloadIdentityPools/github/providers/github-actions` |
| Emisor | `https://token.actions.githubusercontent.com` |
| Mapeo | `google.subject=assertion.sub`, `attribute.repository_id`, `attribute.repository_owner_id` |
| Condición | `assertion.repository_owner_id=='210847116'&&assertion.repository_id=='1370451186'` (ids numéricos de `pcodlcruz` y `pcodlcruz/my-tasks`; sin comodines) |

Pasos del propietario en GitHub (*Settings → Actions → General*), porque el repositorio es público: exigir aprobación para los workflows de todos los colaboradores externos y no enviar secretos ni tokens de escritura a workflows de forks. Activar 2FA en la cuenta. `TODO(propietario): confirmar que están aplicados`.

### T046: cuentas `terraform-*` y vinculaciones (2026-10-09, parte del agente)

Creadas por el MCP, con confirmación del propietario. Sin claves y **sin ningún rol de proyecto todavía**: los concede el propietario (el agente ya no tiene `projectIamAdmin`). La tarea T046 sigue abierta hasta que el propietario los conceda y se verifique.

| Cuenta | Proyecto | Puede usarla (`roles/iam.workloadIdentityUser`) |
|---|---|---|
| `terraform-production@pdlco-mytasks.iam.gserviceaccount.com` | `pdlco-mytasks` | `principal://iam.googleapis.com/projects/2195266360/locations/global/workloadIdentityPools/github/subject/repo:pcodlcruz@210847116/my-tasks@1370451186:environment:infra-production` |
| `terraform-staging@pdlco-mytasks-stg.iam.gserviceaccount.com` | `pdlco-mytasks-stg` | `principal://iam.googleapis.com/projects/2195266360/locations/global/workloadIdentityPools/github/subject/repo:pcodlcruz@210847116/my-tasks@1370451186:environment:infra-staging` |

Acceso al bucket `pdlco-mytasks-tfstate` (`roles/storage.objectAdmin`, con condición por prefijo del nombre del objeto y del prefijo de listado):

| Cuenta | Prefijos |
|---|---|
| `terraform-staging` | `staging/` |
| `terraform-production` | `production/` y `platform/` |

Pendiente de comprobar con una ejecución real (T058/T059) que `terraform init` y el bloqueo del estado funcionan con estas condiciones, incluido el listado.

Hallazgo para la revisión de seguridad: el bucket conserva los enlaces heredados por defecto (`projectEditor`, `projectOwner` y `projectViewer` de `pdlco-mytasks` con `legacyBucketOwner`, `legacyObjectOwner` y lectura). Cualquier cuenta con rol Editor en producción (por ejemplo la cuenta de Compute por defecto) puede leer y escribir el estado fuera de los prefijos de `terraform-*`. Valorar retirarlos.

### Revisión de seguridad de T046: HIGH-002 resuelto (2026-10-09)

El propietario retiró `roles/iam.serviceAccountTokenCreator` a nivel de proyecto de `firebase-adminsdk-fbsvc@pdlco-mytasks.iam.gserviceaccount.com` en `pdlco-mytasks`: permitía suplantar cualquier cuenta del proyecto, incluida `terraform-production`. Antes se comprobó que nada la usa. Verificado por el MCP en solo lectura; la cuenta conserva `firebase.sdkAdminServiceAgent` y `firebaseauth.admin`. No regenerar claves de Admin SDK sin avisar (Firebase puede volver a concederlo). Pendientes del informe `security-review-t046.md`: HIGH-001, MED-001, MED-002, MED-003.

### Restricción: el repositorio debe seguir siendo público (2026-10-09)

La cuenta de GitHub es del plan **Free**. En Free, los *environments* con revisores obligatorios y los *rulesets* (protección de `main`, `develop`, `release/*` y `hotfix/*`) solo están disponibles en repositorios **públicos** ([environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)). Hacer el repositorio privado desactivaría la aprobación del propietario (FR-020) y la protección de ramas (Principio VII). Pasarlo a privado exige antes contratar un plan Pro o superior. Comprobado el 2026-10-09: público, cuatro *rulesets* activos, revisor `pcodlcruz` en los *environments*.

### Alerta de Terraform sobre cuentas de servicio (2026-10-09)

Creada por el propietario en consola en ambos proyectos y verificada en solo lectura por el MCP (`monitoring policies list`): `Terraform: cambio de IAM en una cuenta de servicio`, activa, con el canal de correo del propietario. Consulta: registros de actividad de administración de `iam.googleapis.com`, `principalEmail` que contiene `terraform-` y método que contiene `setiampolicy`. Los nombres de método se confirman con el primer `apply` real. El agente no tiene permisos de escritura de Monitoring y no se le conceden (contrato `agent-bootstrap-permissions.md` §4.3).

### MED-002 resuelto y MED-003 reclasificado (2026-10-09)

El propietario retiró `roles/editor` de las cuentas de Compute por defecto de ambos proyectos (verificado en solo lectura: sin concesiones). Los enlaces heredados del bucket de estado no se tocan: no restringen nada, porque los roles básicos de proyecto ya incluyen permisos de Cloud Storage (informe `security-review-t046.md`, MED-003). Pendiente del informe: MED-001 (roles personalizados de Firestore e Identity Platform).

### T046 completada: roles de proyecto de `terraform-*` (2026-10-09)

Concedidos por el propietario en la consola según la lista de `security-review-t046.md` y verificados en solo lectura por el MCP. Sin `owner`, `editor` ni roles adicionales. Los roles personalizados de Firestore e Identity Platform (MED-001) se añaden en la Fase 4, cuando un `terraform plan` real fije sus permisos mínimos.

| Rol | `terraform-production` | `terraform-staging` |
|---|---|---|
| `roles/serviceusage.serviceUsageAdmin` | sí | sí |
| `roles/run.admin` | sí | sí |
| `roles/iam.serviceAccountAdmin` | sí | sí |
| `roles/resourcemanager.projectIamAdmin` con condición `modifiedGrantsByRole.hasOnly(['roles/datastore.user'])` | sí | sí |
| `roles/iam.workloadIdentityPoolAdmin` | sí | no |
| `roles/artifactregistry.admin` | sí | no |

### T047: cuentas `terraform-plan-*` (2026-10-09)

Creadas por el MCP, con confirmación del propietario. Sin claves y **sin ningún rol de proyecto** (opción C elegida por el propietario): quedan inertes hasta que la Fase 4 fije el rol de lectura mínimo. Verificado en solo lectura.

| Cuenta | Proyecto | Puede usarla (`roles/iam.workloadIdentityUser`) | Lectura del estado (`roles/storage.objectViewer`, condición por prefijo) |
|---|---|---|---|
| `terraform-plan-production@pdlco-mytasks.iam.gserviceaccount.com` | `pdlco-mytasks` | `principal://iam.googleapis.com/projects/2195266360/locations/global/workloadIdentityPools/github/subject/repo:pcodlcruz@210847116/my-tasks@1370451186:pull_request` | `production/` y `platform/` |
| `terraform-plan-staging@pdlco-mytasks-stg.iam.gserviceaccount.com` | `pdlco-mytasks-stg` | el mismo sujeto `…:pull_request` | `staging/` |

El `plan` de estas cuentas debe ejecutarse con `-lock=false`: el bloqueo del estado exige crear un objeto y no tienen escritura. Pendiente de la Fase 4: elegir el rol de lectura del proyecto (rol personalizado de metadatos o `roles/viewer` si se comprueba que no expone documentos de Firestore).

### T048: repositorio de Artifact Registry (2026-10-09)

Creado por el MCP, con confirmación del propietario, en `pdlco-mytasks`. Verificado con `repositories describe`. Se adopta en `infra/platform/` en T052 con `prevent_destroy` (T054).

| Parámetro | Valor |
|---|---|
| Repositorio | `projects/pdlco-mytasks/locations/europe-southwest1/repositories/mytasks` |
| Formato / modo | Docker, `STANDARD_REPOSITORY` |
| Etiquetas | inmutables (`immutableTags: true`) |
| Cifrado | clave gestionada por Google |
| Lectura (`roles/artifactregistry.reader`, a nivel de repositorio) | `service-838389521553@serverless-robot-prod.iam.gserviceaccount.com`, agente de servicio de Cloud Run del proyecto de staging (número 838389521553) |

La escritura para `deployer-staging` y la lectura para `deployer-production` se conceden en T049.

### T049: cuentas `deployer-*` (2026-10-09)

Creadas por el MCP, con confirmación del propietario. Sin claves y **sin ningún rol de proyecto** (verificado en solo lectura en ambos proyectos). Los permisos sobre los servicios de Cloud Run y las cuentas de ejecución se conceden en la Fase 4 (T064/T065), cuando esos recursos existen. Se adoptan en `infra/platform/` en T053.

| Cuenta | Proyecto | Puede usarla (`roles/iam.workloadIdentityUser`) | Sobre el repositorio `mytasks` |
|---|---|---|---|
| `deployer-staging@pdlco-mytasks-stg.iam.gserviceaccount.com` | `pdlco-mytasks-stg` | `principal://iam.googleapis.com/projects/2195266360/locations/global/workloadIdentityPools/github/subject/repo:pcodlcruz@210847116/my-tasks@1370451186:environment:staging` | `roles/artifactregistry.writer` |
| `deployer-production@pdlco-mytasks.iam.gserviceaccount.com` | `pdlco-mytasks` | el mismo sujeto con `…:environment:production` | `roles/artifactregistry.reader` |

Política final del repositorio `mytasks`: lectura para `deployer-production` y para el agente de Cloud Run de staging; escritura solo para `deployer-staging`.

Riesgo aceptado: `deployer-staging`, una cuenta de staging, escribe en un repositorio del proyecto de producción. Limitado al repositorio concreto y al *environment* `staging`, restringido a `develop`, `release/*` y `hotfix/*`.
