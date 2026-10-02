# Runbook de operación

Procedimientos operativos de la infraestructura y del acceso del agente a Google Cloud. Se irá
completando por fases (feature `002-cloud-run-cicd`); esta versión cubre la identidad aislada del
agente (Fase 1, FR-022 a FR-025).

Contrato de diseño: [`specs/002-cloud-run-cicd/contracts/agent-identity.md`](../specs/002-cloud-run-cicd/contracts/agent-identity.md).

## 1. Identidad aislada del agente: comprobaciones repetibles

**Cuándo ejecutarlas**: tras montar la identidad aislada (Fase 1), tras cambiar `.mcp.json`,
`.claude/settings.json` o el hook, tras rotar la clave y como mínimo una vez por trimestre.

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
| 9 | Repetir 2 a 7 tras reiniciar la sesión de Claude Code | Cerrar y abrir la sesión | Mismos resultados que antes del reinicio |

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
Se **retiran en la tarea T060**; solo `roles/viewer` y `roles/logging.viewer` son permanentes.

| Rol | `pdlco-mytasks` (producción y plataforma) | `pdlco-mytasks-stg` (staging) | Motivo | Se retira |
|---|---|---|---|---|
| `roles/serviceusage.serviceUsageAdmin` | sí | sí | Habilitar APIs (T042) | T060 |
| `roles/iam.serviceAccountAdmin` | sí | sí | Crear cuentas `terraform-*`, `terraform-plan-*` y `deployer-*` y enlazarlas a la federación (T046, T047, T049) | T060 |
| `roles/resourcemanager.projectIamAdmin` | sí | sí | Roles acotados de esas cuentas y registros de auditoría (T015, T046) | T060 |
| `roles/storage.admin` | sí | no | Bucket de estado de Terraform (T043) | T060 |
| `roles/iam.workloadIdentityPoolAdmin` | sí | no | Pool y proveedor de federación de GitHub (T044) | T060 |
| `roles/artifactregistry.admin` | sí | no | Repositorio de imágenes (T048) | T060 |
| `roles/viewer` | sí | sí | Lectura de recursos | permanente |
| `roles/logging.viewer` | sí | sí | Lectura de registros de auditoría | permanente |

Verificado en solo lectura el 2026-10-01 con la política IAM de cada proyecto: producción tiene los
ocho roles y staging los cinco que le corresponden.

`roles/resourcemanager.projectIamAdmin` permite a la cuenta concederse más permisos: es el riesgo
conocido del arranque y la razón de que sea temporal y de que cada cambio requiera la confirmación
explícita del propietario.

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
(T017) que las operaciones de Firestore aparecen como `DATA_READ` / `DATA_WRITE`.
