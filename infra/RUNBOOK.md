# Runbook de operación

Procedimientos operativos de la infraestructura y del acceso del agente a Google Cloud (feature
`002-cloud-run-cicd`). **Si llegas sin contexto, empieza por la [sección 11](#11-guía-operativa-t088-fr-021)**
(entornos y URL, flujo de despliegue, recuperación de fallos, retirada de un entorno); las
secciones 1 a 10 son el detalle y el historial de cada decisión.

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
mytasks-ai-agent"*). Última rotación (creación de la clave
vigente): **2026-09-30**. Próxima rotación: **2026-12-29**.

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

Pasos del propietario en GitHub (*Settings → Actions → General*), porque el repositorio es público: exigir aprobación para los workflows de todos los colaboradores externos y no enviar secretos ni tokens de escritura a workflows de forks. Activar 2FA en la cuenta. Ajustes de Actions confirmados el 2026-10-14 (ver «Confirmación de los ajustes de GitHub» abajo). `TODO(propietario): confirmar 2FA`.

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

### T051: adopción en `infra/platform/` (2026-10-10)

Declarados con bloques `import` (sin recrear): el pool `github`, el proveedor `github-actions`, `terraform-production`, `terraform-plan-production` y sus dos vinculaciones `workloadIdentityUser`. Las cuentas de staging **no** se declaran aquí: viven en `pdlco-mytasks-stg` y `terraform-production` no tiene acceso a ese proyecto; se adoptan en el root de staging (Fase 4). Los roles de proyecto y el acceso al bucket de estado no los gestiona Terraform. Validado con `terraform validate`; la ausencia de diferencias en el `plan` se confirmará con `infra.yml`.

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

### T052 y T053: adopción en `infra/platform/` (2026-10-10)

Declarados con bloques `import`: el repositorio `mytasks` (etiquetas inmutables), la lectura del agente de Cloud Run de staging, `deployer-production` con su vinculación de federación y su lectura del repositorio, y la escritura de `deployer-staging` sobre el repositorio. La cuenta `deployer-staging` vive en `pdlco-mytasks-stg` y se adopta en el root de staging (Fase 4). Los permisos del repositorio son `iam_member` (no autoritativos). Validado con `terraform validate`; la ausencia de diferencias en el `plan` se confirmará con `infra.yml`.

### T054 y T055: protección y auditoría en `infra/platform/` (2026-10-10)

`prevent_destroy` en el bucket de estado `pdlco-mytasks-tfstate` (declarado ahora, con `import`, `force_destroy = false` y los valores de `describe`), en el repositorio `mytasks`, en el pool `github` y en el proveedor `github-actions`. Los registros de auditoría de acceso a datos de `datastore.googleapis.com` e `iam.googleapis.com` (T015) se adoptan con `google_project_iam_audit_config`, uno por servicio. Validado con `terraform validate`; la ausencia de diferencias en el `plan` se confirmará con `infra.yml`.

Limitación: `terraform-production` solo puede conceder `roles/datastore.user` a nivel de proyecto (condición de su `projectIamAdmin`). Mientras el `plan` no muestre cambios en la auditoría no escribe nada; si hay que cambiarla, el `apply` fallará y lo hace el propietario.

### T049: cuentas `deployer-*` (2026-10-09)

Creadas por el MCP, con confirmación del propietario. Sin claves y **sin ningún rol de proyecto** (verificado en solo lectura en ambos proyectos). Los permisos sobre los servicios de Cloud Run y las cuentas de ejecución se conceden en la Fase 4 (T064/T065), cuando esos recursos existen. Se adoptan en `infra/platform/` en T053.

| Cuenta | Proyecto | Puede usarla (`roles/iam.workloadIdentityUser`) | Sobre el repositorio `mytasks` |
|---|---|---|---|
| `deployer-staging@pdlco-mytasks-stg.iam.gserviceaccount.com` | `pdlco-mytasks-stg` | `principal://iam.googleapis.com/projects/2195266360/locations/global/workloadIdentityPools/github/subject/repo:pcodlcruz@210847116/my-tasks@1370451186:environment:staging` | `roles/artifactregistry.writer` |
| `deployer-production@pdlco-mytasks.iam.gserviceaccount.com` | `pdlco-mytasks` | el mismo sujeto con `…:environment:production` | `roles/artifactregistry.reader` |

Política final del repositorio `mytasks`: lectura para `deployer-production` y para el agente de Cloud Run de staging; escritura solo para `deployer-staging`.

Riesgo aceptado: `deployer-staging`, una cuenta de staging, escribe en un repositorio del proyecto de producción. Limitado al repositorio concreto y al *environment* `staging`, restringido a `develop`, `release/*` y `hotfix/*`.

### Confirmación de los ajustes de GitHub (2026-10-14)

Revisados por el propietario en la web de GitHub, a petición de `security-review-fase-3.md` (MED-002, punto 1). El agente no puede leerlos: lo anotado es lo que el propietario comunicó.

| Ajuste | Dónde | Resultado |
|---|---|---|
| Aprobación de workflows de colaboradores externos | *Settings → Actions → General* | Revisado y conforme (aprobación para todos los colaboradores externos) |
| Tokens de escritura y secretos hacia workflows de forks | *Settings → Actions → General* | La interfaz **no muestra** las casillas; se da por bueno el comportamiento por defecto de GitHub (los forks reciben token de solo lectura y sin secretos). No verificado con una PR de prueba desde un fork |
| Permisos por defecto del token y aprobación de PR por workflows | *Settings → Actions → General* | Revisado y conforme |
| *Environments* `infra-production` e `infra-staging` (revisor, sin bypass de administradores, ramas `main` y `develop`) | *Settings → Environments* | Revisado y conforme |

Pendiente: 2FA de la cuenta (`TODO(propietario)`), y la prueba práctica con una PR desde un fork (opcional) que dejaría constancia de que el workflow queda en «Waiting for approval». Comprobar de nuevo estos ajustes si cambia el plan de GitHub o se hace el repositorio privado.

## 9. Fase 4: staging y despliegue automático

### Qué declara el código (T062–T067)

`infra/modules/environment/` crea, por entorno: las APIs; la base `(default)` de Firestore nativo en `europe-southwest1` con protección contra borrado; el TTL de `tasks.purge_at`; los tres índices compuestos, leídos de `firestore.indexes.json` (no hay copia que pueda desviarse); la configuración de Identity Platform con los dominios autorizados; una clave de API web restringida; las cuentas `mytasks-api-run-<env>` (`roles/datastore.user`) y `mytasks-web-run-<env>` (sin roles); y los servicios `mytasks-api` y `mytasks-web`. `infra/envs/staging/` lo instancia (máximo 2 instancias, mínimo 0) y adopta por `import` `terraform-staging`, `terraform-plan-staging`, `deployer-staging` y sus vinculaciones de federación.

Decisiones que conviene conocer:

| Decisión | Motivo |
|---|---|
| Dominios autorizados: el dominio de autenticación del proyecto (`<proyecto>.firebaseapp.com`), `<proyecto>.web.app` y la URL de `mytasks-web`; **sin `localhost`** | El desarrollo local usa emuladores, nunca un proyecto desplegado. La documentación confirma que `<proyecto>.firebaseapp.com` sirve `/__/auth/handler` sin Firebase Hosting |
| Clave de API web gestionada por Terraform, limitada a `identitytoolkit` y `securetoken` y a los orígenes del entorno | La especificación no decía de dónde sale `FIREBASE_API_KEY`. La clave es pública por diseño (va en `/config.js`); la restricción es lo que impide usarla desde otro sitio |
| Los servicios ignoran imagen, tráfico, **todo el bloque `env`**, etiquetas y cliente | Los gestiona el pipeline; un `apply` posterior no revierte un despliegue. `env` es un conjunto de bloques y Terraform no deja ignorar un solo elemento (`APP_VERSION`) por índice: el primer CI lo rechazó. Consecuencia: Terraform fija las variables al crear el servicio y ya no corrige su deriva |
| `deploy.yml` comprueba el **valor** de las variables fijas (entorno, proyecto, CORS, URL de la API, dominio de autenticación, emuladores), no solo que existan | Compensa lo anterior y es lo que impide que un entorno corra con la configuración de otro (FR-014). Probado con un `gcloud` falso en `.github/scripts/tests/test_deploy_variable_check.py` |
| La auditoría de datos se declara con `manage_data_access_audit` (staging `true`, producción `false`) | En producción ya la gestiona `infra/platform/`; dos recursos sobre el mismo servicio se pisarían |
| Raíces en `infra/envs/<entorno>/` | Es lo que dicen el plan y las tareas; `infra.yml` se ajustó (el prefijo de estado sigue siendo `staging`) |

### Roles personalizados (MED-001 de `security-review-t046.md`)

Definidos en `infra/iam/roles/` y concedidos por el propietario según [guia-propietario-med-001.md](../specs/002-cloud-run-cicd/guia-propietario-med-001.md): `mytasksEnvironmentAdmin` a `terraform-staging`, `mytasksPlanReader` a `terraform-plan-staging` (y, en la Fase 5, los equivalentes de producción más `mytasksPlatformPlanReader`). **Desde el 2026-10-16 (T081) `terraform-production` también recibe `mytasksPlanReader` y `mytasksPlatformPlanReader`** (solo lectura): su `apply` planifica `platform` y sin las lecturas del bucket de estado y de la política del proyecto el plan fallaba ([guía](../specs/002-cloud-run-cicd/guia-propietario-t081-platform.md), [revisión](../specs/002-cloud-run-cicd/security-review-t081.md)). `roles/viewer` se descartó: incluye `datastore.entities.get` y `firebaseauth.users.get` (comprobado en la documentación de IAM), es decir, leería documentos y cuentas de usuario desde un `plan` que corre en PR de un repositorio público.

`TODO(propietario)`: crear y conceder los roles en `pdlco-mytasks-stg` antes del primer `apply`. Estado: **sin aplicar**.

Riesgos abiertos:

- La lista de permisos no sale de un `plan` real (el sandbox del agente no ejecuta el proveedor). Si el primer `plan` o `apply` falla por un permiso, se añade a la definición y se actualiza el rol; no se amplía ningún rol predefinido.
- Auditoría de acceso a datos en staging: `terraform-staging` solo puede conceder `roles/datastore.user` a nivel de proyecto. Si el `apply` no puede escribir la configuración de auditoría, la activa el propietario en la consola (como en §5) y se importa.
- `FIREBASE_AUTH_DOMAIN` usa el dominio por defecto del proyecto. Se confirma de verdad en el primer inicio de sesión (T075); staging ya es un proyecto Firebase desde el 2026-10-14, así que el dominio `<proyecto>.firebaseapp.com` debería existir.
- Identity Platform no se puede inicializar con `terraform-staging` (ver el paso previo de abajo).

### Paso previo al primer `apply` de un entorno nuevo: habilitar Identity Platform (propietario)

Descubierto el 2026-10-14 en el primer `apply` de staging: todo se creó salvo `google_identity_platform_config`, que falló con `403 INSUFFICIENT_PERMISSION`. Los registros de auditoría mostraron la causa: `InitializeIdentityPlatform` se concede con `firebaseauth.configs.create`, pero en un proyecto que **aún no es un proyecto Firebase** dispara por dentro `AddFirebase`, que exige `firebase.projects.update`. Ningún rol de Identity Platform lo incluye y la documentación del recurso no lo menciona.

Decisión del propietario (2026-10-14): **no ampliar `mytasksEnvironmentAdmin`** con `firebase.projects.update`; Identity Platform se habilita a mano una vez por entorno nuevo.

1. En la consola de Google Cloud del proyecto del entorno, *Identity Platform → Habilitar*, con una cuenta de propietario. Esto convierte el proyecto en un proyecto Firebase, como ya es producción.
2. Comprobarlo en solo lectura: `firebase.googleapis.com` entre las APIs habilitadas y la entrada `EnableIdentityPlatform` en los registros de auditoría de `identitytoolkit.googleapis.com`.
3. Que la raíz del entorno **adopte** la configuración con un bloque `import` (`projects/<proyecto>/config`), como hace `infra/envs/staging/main.tf`. Sin él, el `apply` falla con `400 INVALID_PROJECT_ID: Identity Platform has already been enabled for this project`: el proveedor intenta crear una configuración que ya existe. Con el `import` solo la lee y la actualiza.
4. Lanzar `infra` (*Actions → infra → Run workflow*, rama `develop`, o fusionando el cambio), leer `plan-staging` y aprobar el `apply`.

Hecho en staging el 2026-10-14 (14:57 UTC); el 400 de arriba se vio en el segundo intento y se resolvió con el `import`. Producción ya tiene Identity Platform habilitado, así que **su raíz (Fase 5, T077) necesita el mismo `import`**. Para recrear un entorno desde cero (SC-007) este paso va **antes** del primer `apply`.

### T068: proveedor de Google en Identity Platform de staging (propietario)

Es un paso manual único por entorno (research R8): necesita un secreto de OAuth que no debe pasar por Terraform ni por el repositorio. Se hace **después** del `apply` de staging (T075), porque necesita la URL de `mytasks-web`.

1. En `pdlco-mytasks-stg`, *APIs y servicios → Pantalla de consentimiento de OAuth*: configurarla si no existe (tipo y datos de contacto a tu criterio).
2. *Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web*, con estos valores:
   - Orígenes de JavaScript autorizados: `https://mytasks-web-838389521553.europe-southwest1.run.app` y `https://pdlco-mytasks-stg.firebaseapp.com`.
   - URI de redirección autorizados: `https://pdlco-mytasks-stg.firebaseapp.com/__/auth/handler`.
3. *Identity Platform → Proveedores → Añadir proveedor → Google*: pegar el ID y el secreto del cliente. El secreto no se guarda en ningún fichero del repositorio.
4. Anotar aquí la fecha y que el inicio de sesión de staging funciona.

**Hecho el 2026-10-14 (17:08 UTC) por la vía más simple, que es la recomendada:** como el proyecto ya es un proyecto Firebase (se habilitó Identity Platform), el propietario activó el proveedor desde la consola de Firebase: <https://console.firebase.google.com/> → proyecto `pdlco-mytasks-stg` → *Authentication → Sign-in method → Google → Habilitar*. Firebase crea y conecta el cliente OAuth y su URI de redirección solo, así que **no hay que crear credenciales ni guardar ningún secreto**; los pasos 1 a 3 de arriba quedan como alternativa si esa consola no estuviera disponible. Los dominios autorizados los sigue gestionando Terraform.

Antes de habilitarlo, el login mostraba «No se pudo iniciar sesión» en la aplicación. Cómo se diagnosticó sin acceso al navegador, por si vuelve a ocurrir:

| Pregunta | Cómo se comprueba |
|---|---|
| ¿Están bien la clave y los dominios autorizados? | `GET https://identitytoolkit.googleapis.com/v1/projects?key=<clave de /config.js>` con la cabecera `Referer` de la web: `200` con `authorizedDomains` |
| ¿Existen las páginas del popup? | `https://<proyecto>.firebaseapp.com/__/auth/handler` y `/__/auth/iframe` devuelven `200` |
| ¿Está habilitado el proveedor? | `POST …/v1/accounts:createAuthUri?key=<clave>` con `{"providerId":"google.com","continueUri":"https://<proyecto>.firebaseapp.com/__/auth/handler"}`: sin proveedor, `OPERATION_NOT_ALLOWED : The identity provider configuration is not found.`; con él, una `authUri` de `accounts.google.com`. No crea ninguna cuenta |
| ¿Quién lo configuró y cuándo? | Registros de auditoría de `identitytoolkit.googleapis.com`: `CreateDefaultSupportedIdpConfig` |

Comprobación de extremo a extremo (registros de petición de Cloud Run, sin leer datos de tareas): tras el login, `OPTIONS` y `GET /api/v1/tasks` con `200` (el token se verifica y CORS funciona), `POST /api/v1/tasks` con `201` (crear) y `POST …/complete` con `200`.

**Pendiente de comprobar por el propietario (la cuenta del agente no puede):** que la auditoría de acceso a datos de Firestore (§5) registra esas lecturas y escrituras. Los registros de acceso a datos son privados y requieren `roles/logging.privateLogViewer`, que `mytasks-ai-agent` no tiene y no se le concede (incluyen rutas de documentos con identificadores de usuario). En el *Logs Explorer* de `pdlco-mytasks-stg`: `logName="projects/pdlco-mytasks-stg/logs/cloudaudit.googleapis.com%2Fdata_access"`, esperando entradas de `firestore.googleapis.com` con `google.firestore.v1.Firestore.Commit` (la configuración usa `datastore.googleapis.com`, que según la documentación cubre también a `firestore.googleapis.com`).

### Plan visible antes de aprobar (corrección de T057)

El primer diseño de `infra.yml` calculaba el plan dentro del job aprobado, de modo que el propietario aprobaba sin poder leerlo (incumplía FR-020). Ahora cada `apply` va precedido de un job `plan-<entorno>` sin aprobación que publica el plan completo, y `apply-<entorno>` se niega a aplicar si su plan tiene otra huella (contrato `pipeline.md`). Para ver el plan: *Actions → el run de `infra` → job `plan-staging` o `plan-production` → Summary*; después, aprobar el `apply`.

La identidad de solo lectura necesita una vinculación nueva, porque el job de plan no tiene *environment* y su sujeto de federación es la rama. Se creó **una vez por el MCP el 2026-10-14**, con confirmación explícita del propietario (arranque, como las de la Fase 3), y el código la adopta con `import`:

| Cuenta | Sujeto (`roles/iam.workloadIdentityUser`) |
|---|---|
| `terraform-plan-staging@pdlco-mytasks-stg.iam.gserviceaccount.com` | `principal://iam.googleapis.com/projects/2195266360/locations/global/workloadIdentityPools/github/subject/repo:pcodlcruz@210847116/my-tasks@1370451186:ref:refs/heads/develop` |
| `terraform-plan-production@pdlco-mytasks.iam.gserviceaccount.com` | el mismo sujeto con `…:ref:refs/heads/main` |

Es de solo lectura: cualquier workflow que corra en `develop` o `main` (ramas protegidas) puede suplantarla, y solo puede leer metadatos. El `import` exige que la vinculación exista, así que se crea **antes** de fusionar la PR que la declara; sin ella, el job `plan-*` no puede autenticarse y el `apply` no llega a pedir aprobación.

### Primer despliegue de staging (T075, 2026-10-14)

Resultado verificado en solo lectura (MCP y peticiones a las URL públicas), run `38591380788`:

| Comprobación | Resultado |
|---|---|
| Tráfico | `mytasks-api-00004-qip` y `mytasks-web-00004-bav`, 100 % cada uno; ninguna etiqueta de revisión sobrante |
| Imágenes | por *digest* desde el repositorio `mytasks` (`mytasks-api@sha256:a043eebf…`, `mytasks-web@sha256:72080611…`) |
| Etiquetas de la revisión | `commit`, `tree-hash` y `pipeline-run` presentes |
| `APP_VERSION` | el hash de árbol de cada componente (API `e1a58419…`, web `0548e191…`) |
| `GET /health` | `200` con `{"status":"ok","version":"e1a58419…"}`, igual que la etiqueta de la revisión |
| `GET /readyz` | `200` (la identidad de ejecución llega a Firestore) |
| `GET /api/v1/tasks` sin token | `401` |
| `GET /config.js` | apunta a la API de staging; `USE_EMULATORS` en `false` |
| Etiquetas `validated-<hash>` | presentes en las dos imágenes, con el mismo *digest* que la desplegada |

**Duración**: 5 min 30 s en total (15:40:25 a 15:45:55 UTC): 1 min 28 s de CI, unos 1 min 50 s esperando la aprobación del *environment* `staging` y 2 min 11 s del job `deploy`. Sin la espera, unos 3 min 40 s. Es una medida; SC-001 (percentil 95 de < 15 min) se evalúa con las primeras 20 ejecuciones.

**Paso 4 del escenario 3 del quickstart** (iniciar sesión con Google en staging y crear una tarea): hecho tras T068, ver la sección de arriba.

Lo que costó llegar aquí (para quien monte el siguiente entorno):

1. El primer `deploy-staging` falla de forma esperada si los servicios aún no existen: el paso «Check the service variables» lo dice y nombra el servicio. Orden: `apply` de `infra-staging`, y después `deploy-staging`.
2. **Un run de `deploy-staging` en «waiting» bloquea a los siguientes** (el grupo de concurrencia no cancela el que está en curso): los nuevos quedan en «pending». Hay que aprobar o cancelar el run viejo en cuanto aparezca; un run de un commit anterior no debe aprobarse.
3. **`/healthz` no sirve en `run.app`**: el frontal de Google lo intercepta y responde su propio 404. La versión y el humo usan `/health` (research R6).
4. **La URL de los servicios es la determinista** (`mytasks-<servicio>-<número de proyecto>.<región>.run.app`), no el `status.url` de Cloud Run (`…-<hash>-no.a.run.app`): CORS, `API_BASE_URL` y los dominios autorizados de Identity Platform solo reconocen la primera.
5. Con el *environment* `staging` con revisor obligatorio, cada fusión en `develop` pide aprobación, también las que no cambian ni el backend ni el frontend.

## 10. Fase 5: producción y promoción

### Estado de producción antes de la fase (leído en solo lectura el 2026-10-14)

Producción comparte proyecto con la plataforma y no estaba vacía, pero lo que ya existía no choca con el módulo:

| Recurso | Estado | Consecuencia |
|---|---|---|
| Base de Firestore, índices y TTL | no existen | los crea el módulo |
| Servicios de Cloud Run y cuentas de ejecución | no existen | los crea el módulo |
| Identity Platform | existe desde el 2025-12-03, con seis `UpdateConfig` del propietario | la raíz lo **adopta con `import`**; el plan mostrará qué cambia en los dominios autorizados |
| Proveedor Google de Identity Platform | existe (creado por Firebase el 2025-12-03) | T078 está hecha en la práctica; falta confirmar con un inicio de sesión real tras el primer despliegue |
| Agente de servicio de Cloud Run | existe, con `roles/run.serviceAgent` | lee el repositorio de imágenes (mismo proyecto) sin concesión extra |
| Auditoría de acceso a datos | la declara `infra/platform/` | `manage_data_access_audit = false` en esta raíz, para no declararla dos veces |

### Qué declara el código (T077, T079)

- `infra/envs/production/` instancia el mismo módulo que staging con otro dimensionado (máximo 5 instancias, mínimo 0) y otros identificadores. No declara las cuentas del pipeline: son de `infra/platform/` y la raíz solo las nombra por correo.
- `.github/scripts/tests/test_env_roots_parity.py` (job `scripts-tests`) compara las dos raíces y falla si difieren en algo que no sea dimensionado e identificadores. Comprobado que detecta una desviación.
- `.github/workflows/deploy-production.yml` se lanza en cada push a `main`, usa el *environment* `production` y `deployer-production`, y llama al mismo `deploy.yml`. Producción **no construye**: promueve el *digest* de `validated-<hash>` de ambos componentes y, si falta uno, falla antes de tocar nada nombrando el componente y el hash.
- **Procedencia de la imagen (MED-001 de la fase 4).** Staging publica cada imagen con las etiquetas `io.mytasks.component`, `io.mytasks.tree-hash`, `io.mytasks.built-by=deploy.yml`, `io.mytasks.pipeline-run` y `org.opencontainers.image.revision` (el *commit*): se construye con la etiqueta temporal `build-<hash>-<run>-<intento>` y `.github/scripts/image-provenance.sh stamp` la republica como `<hash>`. El paso «Check the provenance» de `deploy.yml` lee las etiquetas **por *digest*** (lo mismo que se despliega y se valida) antes de crear revisiones, en staging y en producción; si falta alguna o no coincide con el componente y el hash, el despliegue falla sin tocar nada. Las etiquetas son inmutables, así que una imagen `<hash>` sin etiquetas no se arregla: cualquier cambio bajo `backend/` o `frontend/` da otro hash y se reconstruye. Las `build-*` no se limpian (no llevan `validated-` y producción nunca las usa); una política de limpieza del repositorio queda en el backlog. **Límite:** quien ya pueda escribir en el registro (`deployer-staging`) puede poner cualquier etiqueta; esto frena errores y etiquetas creadas a mano, no a esa identidad. Lo cubriría una atestación firmada verificada al desplegar (opción C, backlog).

### Recuperación de datos de Firestore (LOW-003 de la fase 4, decisión de 2026-10-14)

- **Producción** habilita la recuperación a un punto en el tiempo (`firestore_point_in_time_recovery = true`): conserva 7 días de versiones y permite restaurar la base a cualquier instante de esa ventana si un fallo de la aplicación o un token comprometido borra datos de forma definitiva. Se crea ya habilitada con el primer `apply`.
- **Staging** la deja desactivada (solo datos de prueba). Es la única diferencia del módulo entre entornos además del dimensionado, y el test de paridad la lista como permitida.
- **No hay copias programadas.** Las especificaciones no exigen copias de seguridad y la ventana de 7 días cubre el riesgo identificado. Si se quiere retención mayor, la opción es una programación de copias (`google_firestore_backup_schedule`), que habría que diseñar con `mytasks-google-cloud-architect`.
- La restauración es una operación manual del propietario (exportar o clonar desde un instante con el MCP/consola); no hay procedimiento probado todavía.

### Antes del primer `apply` de producción (propietario)

Crear y conceder los roles personalizados en `pdlco-mytasks` (`specs/002-cloud-run-cicd/guia-propietario-med-001.md`, sección de producción). Sin ellos, `terraform-production` no puede crear Firestore ni la clave de API, y la vista previa de `platform` sigue saliendo como aviso.

### Primer despliegue de producción (T081)

1. Crear la release (`develop` → `release/*` → `main`), lo que despliega esa versión también en staging.
2. Fusionar en `main`. Se lanzan `infra` y `deploy-production`.
3. `infra`: leer `plan-production` (cubre `platform` y `envs/production`) y aprobar el `apply`. La primera vez ejecuta las importaciones de la plataforma. **En el plan, mirar sobre todo los dominios autorizados de Identity Platform.**
4. `deploy-production` falla de forma esperada si los servicios aún no existen (como pasó en staging); relanzarlo tras el `apply`. Exige que staging haya validado **exactamente** el mismo contenido: el hash de árbol de `backend/` y de `frontend/` en `main` debe tener su `validated-<hash>`.
5. Comprobar el escenario 6 del quickstart: mismo *digest* que staging, `/health` con la misma versión, `/config.js` apuntando a la API de producción.

## 11. Guía operativa (T088, FR-021)

Resumen de operación para quien llega sin contexto. El detalle y la historia de cada decisión están en las secciones 1 a 10; esta guía solo las ordena.

### Entornos y URL

| | Staging | Producción |
|---|---|---|
| Proyecto | `pdlco-mytasks-stg` (nº 838389521553) | `pdlco-mytasks` (nº 2195266360) |
| Región | `europe-southwest1` | `europe-southwest1` |
| Web | `https://mytasks-web-838389521553.europe-southwest1.run.app` | `https://mytasks-web-2195266360.europe-southwest1.run.app` |
| API | `https://mytasks-api-838389521553.europe-southwest1.run.app` | `https://mytasks-api-2195266360.europe-southwest1.run.app` |
| Rama que lo despliega | `develop` (también `release/*` y `hotfix/*`) | `main` |
| Identidad del despliegue | `deployer-staging` | `deployer-production` |

Usa siempre la URL determinista de la tabla, no el `status.url` de Cloud Run (sección 9, punto 4). La versión que sirve cada entorno se lee sin entrar en la infraestructura: `GET /health` de la API (`version`), `APP_VERSION` en `GET /config.js` de la web y la pestaña *Environments* de GitHub.

### Flujo de despliegue

1. Una PR a `develop` pasa los checks requeridos por los *rulesets* (CI y, si toca `infra/`, `fmt`, `validate` y el plan de solo lectura de `infra.yml`).
2. Al fusionar en `develop`, `deploy-staging` calcula el hash de árbol de `backend/` y `frontend/`, reutiliza la imagen si ya existe o la construye, comprueba su procedencia, crea las revisiones **sin tráfico**, pasa el humo por la URL con etiqueta, mueve el tráfico (primero la API, después la web) y marca las imágenes como `validated-<hash>`. Si cambia `infra/`, `infra` aplica `staging` tras aprobación del propietario.
3. La release sale de `develop` como rama `release/*` nueva y se abre una PR a `main` (`release/*` no admite `push` directo).
4. Al fusionar en `main`, `deploy-production` **no construye**: promueve el mismo *digest* que validó staging y falla antes de tocar nada si falta `validated-<hash>` de algún componente. `infra` aplica `production` y `platform` tras aprobación del *environment* `infra-production`.
5. Cada despliegue deja un resumen en la ejecución con el resultado, las versiones y las URL.

Orden en un entorno nuevo: `apply` de `infra` primero (crea los servicios) y `deploy` después; el primer `deploy` falla de forma esperada si los servicios no existen (sección 9, punto 1).

### Recuperación de un despliegue fallido

| Dónde falla | Qué queda | Qué hacer |
|---|---|---|
| Antes de «Deploy the revisions without traffic» (variables, procedencia, imagen) | Nada cambia | Leer el error del paso (nombra el servicio, el componente o el hash), corregir y relanzar |
| En «Smoke test» | Revisiones nuevas sin tráfico; el tráfico sigue en la anterior | Las etiquetas de revisión se retiran solas. Corregir y volver a fusionar; el hash nuevo reconstruye |
| En «Move the traffic» de la web | La API vuelve sola a su revisión anterior (el paso lo registra con `::error::`) | Comprobar con `GET /health` que la API sirve la versión previa y relanzar |
| Despliegue correcto pero defectuoso | La versión mala sirve tráfico | **Revertir el commit** y dejar que el pipeline despliegue el contenido anterior: en staging, PR a `develop`; en producción, el contenido revertido tiene que haber pasado antes por staging (`validated-<hash>`), así que la reversión también viaja `develop` → release → `main`. Un hash que ya se validó una vez se reutiliza sin reconstruir |
| «Versión no validada en staging» en producción | Producción sin cambios | Es el comportamiento esperado: dejar que staging despliegue y valide ese contenido y relanzar |
| `infra` falla en el plan | Sin `apply` | El detalle del plan está en el **resumen de la ejecución** (el log solo da `exit code 1`); buscar las líneas `Error:` |

Un run de `deploy-staging` en «waiting» bloquea a los siguientes: aprobarlo o cancelarlo en cuanto aparezca, y no aprobar nunca el de un commit anterior (sección 9, punto 2). **No hay procedimiento de reversión manual del tráfico**: los despliegues los hace solo el pipeline (Principio VI) y el agente no puede crear revisiones (T082).

### Arranque único y permisos temporales

El arranque (estado, federación, cuentas del pipeline, repositorio) se hizo una vez por el MCP y ahora lo declara `infra/platform/`: sección 8. Los permisos temporales de `mytasks-ai-agent` y su retirada (T060, caducan el 2026-10-30 23:00 UTC) están en la sección 4. Los roles personalizados que concede el propietario, en `infra/iam/roles/` y `guia-propietario-med-001.md`.

### Acceso por invitación y administradores

Quién puede entrar, cómo se designa al administrador de cada entorno y cómo recuperar el acceso si se pierde: sección 12.

### Proveedor de Google en Identity Platform (R-2)

Terraform no puede inicializar Identity Platform en un proyecto que no es Firebase (sección 9, «Paso previo al primer `apply`»). Staging lo activó el propietario en la consola de Firebase (T068, sección 9). Producción ya lo tenía desde el 2025-12-03 y la raíz lo adopta con `import` (sección 10). Si el inicio de sesión con Google falla tras un `apply`, comprobar primero los **dominios autorizados** y los orígenes de JavaScript del cliente OAuth. Falta confirmar con un inicio de sesión real en producción (T078).

### Rotación y revocación de la clave del agente

Rotación cada 90 días: sección 2. Revocación inmediata: sección 3. Comprobaciones de la identidad aislada: sección 1.

### Retirar un entorno (levantar la protección contra borrado)

**Procedimiento no probado** (decisión del propietario de 2026-10-19: no se recrea ni retira un entorno en un proyecto desechable, T089 paso 2). Un entorno tiene datos reales, así que retirarlo es siempre una decisión explícita del propietario. Las protecciones están en el código (`infra/README.md`, «Protección contra borrado») y hay que levantarlas **todas, en una PR y con su `apply`**, antes de que un plan pueda destruir nada:

1. Quitar `prevent_destroy` de la base de Firestore del módulo (`infra/modules/environment/main.tf`) y poner `delete_protection_state = "DELETE_PROTECTION_DISABLED"`. Terraform no admite una variable en `lifecycle`, así que es un cambio de código.
2. Poner `deletion_protection = false` en los dos servicios de Cloud Run (`infra/modules/environment/cloud_run.tf`).
3. Aplicar esa PR por `infra` y leer el plan: solo debe cambiar las protecciones.
4. En una segunda PR, retirar la raíz del entorno (`infra/envs/<entorno>/`). `infra.yml` detecta las raíces por la existencia de su `main.tf`, así que puede que haga falta ajustar el workflow y el estado remoto antes de que un plan muestre la destrucción: comprobarlo al preparar la PR y leer ese plan antes de aprobar.
5. La base de Firestore tiene `deletion_policy = "ABANDON"`: Terraform **la deja sin borrar** aunque destruya el recurso. Borrar los datos es un paso manual aparte, decidido por el propietario tras comprobar que no hace falta ninguna tarea.

`infra/platform/` (bucket de estado, repositorio, pool y proveedor) no se retira con un entorno: lo comparten staging y producción, y un pool borrado bloquea su nombre 30 días.

## 12. Acceso por invitación y administración (feature 003, T053)

Desde la feature 003 **nadie obtiene cuenta por iniciar sesión con Google**: hay que estar invitado, o ser el administrador inicial de ese entorno. Quien no lo está ve la pantalla «Necesitas una invitación» y no obtiene ni cuenta ni datos. Staging y producción tienen cuentas e invitaciones separadas, así que todo lo de esta sección se hace **en cada entorno**. Diseño y decisiones: `specs/003-user-roles-invitations/` (`research.md` R3–R7); contrato en `specs/001-eisenhower-task-manager/contracts/openapi.yaml`.

### Administrador inicial (bootstrap) por entorno

Es el único caso en el que se crea una cuenta sin invitación. Lo decide la variable `BOOTSTRAP_ADMIN_EMAIL`, **no secreta**, del GitHub Environment de cada entorno:

1. En GitHub: *Settings → Environments → `staging` (y `production`) → Variables → `BOOTSTRAP_ADMIN_EMAIL`*, con **una sola** dirección (la del propietario). Se compara sin distinguir mayúsculas.
2. `deploy.yml` falla en «Check the bootstrap administrator» si la variable falta o no es una dirección única, antes de tocar nada, para que no se despliegue un entorno sin administrador posible. La API la recibe por `--update-env-vars` en cada despliegue (Terraform no puede, porque ignora `env` una vez creado el servicio).
3. La primera vez que esa dirección inicia sesión con Google (con el correo verificado) y todavía no tiene cuenta, se crea su cuenta con rol `admin`. Si ya tenía tareas de antes, siguen ahí: el `uid` no cambia.
4. A partir de ahí la variable ya no hace nada por esa persona: no crea ni reemplaza cuentas que existan. **Cambiarla no quita el rol a nadie**; solo permite que otra dirección sea administradora en su primer inicio de sesión.

Estado a 2026-10-23: la variable está creada en ambos entornos por el propietario (T029); la validación real en staging es T057.

### Invitar, revocar y reinvitar

El administrador usa la pantalla **Accesos** (`/admin/access`, solo visible con rol `admin`); no hay que tocar Firestore ni Google Cloud.

| Acción | Efecto |
|---|---|
| Invitar un correo | Crea una invitación `pending` y la lista. **La aplicación no envía ningún correo**: hay que avisar a la persona por tu cuenta. Entra con su cuenta de Google y su primera sesión crea la cuenta con rol `user` (la invitación pasa a `accepted`). |
| Invitar un correo ya pendiente | No duplica (respuesta 200); no consume hueco. |
| Invitar un correo con cuenta activa | Rechazado (409). |
| Revocar una invitación pendiente | La persona ya no puede entrar con ella. |
| Retirar el acceso a un usuario | Su siguiente petición recibe 403 y ve la pantalla «sin acceso». **Sus tareas se conservan.** |
| Invitar de nuevo a quien perdió el acceso | Reactiva su cuenta con rol `user` y recupera sus tareas; no crea invitación. |

Límites que conviene conocer: **como máximo 50 invitaciones pendientes** a la vez (la 51 da 409 `invitation_limit_reached`; revocar una libera un hueco) y la pantalla muestra **las 100 más recientes** de invitaciones y de cuentas (avisa cuando una lista llega a 100). Los administradores no se pueden revocar ni degradar desde la aplicación, y no hay operación que cambie roles: es deliberado, para no perder nunca al último administrador (R6).

### Recuperar el acceso de administrador si se pierde la cuenta

La aplicación no tiene recuperación de cuentas (fuera de alcance de la feature). Lo que hay, según el caso, **sin credenciales del agente** (Principio V):

| Situación | Qué hacer |
|---|---|
| Puedes iniciar sesión con tu cuenta de Google, aunque haya cambiado su correo | Nada: la cuenta de la aplicación está ligada al `uid`, no al correo. El correo guardado **no se actualiza** (se queda el de cuando se creó la cuenta), así que en Accesos seguirá apareciendo el antiguo, y reinvitar el nuevo correo crearía una invitación para otra cuenta. |
| **No puedes iniciar sesión** con la cuenta administradora (la perdiste o la cerraron) | Poner en la variable `BOOTSTRAP_ADMIN_EMAIL` de ese entorno otra dirección **tuya** y redesplegar por el pipeline (una fusión que cambie `backend/` o `frontend/`, o relanzar el último despliegue desde *Actions*; el relanzado **no está probado**). Al iniciar sesión con esa dirección, que no tiene cuenta, se crea un administrador nuevo. |
| Quieres retirar el acceso al administrador anterior (por ejemplo, si la cuenta está comprometida) | **La aplicación no puede**: rechaza revocar a un `admin`. Lo hace el propietario con sus propias credenciales, en la consola de Firestore del proyecto del entorno, poniendo `status = "revoked"` en el documento `users/{uid}` de esa cuenta; el siguiente acceso de esa cuenta recibe 403. Procedimiento **no probado** y que el agente no ejecuta. |
| Borraste y recreaste tu usuario en Firebase Authentication con el mismo correo | El `uid` es nuevo y ya no coincide con la cuenta: si la dirección es la de `BOOTSTRAP_ADMIN_EMAIL`, se crea otra cuenta `admin` y la anterior queda huérfana con sus tareas (no se migran). Revocar la antigua como en la fila anterior. No lo hagas sin necesidad. |

Esto depende de dos requisitos de configuración de Firebase Authentication (el mismo servicio que Identity Platform; se ven en la consola de Firebase, *Authentication*) que no están en el repositorio y que debe comprobar el propietario en cada entorno (`security-review-fase-1.md`, INFO-001): que **solo está habilitado el proveedor Google** y que está activa la opción de **una cuenta por correo**. Comprobado por el propietario en staging y producción el 2026-10-23; si cambia la configuración, hay que repetirlo. La recuperación del administrador de la tabla de arriba **no se ha probado**: el propietario aceptó ese riesgo el 2026-10-23 mientras sea el único administrador.

### Qué mirar en los registros

Los eventos de acceso son JSON con una lista cerrada de campos (`action`, `uid`, `actor_uid`, `target`, `reason`); **nunca llevan tokens ni correos en claro**: `target` es una huella SHA-256 truncada del correo, que sirve para correlacionar eventos pero se puede invertir por diccionario si se conoce la dirección.

| Mensaje | Cuándo |
|---|---|
| `access_denied` (con `reason`: `no_account`, `no_invitation`, `revoked`, `email_not_verified`, `invalid_email` o `not_admin`) | Se deniega una petición. El cliente siempre ve el mismo 403. |
| `invitation_created`, `invitation_revoked`, `access_revoked`, `access_reactivated` | Acciones del administrador (`actor_uid`). |
| `invitation_accepted`, `bootstrap_admin_created` | Primera sesión de una persona invitada / del administrador inicial. |

El correo viaja en la ruta de `DELETE /api/v1/admin/invitations/{email}`, así que **sí** puede aparecer en los registros de petición de Cloud Run (`security-review-fase-2.md`, LOW-003): es un riesgo aceptado mientras la audiencia de los registros sea el propietario.

### Validación en staging (T057, propietario)

Tras desplegar por el pipeline, repetir en staging los escenarios 1–6 de `specs/003-user-roles-invitations/quickstart.md` con cuentas reales de prueba y anotar el resultado en `specs/003-user-roles-invitations/validacion-staging.md`.

## 13. Perfil, preferencias y avatar (feature 004, T103)

**No hay cambios de infraestructura**: ni variables de entorno, ni bucket, ni IAM, ni índices, ni cuentas de servicio nuevas. Todo vive en Firestore bajo el documento de cada cuenta y lo escribe solo la API. Diseño y decisiones: `specs/004-user-profile-settings/`; contrato en `specs/001-eisenhower-task-manager/contracts/openapi.yaml` (v1.3.0).

### Dónde está cada cosa

| Dato | Dónde |
|---|---|
| Preferencias, nombre para mostrar y tipo de avatar | `users/{uid}/settings/profile` (se crea al primer cambio; sin documento valen los valores por defecto) |
| Imagen de avatar subida | `users/{uid}/settings/avatar` (un solo documento por persona, ≤ 200 KB, WebP 256×256) |
| Copia de tema y densidad para el primer pintado | `localStorage` del navegador de cada persona (no es fuente de verdad) |

Para comprobar el avatar de una cuenta (lo hace el propietario con sus credenciales, en la consola de Firestore del proyecto del entorno; el agente no lo hace): en `users/{uid}/settings/profile`, `avatar_kind = upload` y `avatar_version` > 0 deben ir acompañados de un documento `avatar` en la misma subcolección.

### Si alguien sube una imagen inapropiada

La aplicación no tiene moderación ni denuncia: la imagen solo la ve su dueña, así que el caso es acotado. Si hay que quitarla, lo hace el propietario con sus credenciales en la consola de Firestore del entorno: borrar el documento `users/{uid}/settings/avatar` y poner `avatar_kind = "initials"` (y `avatar_preset = null`) en `users/{uid}/settings/profile`. Subir `avatar_version` en uno evita que el navegador de esa persona siga mostrando la copia en caché. Procedimiento **no probado**.

### Content-Security-Policy: `img-src` con `blob:`

El navegador pide la imagen con el token (un `<img src>` no puede enviarlo) y la muestra desde un `blob:` URL, así que `docker-entrypoint.d/40-runtime-config.sh` del contenedor web fija `img-src 'self' data: blob:`. Es la **única** directiva que cambia; el test `frontend/nginx/tests/test-runtime-config.sh` comprueba la política completa. Si tras un despliegue la consola del navegador muestra un error de CSP al ver el avatar, mirar primero que la cabecera sigue llevando `blob:`.

### Qué mirar en los registros

`avatar_uploaded` (solo `uid` y `size`, el tamaño final en bytes) y `avatar_removed` (`uid`). Nunca llevan el contenido de la imagen, el nombre del archivo ni sus metadatos. Un 429 `avatar_rate_limited` indica más de 10 subidas en una hora para esa cuenta; un 415 `avatar_unsupported`, un archivo que no es JPEG, PNG ni WebP, está corrupto o supera 12 megapíxeles.

### Validación en staging (T107, propietario)

Tras desplegar por el pipeline, repetir en staging los escenarios 1, 4, 7, 9, 12 y 16 de `specs/004-user-profile-settings/quickstart.md` con cuentas reales, comprobar que la consola del navegador no muestra errores de CSP y anotar el resultado en `specs/004-user-profile-settings/validacion-staging.md`.

## 14. Dominio propio con Firebase Hosting (feature 005)

Diseño en `specs/005-custom-domain/`. Esta sección se completa por fases: aquí está el estado de partida y los permisos (Phase 1); el procedimiento de DNS, el diagnóstico del certificado y la retirada del dominio los añade la Phase 4 (T036).

### Permisos de Hosting (T001, T003, T004)

Leído en solo lectura por el agente con el MCP de Google Cloud el 2026-10-25, antes de que el propietario concediera nada:

| Comprobación | Producción (`pdlco-mytasks`) | Staging (`pdlco-mytasks-stg`) |
|---|---|---|
| API `firebasehosting.googleapis.com` | Activa | Activa |
| `roles/firebasehosting.admin` en `terraform-<entorno>` | No concedido | No concedido |

Lo que concede el propietario (guía: `specs/005-custom-domain/guia-propietario-hosting.md`): `roles/firebasehosting.admin` a `terraform-staging` y a `terraform-production` en su proyecto, y la variable no secreta `CUSTOM_WEB_ORIGINS` en los entornos de GitHub `staging` (`https://staging.inserttask.com`) y `production` (`https://inserttask.com`). No se concede nada a `deployer-*` ni a `mytasks-ai-agent`.

**Verificación posterior a la concesión (T004, 2026-10-25, solo lectura con el MCP)**:

| Proyecto | Identidad | Resultado |
|---|---|---|
| `pdlco-mytasks` | `terraform-production` | Tiene `roles/firebasehosting.admin` además de los que ya tenía; ningún otro rol cambió |
| `pdlco-mytasks-stg` | `terraform-staging` | Tiene `roles/firebasehosting.admin` además de los que ya tenía; ningún otro rol cambió |

En cada proyecto, `roles/firebasehosting.admin` lo tiene **únicamente** la cuenta de Terraform de ese proyecto. Las variables `CUSTOM_WEB_ORIGINS` de los entornos de GitHub no se pueden leer sin credenciales: constan por confirmación del propietario.

**Sitio de Hosting por defecto**: el propietario comprobó en la consola de Firebase que **no existe** en ninguno de los dos proyectos (ni `pdlco-mytasks.web.app` ni `pdlco-mytasks-stg.web.app`). Por tanto lo crea Terraform y no hace falta ningún bloque `import` (T022).
