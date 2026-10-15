# Configuración de autenticación para IaC Developer

El IaC Developer opera sobre GCP usando la cuenta activa en `gcloud`. Para operaciones mutantes (apply/destroy), **nunca debe operar con credenciales personales directas** — siempre a través de una cuenta de servicio dedicada.

## Opción recomendada: impersonación de cuenta de servicio

Impersonar una cuenta de servicio sin descargar su clave. Requiere el permiso `roles/iam.serviceAccountTokenCreator` en la SA objetivo.

```bash
# Activar impersonación (persiste en la configuración activa)
gcloud config set auth/impersonate_service_account iac-operator@PROJECT_ID.iam.gserviceaccount.com

# Verificar que está activa
gcloud config get-value auth/impersonate_service_account
# → iac-operator@PROJECT_ID.iam.gserviceaccount.com

# Para Terraform: las credenciales de impersonación se heredan automáticamente
# si el provider google no especifica credentials ni access_token
```

### Desactivar impersonación cuando ya no sea necesaria

```bash
gcloud config unset auth/impersonate_service_account
```

## Opción alternativa: activar clave de cuenta de servicio

Menos recomendada (la clave es un secreto que puede filtrarse), pero útil en entornos sin permisos de impersonación.

```bash
# Descargar clave (solo si no hay otra opción)
gcloud iam service-accounts keys create iac-operator-key.json \
  --iam-account=iac-operator@PROJECT_ID.iam.gserviceaccount.com

# Activar como cuenta activa
gcloud auth activate-service-account \
  --key-file=iac-operator-key.json

# Para Terraform: apuntar al fichero de clave
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/iac-operator-key.json"
```

## Verificación rápida al inicio de la sesión

```bash
gcloud config get-value account
gcloud config get-value auth/impersonate_service_account
gcloud config get-value project
```

**La skill considera la autenticación válida si:**
- `auth/impersonate_service_account` tiene un valor `*.gserviceaccount.com`, O
- `account` termina en `.gserviceaccount.com`.

## Cuenta de servicio mínima para IaC en GCP

Roles recomendados para la SA de IaC (principio de mínimo privilegio):

| Rol | Propósito |
|---|---|
| `roles/editor` | Crear y modificar la mayoría de recursos (alternativa: roles específicos por servicio) |
| `roles/storage.admin` | Gestionar el bucket del estado remoto de Terraform |
| `roles/iam.serviceAccountUser` | Asociar SAs a recursos (Cloud Run, GKE nodes, etc.) |

Idealmente, define roles más específicos según los recursos que gestione tu IaC (evitar `roles/editor` en producción).

## Configurar backend de estado remoto (Terraform)

```hcl
# backend.tf
terraform {
  backend "gcs" {
    bucket = "tfstate-PROJECT_ID"
    prefix = "env/prod"
  }
}
```

```bash
# Crear el bucket de estado (una sola vez)
gsutil mb -p PROJECT_ID -l europe-west1 gs://tfstate-PROJECT_ID
gsutil versioning set on gs://tfstate-PROJECT_ID
```
