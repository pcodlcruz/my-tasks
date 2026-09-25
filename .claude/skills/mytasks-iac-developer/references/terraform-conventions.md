# Convenciones Terraform/OpenTofu — IaC Developer

## Estructura de directorios

```
infrastructure/
├── modules/              # Módulos reutilizables (sin estado propio)
│   ├── cloud-run/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── versions.tf
│   └── gcs-bucket/
│       └── ...
├── environments/
│   ├── dev/
│   │   ├── main.tf       # Llama a módulos con valores de dev
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   ├── staging/
│   │   └── ...
│   └── prod/
│       └── ...
└── shared/               # Recursos compartidos entre entornos (VPC, DNS)
    └── ...
```

## Archivo versions.tf (obligatorio en cada módulo/entorno)

```hcl
terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0, < 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 5.0, < 6.0"
    }
  }
}
```

## Convenciones de nombrado

| Recurso | Patrón | Ejemplo |
|---|---|---|
| Resources Terraform | `snake_case` | `google_cloud_run_v2_service` |
| Variables | `snake_case` | `var.min_instance_count` |
| Outputs | `snake_case` | `output.service_url` |
| Módulos | `kebab-case` en directorio, `snake_case` en llamada | `module "cloud_run_api"` |
| Recursos GCP | `<tipo>-<env>-<región>-<nombre>` | `cr-prod-eu-west1-api` |

## Variables: obligatorias vs opcionales

```hcl
# Obligatoria — sin default
variable "project_id" {
  description = "GCP project ID where resources are deployed."
  type        = string
}

# Opcional explícita — default = null
variable "min_instance_count" {
  description = "Minimum number of instances. Null uses the provider default."
  type        = number
  default     = null
}

# Opcional con valor por defecto útil
variable "region" {
  description = "GCP region for resource deployment."
  type        = string
  default     = "europe-west1"
}
```

## Outputs

```hcl
output "service_url" {
  description = "Public URL of the Cloud Run service."
  value       = google_cloud_run_v2_service.main.uri
}

output "service_account_email" {
  description = "Email of the service account used by the Cloud Run service."
  value       = google_service_account.runner.email
  sensitive   = false  # Explícito aunque sea el valor por defecto
}

# Outputs sensibles
output "db_password" {
  description = "Database password (sensitive)."
  value       = random_password.db.result
  sensitive   = true
}
```

## Locals: cuándo usarlos

```hcl
locals {
  # Construir nombres compuestos una sola vez
  name_prefix = "${var.environment}-${var.region}"

  # Labels comunes para todos los recursos
  common_labels = {
    environment = var.environment
    managed_by  = "terraform"
    team        = var.team
  }
}

resource "google_storage_bucket" "assets" {
  name   = "${local.name_prefix}-assets"
  labels = local.common_labels
}
```

## Gestión de secretos

- **Nunca** escribir valores sensibles como strings literales en archivos `.tf`.
- Usar `google_secret_manager_secret_version` data source para leer secrets de GCP.
- Variables sensibles: usar `sensitive = true` en la declaración.
- En `terraform.tfvars`: marcar como secreto en el sistema de CI/CD (no subir a git si contiene valores reales).

```hcl
# ✅ Correcto: leer desde Secret Manager
data "google_secret_manager_secret_version" "db_password" {
  secret  = "db-password"
  project = var.project_id
}

# ❌ Incorrecto: valor hardcodeado
resource "google_sql_database_instance" "main" {
  root_password = "my-hardcoded-password"  # NUNCA
}
```

## Formato y validación

```bash
# Siempre antes de hacer commit o proponer cambios
terraform fmt -recursive
terraform validate

# Para módulos nuevos: verificar con un plan en entorno de dev primero
terraform plan -var-file=environments/dev/terraform.tfvars
```

## Workspaces vs directorios de entorno

- **Preferir directorios de entorno** (`environments/dev/`, `environments/prod/`) sobre workspaces para entornos con configuraciones significativamente diferentes.
- **Usar workspaces** solo para variaciones menores del mismo código (p. ej. feature branches efímeros, pruebas A/B de infraestructura).
- Nunca usar el workspace `default` para cargas de trabajo reales.

## Tags y labels obligatorias en GCP

```hcl
locals {
  mandatory_labels = {
    environment = var.environment      # dev | staging | prod
    managed_by  = "terraform"
    project     = var.project_id
    team        = var.team
  }
}
```

## Manejo de dependencias entre módulos

```hcl
# Usar outputs explícitos para pasar referencias entre módulos
module "network" {
  source     = "../../modules/vpc"
  project_id = var.project_id
}

module "cloud_run_api" {
  source             = "../../modules/cloud-run"
  project_id         = var.project_id
  vpc_connector_name = module.network.vpc_connector_name  # referencia explícita
}
```

No usar `depends_on` entre módulos si una referencia de output puede expresar la dependencia — Terraform la infiere automáticamente.
