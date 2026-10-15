# Contrato de identidad aislada del agente (FR-022 a FR-025)

**Feature**: `002-cloud-run-cicd` | **Plan**: [../plan.md](../plan.md) | **Research**: [../research.md § R12](../research.md)

**Objetivo del propietario**: que el agente solo pueda operar sobre Google Cloud con la cuenta de
servicio `mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com` a través del MCP, y que usar las
credenciales personales sea **técnicamente imposible**, no solo una instrucción al LLM.

## Situación actual (a corregir)

- El servidor MCP `gcloud` está definido en el ámbito de **usuario** y suplanta a la cuenta del
  agente con una variable de entorno. La suplantación **exige** que la máquina conserve las
  credenciales personales del propietario, que son las que generan el token de la cuenta del
  agente.
- La regla `deny` de `Bash(gcloud:*)`, `Bash(gsutil:*)` y `Bash(bq:*)` de `.claude/settings.json`
  es solo un permiso de Claude Code: no impide leer `~/.config/gcloud` ni usar un SDK con las
  credenciales por defecto de la aplicación.
- Conclusión: hoy el requisito **no se cumple**. Esta feature lo corrige antes de cualquier
  operación real (Fase 1).

## Principio de diseño

> La garantía no descansa en que el agente *decida* no usar credenciales personales, sino en que
> **no existen en ningún sitio al que el agente o el MCP puedan llegar**. Todo lo demás es
> defensa en profundidad.

## Modelo de amenaza

| Vía que el diseño debe cerrar | Ejemplo |
|---|---|
| Leer credenciales personales de la CLI | Leer el directorio de configuración personal de `gcloud` |
| Usar las credenciales por defecto de la aplicación | Un SDK o Terraform que lee el fichero de credenciales por defecto o la variable equivalente |
| Forzar otra identidad en un comando del MCP | `--account`, `--impersonate-service-account`, `gcloud auth ...`, `gcloud config set account` |
| Cambiar de almacén de credenciales | Redefinir el directorio de configuración de `gcloud` |
| Obtener un token personal y usarlo por otra vía | Imprimir un token y usarlo desde `curl` |
| Leer la clave del agente y usarla fuera del MCP | Leer el fichero de la clave |
| Tener un segundo servidor MCP de Google Cloud con credenciales personales | El servidor actual de ámbito usuario |

## Diseño (cuatro capas)

### Capa 1 — Las credenciales personales no existen en el entorno del MCP (garantía principal)

- El MCP de Google Cloud se define en `.mcp.json` (versionado, **sin secretos**, con rutas
  relativas al directorio personal) con un **directorio de configuración de `gcloud` propio y
  aislado** fuera del repositorio (p. ej. bajo `~/.config/mytasks-agent/`).
- Ese directorio contiene **únicamente** la identidad de `mytasks-ai-agent`: la clave de su propia
  cuenta de servicio, activada directamente, **sin suplantación** (decisión de la clarificación).
- Como las credenciales por defecto de la aplicación viven dentro del directorio de
  configuración de `gcloud`, quedan también aisladas: el MCP no ve las del propietario.
- Consecuencia: aunque un comando del MCP intentara `--account=<personal>` o suplantar otra
  cuenta, **no hay ninguna credencial personal que seleccionar**.
- El servidor MCP `gcloud` de ámbito usuario que suplanta a la cuenta se **elimina**; no puede
  coexistir un segundo servidor con credenciales personales.

### Capa 2 — El agente no puede leer credenciales personales ni la clave

- El *sandbox* de Bash de Claude Code se activa y se le deniega la lectura de: el directorio
  personal de configuración de `gcloud`, el fichero de credenciales por defecto de la aplicación
  y el directorio aislado del agente (clave incluida).
- Reglas `deny` de lectura equivalentes para las herramientas de lectura y edición de ficheros
  de Claude Code sobre esas mismas rutas.
- Las variables de credenciales (`GOOGLE_APPLICATION_CREDENTIALS`, `CLOUDSDK_*`, tokens) no se
  propagan al entorno de Bash del agente.
- El MCP (proceso propio, no sandboxed) es el único que lee la clave. *A verificar en la
  implementación*: nombres exactos de las opciones de sandbox y que la denegación cubre a las
  herramientas de fichero.
- La regla `deny` actual de `gcloud`, `gsutil` y `bq` en Bash se **mantiene** como capa adicional.

### Capa 3 — Guardia determinista de identidad (hook)

- Un hook `PreToolUse` sobre la herramienta del MCP de Google Cloud, escrito como comprobación
  determinista (no una instrucción al LLM), **rechaza** los comandos que intenten cambiar de
  identidad o de almacén: `--account`, `--impersonate-service-account`, `gcloud auth`,
  `gcloud config set account|auth/*`, redefinir `CLOUDSDK_CONFIG` y equivalentes.
- Cada rechazo se **registra** (fecha, herramienta, motivo; sin volcar credenciales) en un
  fichero local fuera del repo (FR-023: el intento "queda registrado").
- Es defensa en profundidad: su ausencia no reabre el riesgo porque la capa 1 ya elimina la
  credencial. *A verificar en la implementación (R-6)*: qué bloquea ya el propio `gcloud-mcp`.

### Capa 4 — Detección posterior con el registro de auditoría de Google Cloud

- Los registros de auditoría de actividad de administración están siempre activos; se activan
  además los de acceso a datos de Firestore e IAM en ambos proyectos.
- Verificación repetible (FR-024, SC-010): consulta de los registros (solo lectura, por el MCP)
  que comprueba que **toda** operación del agente figura a nombre de `mytasks-ai-agent` y que
  ninguna operación del periodo figura a nombre de una identidad personal **iniciada por el agente**
  (las acciones humanas del propietario en la consola, p. ej. el arranque, se distinguen por
  horario y se documentan).

## Clave de la cuenta de servicio (FR-025)

| Aspecto | Requisito |
|---|---|
| Creación | La crea el propietario una sola vez con sus credenciales, en un acto de administración humano (no lo hace el agente). Si una política de organización impide crear claves, se detiene la feature y se replantea (riesgo R-1). |
| Ubicación | Fichero fuera del repositorio, en el directorio aislado del agente, con permisos solo del propietario |
| Alcance de lectura | Solo el proceso del MCP (capa 2) |
| Rotación | Periódica (propuesta: cada 90 días) con procedimiento en `infra/RUNBOOK.md`; recordatorio del propietario |
| Revocación | Inmediata por el propietario si hay sospecha; se documenta el procedimiento |
| Permisos de la cuenta | Tras el arranque, **solo lectura** en los proyectos (sin despliegue, sin IAM) |

Es la **única** credencial de larga duración del sistema. El pipeline usa federación y no tiene
claves (FR-013).

## Verificación repetible (SC-010)

Se implementa como lista de comprobación ejecutable y se documenta en
[../quickstart.md](../quickstart.md), escenario 1. Cada comprobación debe fallar si el diseño se
rompe:

| # | Comprobación | Resultado esperado |
|---|---|---|
| 1 | Listar las cuentas con credenciales en el entorno del MCP | Solo `mytasks-ai-agent` |
| 2 | Pedir al MCP una operación forzando una cuenta personal | Rechazada por el hook y, aunque pasara, sin credencial disponible |
| 3 | Pedir al MCP suplantar otra cuenta de servicio | Rechazada |
| 4 | Intentar leer el directorio personal de `gcloud` y las credenciales por defecto desde Bash y desde las herramientas de fichero | Denegado |
| 5 | Intentar leer la clave del agente desde Bash y desde las herramientas de fichero | Denegado |
| 6 | Ejecutar `gcloud`, `gsutil` o `bq` directamente por Bash | Denegado (regla existente) |
| 7 | Comprobar que no existe ningún servidor MCP de Google Cloud de ámbito usuario | No existe |
| 8 | Consultar el registro de auditoría tras las pruebas | Todas las operaciones a nombre de `mytasks-ai-agent` |
| 9 | Reintentar 2–7 tras reiniciar la sesión | Mismos resultados |

## Fuera de alcance / limitaciones

- No protege frente a que el **propietario** use sus credenciales: él es el dueño de la
  máquina. Protege frente a que las use el **agente**.
- La identidad del agente puede, por diseño, hacer lo que sus permisos permitan; por eso sus
  permisos son de solo lectura tras el arranque.
- Si la máquina del propietario está comprometida a nivel del sistema, esta capa no sustituye a
  un entorno separado (opción descartada en la clarificación por coste/complejidad).
