# Configuración de autenticación: gcloud-mcp con cuenta de servicio

`gcloud-mcp` (https://github.com/googleapis/gcloud-mcp) hereda los permisos de la cuenta `gcloud` activa en el entorno donde corre el servidor MCP (local). Por defecto, si el usuario ejecutó `gcloud auth login` con su cuenta personal, **el agente operaría con los mismos permisos que esa persona** — esto es lo que esta skill debe evitar siempre.

Existen dos formas de garantizar que las operaciones se ejecuten como una cuenta de servicio dedicada. La opción 1 (impersonación) es la recomendada.

## Opción 1 (recomendada): Impersonación de cuenta de servicio

No requiere generar ni distribuir claves JSON. La identidad de credenciales base sigue siendo la del usuario, pero **todas las llamadas a la API se ejecutan como la cuenta de servicio**, y así quedan registradas en Cloud Audit Logs.

### Pasos de configuración (una sola vez por usuario/máquina)

1. **Crear la cuenta de servicio dedicada para el operador** (si no existe), con los roles mínimos necesarios para las operaciones que va a realizar (p. ej. `roles/run.admin`, `roles/compute.admin`, `roles/iam.serviceAccountUser` sobre las SAs de runtime, etc. — nunca `roles/owner` ni `roles/editor`):

   ```bash
   gcloud iam service-accounts create gcp-operator \
     --display-name="GCP Operator (AI agent)" \
     --project=PROJECT_ID
   ```

2. **Otorgar a la cuenta personal del usuario el rol `roles/iam.serviceAccountTokenCreator`** sobre esa cuenta de servicio (esto permite impersonarla, no usarla directamente):

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     gcp-operator@PROJECT_ID.iam.gserviceaccount.com \
     --member="user:tu-email@dominio.com" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

3. **Asignar a la cuenta de servicio los roles necesarios** sobre los recursos/proyectos que el operador va a gestionar (principio de mínimo privilegio — ajustar por proyecto):

   ```bash
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:gcp-operator@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/run.admin"
   ```

4. **Configurar gcloud para impersonar la cuenta de servicio** en la configuración usada por el MCP:

   ```bash
   gcloud config set auth/impersonate_service_account gcp-operator@PROJECT_ID.iam.gserviceaccount.com
   ```

   Si quieres mantener esta configuración aislada de tu configuración personal de `gcloud`, usa una configuración (`configuration`) dedicada:

   ```bash
   gcloud config configurations create gcp-operator
   gcloud config configurations activate gcp-operator
   gcloud config set account tu-email@dominio.com
   gcloud config set project PROJECT_ID
   gcloud config set auth/impersonate_service_account gcp-operator@PROJECT_ID.iam.gserviceaccount.com
   ```

   Asegúrate de que el servidor `gcloud-mcp` se ejecuta usando esta configuración (variable de entorno `CLOUDSDK_ACTIVE_CONFIG_NAME=gcp-operator` si lo lanzas desde un proceso distinto al de tu shell habitual).

### Verificación

```bash
gcloud config get-value auth/impersonate_service_account
# debe devolver: gcp-operator@PROJECT_ID.iam.gserviceaccount.com

gcloud auth print-access-token --impersonate-service-account=gcp-operator@PROJECT_ID.iam.gserviceaccount.com
# debe devolver un token sin error de permisos
```

## Opción 2 (alternativa): Activar la cuenta de servicio con clave JSON

Solo usar si la impersonación no es viable (p. ej. la cuenta personal no puede tener `serviceAccountTokenCreator` por política organizativa). Implica gestionar una clave de larga duración, lo cual incrementa el riesgo si se filtra.

```bash
gcloud iam service-accounts keys create ~/.config/gcloud/gcp-operator-key.json \
  --iam-account=gcp-operator@PROJECT_ID.iam.gserviceaccount.com

gcloud auth activate-service-account \
  --key-file=~/.config/gcloud/gcp-operator-key.json
```

### Buenas prácticas si se usa clave JSON

- Guardar la clave fuera de cualquier repositorio (nunca en `ai-agent-skills` ni en el proyecto del usuario).
- Restringir permisos del fichero: `chmod 600 ~/.config/gcloud/gcp-operator-key.json`.
- Rotar la clave periódicamente (`gcloud iam service-accounts keys create` + `keys delete` de la antigua).
- Revisar y eliminar claves no usadas: `gcloud iam service-accounts keys list --iam-account=...`.

### Verificación

```bash
gcloud config get-value account
# debe devolver: gcp-operator@PROJECT_ID.iam.gserviceaccount.com
```

## Verificación que ejecuta la skill al inicio de cada sesión

Antes del primer comando mutante, la skill ejecuta:

```bash
gcloud config get-value account
gcloud config get-value auth/impersonate_service_account
gcloud config get-value project
```

- **Impersonación activa** (`auth/impersonate_service_account` = `*.gserviceaccount.com`) → OK.
- **Cuenta de servicio activada directamente** (`account` = `*.gserviceaccount.com`) → OK.
- **Cuenta personal sin impersonación** → la skill se detiene y remite a este documento.

## Notas

- Mantén la cuenta de servicio del operador con el mínimo de roles necesarios y revísalos periódicamente con IAM Recommender.
- Si el operador necesita actuar sobre múltiples proyectos, valora usar una cuenta de servicio por proyecto/entorno (dev/staging/prod) en lugar de una única cuenta con permisos amplios entre proyectos.
- Cloud Audit Logs registrará las acciones bajo la identidad de la cuenta de servicio (y, en el caso de impersonación, también la identidad que impersona), facilitando la trazabilidad.
