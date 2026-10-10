# Infraestructura

Terraform de la plataforma y de los entornos de MyTasks en Google Cloud. La operación manual, el
arranque único, la rotación de la clave del agente y la recuperación están en
[RUNBOOK.md](./RUNBOOK.md); empieza por ahí.

## Estructura

| Ruta | Qué contiene | Estado |
|---|---|---|
| `platform/` | Plataforma del proyecto de producción: federación de identidad, Artifact Registry, estado y cuentas del pipeline | esqueleto (T050) |
| `modules/environment/` | Módulo de entorno reutilizado por staging y producción | Fase 4 |
| `envs/staging/`, `envs/production/` | Instancias del módulo con los valores de cada entorno | Fases 4 y 5 |

## Cómo se aplica

**Siempre por el pipeline** (`.github/workflows/infra.yml`), con aprobación del propietario en el
*environment* de GitHub correspondiente. No se ejecuta `terraform apply` a mano ni desde un agente.

- En una PR: `fmt`, `validate` y `plan` de solo lectura con las cuentas `terraform-plan-*`.
- Al fusionar en `develop` se aplica `staging`; al fusionar en `main`, `production` y `platform`.

El estado vive en el bucket `pdlco-mytasks-tfstate`, con un prefijo por raíz (`platform/`,
`staging/`, `production/`). Los valores no secretos están en el `terraform.tfvars` de cada raíz.

## Versiones

Terraform `>= 1.9, < 2.0` y proveedores `hashicorp/google` y `hashicorp/google-beta` en `~> 8.6.0`.
El fichero `.terraform.lock.hcl` de cada raíz se versiona y fija las versiones exactas y sus sumas
de comprobación; se actualiza solo con una PR propia.
