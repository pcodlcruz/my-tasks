# Guía del propietario: T041a, T041b y T041c (resuelve MED-003)

**Para**: el propietario, con sus credenciales en la consola de Google Cloud. **Diseño**: [contracts/agent-bootstrap-permissions.md](./contracts/agent-bootstrap-permissions.md).
**Duración estimada**: 45 minutos para los dos proyectos. **Hazlo con el agente parado**, sin ninguna operación en curso: el paso 2 le quita permisos.

Todo se hace en la **consola web**; el agente no interviene y **nunca debe recibir** `Deny Admin`, ningún rol de Monitoring de escritura ni `Project IAM Admin`. Se repite cada paso en los dos proyectos: `pdlco-mytasks` (producción y plataforma) y `pdlco-mytasks-stg` (staging).

Valores que se usan en toda la guía:

| Dato | Valor |
|---|---|
| Cuenta del agente | `mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com` |
| Identificador del agente en denegación | `principal://iam.googleapis.com/projects/-/serviceAccounts/mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com` |
| Fecha tope | `2026-10-31T23:59:59Z` |

---

## Paso 0 · Comprobaciones previas (5 min)

- [ ] **¿Hay una organización?** En el selector de proyectos de la consola, comprueba que por encima de `pdlco-mytasks` y `pdlco-mytasks-stg` aparece una organización. **Si no la hay, para y avísame**: el diseño la da por supuesta.
- [ ] **¿Tienes `Deny Admin`?** *IAM y administración → IAM*, selecciona la **organización** en el selector, busca tu usuario y mira sus roles. Necesitas **Deny Admin** (`roles/iam.denyAdmin`) o un rol que lo incluya (por ejemplo *Security Admin*). Si te falta, concédetelo a ti mismo en la organización (hace falta ser *Organization Administrator* o similar). Es un rol **tuyo**, no del agente.
- [ ] **Identifica el estado actual del agente.** En cada proyecto, *IAM*, busca `mytasks-ai-agent`. Debes ver: producción con 8 roles, staging con 5 (tabla del RUNBOOK §4). Anota cualquier diferencia antes de seguir.

Si algo no coincide con lo anterior, para y dímelo.

---

## Paso 1 · T041a: política de denegación (10 min por proyecto)

*IAM y administración → IAM → pestaña **Deny*** → selector de proyecto → **Crear política de denegación**.

| Campo | Valor |
|---|---|
| ID de la política | `agent-no-impersonation` |
| Nombre | `Agente: sin claves ni suplantación de cuentas de servicio` |

**Añadir regla de denegación** (una sola regla):

| Campo | Valor |
|---|---|
| Principales denegados | el identificador del agente de la tabla de arriba |
| Principales exceptuados | **ninguno** |
| Condición de denegación | **ninguna** |
| Permisos denegados | los siete de abajo |

Permisos (si el selector exige otro formato, busca el nombre sin el prefijo `iam.googleapis.com/`):

```
iam.googleapis.com/serviceAccountKeys.create
iam.googleapis.com/serviceAccounts.getAccessToken
iam.googleapis.com/serviceAccounts.getOpenIdToken
iam.googleapis.com/serviceAccounts.implicitDelegation
iam.googleapis.com/serviceAccounts.signBlob
iam.googleapis.com/serviceAccounts.signJwt
iam.googleapis.com/serviceAccounts.actAs
```

- [ ] **Autoprotección.** En el selector de permisos busca `denypolicies`. Si aparecen `iam.googleapis.com/denypolicies.*` (o los permisos `create`, `update`, `delete`) como *compatibles*, añádelos a la **misma regla**. Si no aparecen, no pasa nada: la protección es retirar `Project IAM Admin` en el paso 2. **Anota cuál de los dos casos es** (me hace falta para el RUNBOOK).
- [ ] Guarda. Comprueba en la lista de la pestaña **Deny** que la política aparece en el proyecto.
- [ ] Repite en el otro proyecto.

---

## Paso 2 · T041b: caducidad y retirada de `Project IAM Admin` (15 min por proyecto)

*IAM y administración → IAM*, en el proyecto → fila de `mytasks-ai-agent` → **lápiz (editar principal)**.

**Qué tocar y qué no:**

| Rol (nombre en la consola) | Producción | Staging | Acción |
|---|---|---|---|
| Service Usage Admin | sí | sí | añadir condición |
| Service Account Admin | sí | sí | añadir condición |
| Storage Admin | sí | no | añadir condición |
| Workload Identity Pool Admin | sí | no | añadir condición |
| Artifact Registry Administrator | sí | no | añadir condición |
| **Project IAM Admin** | sí | sí | **eliminar la fila** (papelera) |
| Viewer | sí | sí | **no tocar** |
| Logs Viewer | sí | sí | **no tocar** |

**Para cada rol «añadir condición»:** en su fila, **Añadir condición de IAM** →

| Campo | Valor |
|---|---|
| Título | `Caduca el 2026-10-31` |
| Descripción | `Permiso temporal de arranque (MED-003). Renovar solo de forma explícita.` |
| Pestaña | **Editor de condiciones** |
| Expresión | `request.time < timestamp("2026-10-31T23:59:59Z")` |

Pulsa **Guardar** en la condición y luego **Guardar** en el panel del principal.

**Importante:** añadir la condición **sobre la fila existente** la convierte en condicional en el sitio; no se crea una fila nueva. Si por cualquier motivo acabas con **dos filas del mismo rol** (una con condición y otra sin ella), **borra la que no tiene condición**: una concesión condicional no anula a una incondicional y, si se queda, la caducidad no sirve de nada.

- [ ] Producción: 5 roles con condición, `Project IAM Admin` eliminado, `Viewer` y `Logs Viewer` intactos.
- [ ] Staging: 2 roles con condición, `Project IAM Admin` eliminado, `Viewer` y `Logs Viewer` intactos.
- [ ] Recarga la lista y comprueba que cada rol temporal muestra su condición y que **no hay filas duplicadas** sin condición.

---

## Paso 3 · T041c: alerta por correo (15 min)

**3a. Canal de notificación** (una vez por proyecto). *Monitoring → Alertas → Editar canales de notificación → Correo electrónico → Añadir nuevo*: tu correo y el nombre `Propietario (alertas del agente)`.

**3b. Política de alertas** (en cada proyecto). *Logging → Explorador de registros*, pega esta consulta y pulsa **Ejecutar consulta** (debe ejecutarse sin error; puede no devolver resultados todavía):

```
logName:"cloudaudit.googleapis.com%2Factivity"
protoPayload.authenticationInfo.principalEmail="mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com"
(
  protoPayload.methodName:"setiampolicy"
  OR protoPayload.methodName:"serviceaccountkey"
  OR protoPayload.methodName:"createserviceaccount"
  OR protoPayload.methodName:"denypolic"
  OR protoPayload.methodName:"workloadidentitypool"
  OR protoPayload.status.code=7
)
```

El operador `:` busca la subcadena sin distinguir mayúsculas. `status.code=7` es «permiso denegado»: **cualquier intento denegado del agente es la señal de escalada** que más importa.

Después **Acciones → Crear alerta de registro**:

| Campo | Valor |
|---|---|
| Nombre | `Agente: operación de IAM o intento denegado` |
| Gravedad | Alta |
| Tiempo entre notificaciones | 5 minutos |
| Cierre automático | 1 día |
| Canal | el de 3a |
| Documentación | `El agente hizo una operación de IAM o recibió un permiso denegado. Comprueba que coincide con una confirmación tuya. Si no, revoca la clave (RUNBOOK §3).` |

- [ ] Alerta creada en producción y en staging.
- [ ] El agente **no** tiene ningún rol de Monitoring de escritura (no se lo has dado).

**Ruido esperado:** durante la Fase 3 el agente hará legítimamente operaciones de IAM (por ejemplo, la política del bucket) y cada una te avisará. Cada aviso debería corresponder a una confirmación que tú diste. Si resulta excesivo, **sube el intervalo entre avisos**; no la desactives.

**Nombres de método:** la consulta usa subcadenas a propósito porque no se han confirmado contra entradas reales. La comprobación 13 de T041d lo confirma: si el aviso no llega, la ajustamos en ese momento.

---

## Paso 4 · Avísame (sin enviar datos sensibles)

Cuando termines, dime solo esto:

- [ ] Paso 0: organización **sí/no**, tienes `Deny Admin` **sí/no**.
- [ ] Paso 1: política creada en los dos proyectos, y qué ocurre con `denypolicies`: **admite denegación / no admite**.
- [ ] Paso 2: roles condicionados y `Project IAM Admin` retirado en los dos proyectos, sin duplicados.
- [ ] Paso 3: alerta creada en los dos proyectos.

Con eso lanzo **T041d**: el operador verifica por el MCP, en solo lectura y con una cuenta de prueba desechable, que crear claves y asumir cuentas queda denegado aunque el agente se conceda el rol, y que te llega el aviso. Hasta entonces **no empieza ninguna operación de la Fase 3**.

---

## Si algo sale mal

| Síntoma | Qué hacer |
|---|---|
| No ves la pestaña **Deny** | Te falta `Deny Admin` (o no estás en el proyecto). Vuelve al paso 0 |
| La consola no deja añadir condición a un rol | Comprueba que no es `Viewer` ni otro rol básico (esos no admiten condiciones y no se tocan) |
| El agente deja de poder hacer algo que sí necesita | Es probable que la caducidad ya haya pasado o que hayas quitado un rol de más: **no le devuelvas `Project IAM Admin`**; dime qué operación falló y lo vemos |
| Quieres cambiar la política de denegación más adelante | Solo tú, desde la pestaña **Deny**, y anotándolo en el RUNBOOK; nunca desde una operación del agente |
| Necesitas renovar los permisos pasado el 31 de octubre | Edita la condición con una fecha nueva, de forma explícita, y anótalo en el RUNBOOK |
