# Infraestructura

Terraform de la plataforma y de los entornos de MyTasks en Google Cloud. La operación manual, el
arranque único, la rotación de la clave del agente y la recuperación están en
[RUNBOOK.md](./RUNBOOK.md); empieza por ahí.

## Visión general

MyTasks vive en dos proyectos de Google Cloud, uno por entorno, sin recursos compartidos entre
ellos salvo la plataforma del pipeline:

| Entorno | Proyecto | Qué corre | Se despliega |
|---|---|---|---|
| Staging | `pdlco-mytasks-stg` | API y web en Cloud Run, Firestore, Identity Platform | al fusionar en `develop` |
| Producción | `pdlco-mytasks` | Lo mismo, más la plataforma del pipeline | al fusionar en `main` |

La **plataforma** (federación de GitHub Actions, Artifact Registry, bucket de estado y cuentas del
pipeline) vive en el proyecto de producción y la usan los dos entornos. La infraestructura la
aplica `infra.yml`; las imágenes las despliega `deploy.yml` (staging) y `deploy-production.yml`
(producción, que promueve el mismo *digest* ya validado en staging). Ninguna de las dos cosas se
hace a mano.

## Estructura

| Ruta | Qué contiene |
|---|---|
| `platform/` | Plataforma del proyecto de producción: federación de identidad, Artifact Registry, bucket de estado y cuentas `terraform-*`, `terraform-plan-*` y `deployer-production` |
| `modules/environment/` | Módulo de entorno reutilizado por staging y producción: Firestore, Identity Platform, servicios de Cloud Run y sus cuentas de ejecución, Firebase Hosting con sus dominios propios y la zona de Cloud DNS (`dns.tf`) |
| `envs/staging/` | Instancia el módulo con los valores de staging y adopta sus cuentas del pipeline |
| `envs/production/` | Lo mismo para producción |
| `iam/roles/` | Definiciones de los roles personalizados que concede el propietario (no los aplica Terraform) |

## Cómo se aplica

**Siempre por el pipeline** (`.github/workflows/infra.yml`), con aprobación del propietario en el
*environment* de GitHub correspondiente. No se ejecuta `terraform apply` a mano ni desde un agente.

- En una PR: `fmt`, `validate` y `plan` de solo lectura con las cuentas `terraform-plan-*`.
- Al fusionar en `develop` se aplica `staging`; al fusionar en `main`, `production` y `platform`.
- Antes de cada `apply`, un job `plan-<entorno>` publica el plan completo en el resumen de la
  ejecución para que el propietario lo lea antes de aprobar; `apply-<entorno>` se niega a aplicar si
  su plan tiene otra huella.

El estado vive en el bucket `pdlco-mytasks-tfstate`, con un prefijo por raíz (`platform/`,
`staging/`, `production/`). Los valores no secretos están en el `terraform.tfvars` de cada raíz.

## Protección contra borrado

Lo que no se puede recuperar está protegido dos veces: por Terraform (`prevent_destroy`, que hace
fallar cualquier plan que lo destruya) y por el propio recurso cuando Google Cloud lo ofrece.

| Recurso | Protección |
|---|---|
| Base de datos Firestore de cada entorno (las tareas del propietario) | `prevent_destroy` y `DELETE_PROTECTION_ENABLED` |
| Servicios de Cloud Run `mytasks-api` y `mytasks-web` | `deletion_protection` |
| Bucket de estado, repositorio de Artifact Registry, pool y proveedor de federación (`platform/`) | `prevent_destroy` (un nombre de pool borrado no se puede reutilizar en 30 días y el pipeline perdería su acceso) |

Retirar un entorno es una decisión manual y deliberada: hay que levantar **las dos** protecciones
antes de destruir. El procedimiento está en el [RUNBOOK](./RUNBOOK.md).

## Versiones

Terraform `>= 1.9, < 2.0` y proveedores `hashicorp/google` y `hashicorp/google-beta` en `~> 8.6.0`.
El fichero `.terraform.lock.hcl` de cada raíz se versiona y fija las versiones exactas y sus sumas
de comprobación; se actualiza solo con una PR propia.

### El proveedor `google-beta` y Firebase Hosting

El proveedor GA `hashicorp/google` **no tiene** los recursos de Firebase Hosting
(`google_firebase_hosting_*`; el binario del proveedor solo trae `google_firebase_app_hosting_*`, que es
otro producto). Solo existen en `hashicorp/google-beta`, por eso el módulo `environment` lo declara junto
al GA y cada raíz lo configura igual que a él (`providers.tf`). Reglas para no ampliar su uso sin querer:

- Se usa **únicamente** en `modules/environment/hosting.tf` (con `provider = google-beta`): la versión y el
  *release* de Hosting y los dominios personalizados (feature 005). La zona de Cloud DNS y sus registros
  (`dns.tf`) van en el proveedor GA. Todo lo demás sigue
  en el proveedor GA.
- Va fijado a la **misma línea que el GA** (`~> 8.6.0`). Su *lockfile* es idéntico en `staging` y
  `production` (lo exige `.github/scripts/tests/test_env_roots_parity.py`) y coincide con el de
  `platform`, que ya usaba este proveedor.
- Al subir el GA, se sube también el beta, en la misma PR. Un recurso beta puede cambiar entre versiones: el
  plan de solo lectura de `infra.yml` en cada PR es lo que lo detecta.
- El sitio de Hosting por defecto **no se declara**: Firebase lo crea solo, no se puede cambiar ni borrar,
  y Terraform lo referencia por su identificador (`hosting_site_id`, el id del proyecto).
