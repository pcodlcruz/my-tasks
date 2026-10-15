# Informe de Auditoría de Seguridad — Identidad aislada del agente (feature 002, Fase 1)

**Fecha**: 2026-10-04 | **Rama auditada**: `feature/002-cloud-run-cicd-fase-1` (commit `21eda58`) | **Tarea**: T019

**Alcance**: `.mcp.json`, `.claude/settings.json`, `.claude/hooks/gcloud_identity_guard.py`, `infra/RUNBOOK.md` (secciones 1 a 6) y `specs/002-cloud-run-cicd` (spec, plan, research). Lectura de código y de configuración; sin ejecutar nada nuevo sobre Google Cloud. Se apoya en los resultados de las comprobaciones de T017 y T018 (RUNBOOK §6).

**Tipología detectada**: cloud-native/GCP (identidad de una cuenta de servicio operada por un agente de IA a través de un MCP) y, de forma secundaria, plataforma AI (control de lo que un agente puede hacer con una credencial).

**Marcos aplicados**: CIS Google Cloud Foundation Benchmark (IAM, claves de cuentas de servicio, registro), OWASP A05 (Security Misconfiguration), A06 (Vulnerable and Outdated Components), A08 (Software and Data Integrity Failures), A09 (Logging) y mínimo privilegio.

**Nivel de riesgo global**: **Medio**. **No hay hallazgos críticos ni altos, así que ninguno bloquea la fusión de la Fase 1.** Hay tres hallazgos medios que deben resolverse antes de que termine el arranque (Fase 3) y tres bajos.

---

## Resumen ejecutivo

El diseño cumple su objetivo principal: con el almacén aislado, el agente solo dispone de la credencial de `mytasks-ai-agent` y no existe ninguna credencial personal que pueda seleccionar. Las comprobaciones 1 a 9 se superaron tras reiniciar la sesión (RUNBOOK §6) y la configuración del repositorio coincide con lo que se comprobó.

Los riesgos que quedan no están en la identidad del agente, sino en lo que esa identidad puede hacer y en las capas de defensa que la rodean: el hook (segunda capa) tiene dos puntos débiles, los permisos temporales de arranque permiten al agente crear claves de las cuentas del pipeline y concederse más permisos, y el servidor MCP se ejecuta con un paquete sin versión fijada.

**Lo que está bien (verificado, sin hallazgo)**

- `.mcp.json` no contiene secretos ni rutas absolutas personales (`${HOME}`); anula con valor vacío la suplantación, el fichero de token, el fichero de credenciales y `GOOGLE_APPLICATION_CREDENTIALS`, y fija cuenta y proyecto. Es el único servidor `gcloud` y es de ámbito Project (T017, comprobación 7).
- `.claude/settings.json` combina cuatro capas: reglas `deny` de `gcloud`, `gsutil` y `bq`, reglas `deny` de lectura y edición de las dos rutas, sandbox activado con `failIfUnavailable: true` y `allowUnsandboxedCommands: false`, y variables de credenciales denegadas al Bash del agente. La comprobación empírica (4, 5, 6) confirmó la denegación por Bash y por `Read`.
- El hook es código determinista, no una instrucción al LLM. Rechaza `--account`, `--impersonate-service-account`, `--access-token-file`, `--credential-file-override`, `--configuration` y sus abreviaturas, los comandos `auth`, los cambios de `config` sobre claves de identidad y cualquier `CLOUDSDK_*`. Una entrada mal formada se rechaza (falla cerrado) y un fallo al escribir el registro nunca convierte un rechazo en aprobación. El registro de rechazos no guarda argumentos y se crea con permisos `0700`/`0600`. Tiene tests en `.claude/hooks/tests/`.
- La clave es la única credencial de larga duración, con procedimiento de rotación cada 90 días y de revocación inmediata (RUNBOOK §2 y §3).
- Los permisos temporales están documentados con su motivo, su tarea de retirada (T060) y la verificación del 2026-10-01; solo `roles/viewer` y `roles/logging.viewer` son permanentes. El clasificador de permisos bloqueó `set-iam-policy` por el MCP, lo que confirma que existe un control humano efectivo sobre los cambios de IAM.
- Los registros de acceso a datos de Firestore e IAM están activados en `pdlco-mytasks` (RUNBOOK §5) y el hook deja constancia de los rechazos.

---

## Hallazgos

### [MED-001] El servidor MCP se ejecuta con `npx -y` sin versión fijada

| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP A06: Vulnerable and Outdated Components · A08: Software and Data Integrity Failures · cadena de suministro |
| **Componente afectado** | `.mcp.json` (servidor `gcloud`) |

**Descripción**
`npx -y @google-cloud/gcloud-mcp` descarga y ejecuta la última versión publicada en cada arranque, sin confirmación. Ese proceso corre fuera del sandbox del agente y con acceso directo al almacén aislado que contiene la clave de `mytasks-ai-agent`. Una versión comprometida o con un cambio de comportamiento (por ejemplo, que deje de respetar las variables `CLOUDSDK_*`, el supuesto R-6 del plan) se ejecutaría con la única credencial de larga duración del sistema, y los resultados de T017 y T018 dejarían de valer sin que nadie lo note.

**Evidencia**
`.mcp.json`: `"args": ["-y", "@google-cloud/gcloud-mcp"]`. El plan registra como riesgo R-6 el comportamiento no verificado de este MCP, y las comprobaciones de la sección 1 del RUNBOOK solo se repiten tras cambios de configuración o por trimestre, no tras un cambio de versión del paquete.

**Remediación requerida**
Fijar una versión exacta del paquete en `.mcp.json` (sin `latest` ni rangos) y anotar en el RUNBOOK que actualizarla obliga a repetir las comprobaciones 1 a 7. Valorar la fijación por integridad (resumen del paquete) si la herramienta la admite.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-operator` (con `update-config`, según el plan de Fase 1)
- Tipo de cambio: De configuración

---

### [MED-002] El hook no cubre `--flags-file` y falla abierto si no se ejecuta

| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP A05: Security Misconfiguration · defensa en profundidad |
| **Componente afectado** | `.claude/hooks/gcloud_identity_guard.py`, `.claude/settings.json` (hook `PreToolUse`) |

**Descripción**
(a) `gcloud` admite el indicador global `--flags-file`, que carga un fichero YAML o JSON con pares `--indicador: valor`. El hook solo inspecciona los argumentos que recibe, así que un comando con `--flags-file=<fichero>` cuyo contenido incluya `--impersonate-service-account`, `--account` o `--credential-file-override` pasa el filtro sin ser rechazado. El agente puede escribir ese fichero en el repositorio o en su directorio temporal. (b) Según el protocolo de hooks de Claude Code, solo el código de salida 2 bloquea; cualquier otro (fallo de Python, `python3` ausente del PATH, excepción no controlada) deja pasar la llamada.

La garantía principal sigue en pie hoy (no hay credencial personal que seleccionar y la cuenta del agente no puede suplantar a otra), por eso no es alta. Pero con los permisos temporales de MED-003 la segunda capa es precisamente la que impediría una suplantación, y ahora mismo se puede eludir.

**Evidencia**
`gcloud_identity_guard.py`: `FORBIDDEN_FLAGS` no incluye `--flags-file` y `_evaluate_tokens` no lo trata; `grep flags-file` en `.claude`, `specs` e `infra` no da resultados. `main()` no tiene un manejador de nivel superior que convierta un error inesperado en código 2. No se probó el comportamiento de `--flags-file` contra el MCP (no se ejecutó ninguna operación nueva); el hallazgo se basa en la lectura del código y en la documentación de `gcloud`.

**Remediación requerida**
Rechazar `--flags-file` y sus abreviaturas válidas. Hacer que cualquier error no esperado del hook termine con código 2. Añadir tests que fallen sin estos cambios y una comprobación 10 al RUNBOOK que pruebe `--flags-file`. Comprobar además que el hook sigue registrado tras cada cambio de `.claude/settings.json`.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-operator`
- Tipo de cambio: De implementación (hook y tests) y de configuración

---

### [MED-003] Los permisos temporales de arranque permiten al agente obtener credenciales del pipeline y ampliar los suyos

> **Corrección (2026-10-06).** La descripción de abajo dice que `roles/iam.serviceAccountAdmin` incluye la
> creación de claves de cualquier cuenta. **No es exacto**: `iam.serviceAccountKeys.create` pertenece a
> `roles/iam.serviceAccountKeyAdmin` y a `roles/editor`. El vector real es `iam.serviceAccounts.setIamPolicy`
> (incluido en `serviceAccountAdmin`), que permite concederse la suplantación de la cuenta, junto con
> `projectIamAdmin`, que permite concederse cualquier rol. La gravedad y el riesgo no cambian; la remediación sí.
> Se resuelve con el diseño de [`contracts/agent-bootstrap-permissions.md`](./contracts/agent-bootstrap-permissions.md)
> (tareas T041a a T041d de la Fase 3), que sustituye la remediación (1) a (5) de abajo.

| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | CIS GCP 1.x (IAM): mínimo privilegio y separación de funciones · OWASP A01: Broken Access Control |
| **Componente afectado** | IAM de `mytasks-ai-agent` en `pdlco-mytasks` y `pdlco-mytasks-stg` |

**Descripción**
El RUNBOOK §4 reconoce que `roles/resourcemanager.projectIamAdmin` permite al agente concederse más permisos. No menciona que `roles/iam.serviceAccountAdmin` incluye la creación de claves de cualquier cuenta de servicio del proyecto. Cuando T046, T047 y T049 creen `terraform-*`, `terraform-plan-*` y `deployer-*` (que el diseño reserva al pipeline, sin claves), el agente podrá crear una clave de cualquiera de ellas o concederse `roles/iam.serviceAccountTokenCreator` sobre ellas, y con ello eludir el Principio V y la separación entre el agente y el pipeline (R-5). El único freno actual es la confirmación humana de cada cambio y el clasificador de permisos, que funcionó con `set-iam-policy` en T015, pero son controles de proceso, no técnicos. Tampoco hay una fecha tope ni una alerta: la retirada depende de que T060 se ejecute (`TODO(T060): fecha de retirada`), y una operación de IAM del agente solo queda en el registro de actividad de administración, sin aviso.

**Evidencia**
`infra/RUNBOOK.md` §4: seis roles temporales, entre ellos `serviceAccountAdmin` y `projectIamAdmin` en ambos proyectos, con motivo «crear cuentas `terraform-*`, `terraform-plan-*` y `deployer-*`». Plan, R-1 y R-5. El registro de auditoría (comprobación 8) solo mostró `SetIamPolicy` del propietario; no hay ninguna alerta definida sobre `SetIamPolicy`, `CreateServiceAccountKey` ni cambios en `auditConfigs`.

**Remediación requerida**
(1) Acotar con condiciones de IAM de caducidad (`request.time`) los seis roles temporales, de modo que se retiren solos aunque T060 se retrase; (2) acotar `serviceAccountAdmin` y `projectIamAdmin` para que no actúen sobre las cuentas `terraform-*`, `terraform-plan-*` y `deployer-*` (condición por nombre de recurso) o, si no es viable, crear esas cuentas por otra vía y retirar el rol antes de que existan; (3) añadir al RUNBOOK §4 la capacidad de crear claves de esas cuentas como riesgo conocido; (4) definir una alerta sobre `SetIamPolicy`, `CreateServiceAccountKey` y cambios de `auditConfigs` iniciados por `mytasks-ai-agent`; (5) fijar una fecha tope para T060.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-architect` (diseño de las condiciones y de la alerta); `mytasks-google-cloud-operator` (aplicarlo, con confirmación explícita)
- Tipo de cambio: Arquitectónico y de configuración

---

### [LOW-001] Los ficheros que sostienen la contención no están protegidos contra edición por el agente

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: Security Misconfiguration |
| **Componente afectado** | `.claude/settings.json` (reglas `deny`) |

**Descripción**
Las reglas `deny` de edición cubren solo `~/.config/gcloud/**` y `~/.config/mytasks-agent/**`. Ni `.claude/settings.json`, ni `.claude/hooks/**`, ni `.mcp.json` tienen una regla `deny` de edición, así que su protección depende del aviso de permisos de cada modo. Un agente que modifique `.mcp.json` (por ejemplo `CLOUDSDK_CONFIG`) o desregistre el hook cambiaría la contención en el siguiente arranque. Un cambio así llegaría a `develop` solo por PR, pero entraría en vigor antes en la máquina local.

**Evidencia**
`.claude/settings.json`, bloque `permissions.deny`. No se verificó qué pide hoy el harness por defecto al editar estos ficheros.

**Remediación requerida**
Añadir reglas `deny` de edición para `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/**` y `.mcp.json`. Los cambios legítimos los hace el propietario o se hacen retirando temporalmente la regla bajo confirmación.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-operator` (con `update-config`)
- Tipo de cambio: De configuración

---

### [LOW-002] La comprobación 8 no demuestra la atribución de las operaciones del agente

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A09: Security Logging and Monitoring Failures |
| **Componente afectado** | `infra/RUNBOOK.md` §1 (comprobación 8) y §5 |

**Descripción**
El registro de los últimos tres días solo contiene tres `SetIamPolicy` del propietario. No hay ninguna entrada a nombre de `mytasks-ai-agent` porque sus operaciones fueron lecturas de `cloudresourcemanager` y `logging`, que no se registran por defecto. La comprobación confirma que el agente no usó una identidad personal, pero no demuestra que sus operaciones queden atribuidas a su cuenta. Tampoco se ha confirmado todavía que Firestore genere `DATA_READ` y `DATA_WRITE` (RUNBOOK §5).

**Evidencia**
RUNBOOK §6, comprobación 8. RUNBOOK §5, última frase.

**Remediación requerida**
Añadir a la comprobación 8 una operación de control que sí se registre con la configuración actual (por ejemplo una lectura de `iam.googleapis.com`, cuyo acceso a datos está activado) y comprobar que aparece con `principalEmail` igual a la cuenta del agente. Repetir la confirmación para Firestore cuando haya tráfico real.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-operator`
- Tipo de cambio: De configuración (procedimiento)

---

### [LOW-003] Sin fecha de creación de la clave ni de la última rotación

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | CIS GCP 1.4 / 1.7: rotación de claves de cuentas de servicio |
| **Componente afectado** | `infra/RUNBOOK.md` §2 |

**Descripción**
El plazo de 90 días solo se puede cumplir si se sabe cuándo empieza. El RUNBOOK deja la fecha como `TODO(propietario): fecha`, y el recordatorio periódico del calendario que exige T016 no se ha verificado.

**Evidencia**
`infra/RUNBOOK.md` línea 58: `TODO(propietario): fecha`.

**Remediación requerida**
Anotar la fecha de creación de la clave actual y la fecha límite de rotación (90 días después), y confirmar que existe el evento de calendario.

**Destinatario**
- Skill/agente: ninguna fila de la tabla de `CLAUDE.md` lo cubre; es una acción manual del propietario (como T013 y T014 en `tasks.md`).
- Tipo de cambio: De configuración (documentación y proceso)

---

## Categorías sin información suficiente

- **Permisos y ubicación de la clave**: el agente no puede leer `~/.config/mytasks-agent/` (es el diseño), así que no se pudo comprobar el modo `0600` ni dónde está el fichero. El RUNBOOK §1 lo sitúa en `~/.config/mytasks-agent/`, pero una nota de sesiones anteriores indica que está dentro de `~/.config/mytasks-agent/gcloud/`. Conviene que el propietario confirme una de las dos y corrija el RUNBOOK, porque la revocación (§3, paso 2) y la rotación (§2, paso 4) dependen de borrar ese fichero.
- **Copia de `mytasks-ai-agent` en el almacén personal** (`~/.config/gcloud`): quedó de un primer `activate-service-account` sin `CLOUDSDK_CONFIG`. No rompe el aislamiento, pero es una copia de la credencial del agente fuera del almacén aislado. Se recomienda revocarla desde tu terminal.
- **Seguridad de red, cifrado, gestión de incidentes y recuperación**: no aplican a esta fase; la identidad no despliega nada.

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| MED-001 | Media | Operador / configuración | `mytasks-google-cloud-operator` |
| MED-002 | Media | Operador / implementación del hook | `mytasks-google-cloud-operator` |
| MED-003 | Media | Arquitecto y operador | `mytasks-google-cloud-architect` · `mytasks-google-cloud-operator` |
| LOW-001 | Baja | Operador / configuración | `mytasks-google-cloud-operator` (con `update-config`) |
| LOW-002 | Baja | Operador | `mytasks-google-cloud-operator` |
| LOW-003 | Baja | Propietario | acción manual (sin skill asignado) |

**Conclusión para la PR**: informe **sin hallazgos bloqueantes**. Propuesta: MED-001, MED-002 y LOW-001 pueden corregirse en esta misma fase (cambian ficheros de la Fase 1); MED-003 y LOW-002 se resuelven antes de crear las cuentas del pipeline (T046, T047, T049); LOW-003 es del propietario.

---

## Resolución (T019)

Corregidos en esta misma fase con `mytasks-google-cloud-operator` y `update-config`, tests primero (se comprobó que los tests nuevos fallaban sin el cambio). Estado tras la corrección: 51 tests del hook en verde.

| ID | Estado | Qué se hizo |
|---|---|---|
| MED-001 | ✅ Corregido (`6f141a9`) | `.mcp.json` fija `@google-cloud/gcloud-mcp@0.5.3`, la última versión publicada (2026-01-05) y la que `npx` ya descargaba. RUNBOOK §1: cambiar la versión se hace por PR y obliga a repetir las comprobaciones 1 a 7. No hay fijación por integridad: `npx` no la admite. |
| MED-002 | ✅ Corregido (`f5cbfc0`) | El hook rechaza `--flags-file` y sus abreviaturas (`--flatten` sigue permitido). `main()` termina con código 2 ante cualquier error inesperado (`guard-error` en el registro). El comando del hook en `.claude/settings.json` termina en `\|\| exit 2`, así que un fallo del intérprete (por ejemplo, `python3` ausente) también bloquea; con un intérprete inexistente la tubería da 2, y antes habría dado 127, que no bloquea. Comprobado en vivo: el MCP rechazó `--flags-file` con `forbidden-flag:--flags-file`. RUNBOOK: comprobación 10. |
| LOW-001 | ✅ Corregido (`c98d579`) | Reglas `deny` de edición para `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/**` y `.mcp.json`. Comprobado: un cambio real en `.mcp.json` con la herramienta de edición fue denegado y el fichero no cambió. RUNBOOK: comprobación 11. Efecto: los cambios futuros en esos ficheros los hace el propietario o se retira la regla de forma explícita. |
| MED-003 | ⏭ Pendiente (antes de T046, T047 y T049) | Requiere condiciones de caducidad e IAM acotado, y una alerta sobre operaciones de IAM del agente; se diseña con `mytasks-google-cloud-architect` y se aplica con confirmación explícita. Depende de la fecha de T060. |
| LOW-002 | ⏭ Pendiente | Añadir a la comprobación 8 una operación de control que sí se registre (una lectura de `iam.googleapis.com`) y repetir la confirmación para Firestore cuando haya tráfico real. |
| LOW-003 | ⏭ Pendiente (propietario) | Anotar la fecha de creación de la clave, la fecha límite de rotación y confirmar el recordatorio del calendario. |

Quedan sin verificar por diseño (el agente no puede leer esas rutas): los permisos `0600` y la ubicación exacta del fichero de la clave, y la copia de `mytasks-ai-agent` que quedó en el almacén personal. Ambas acciones son del propietario (ver «Categorías sin información suficiente»).

**Nivel de riesgo tras la corrección**: **Medio**, por MED-003 (permisos temporales de arranque). Baja a **Bajo** cuando T060 retire los seis roles temporales y se defina la alerta. No hay hallazgos bloqueantes.
