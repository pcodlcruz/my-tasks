# Contrato de entornos, variables e identidades

**Feature**: `002-cloud-run-cicd` | **Plan**: [../plan.md](../plan.md) | **Modelo**: [../data-model.md](../data-model.md)

## Interfaces entre componentes

| De | A | Cómo | Notas |
|---|---|---|---|
| Navegador | `mytasks-web` | HTTPS, URL `run.app` | Sirve la SPA y `/config.js` |
| Navegador | `mytasks-api` | HTTPS con `Authorization: Bearer <ID token>` | CORS: solo el origen del `mytasks-web` de su entorno |
| Navegador | Identity Platform | SDK de Firebase Auth (Google) | El dominio del frontend figura en los dominios autorizados |
| `mytasks-api` | Firestore | Librería oficial con la identidad de ejecución | Solo su base de datos del entorno |
| `mytasks-api` | Identity Platform | Verificación del ID token con el proyecto del entorno | Requiere `GOOGLE_CLOUD_PROJECT` real (no `demo-*`) |

Contrato de la API: sin cambios respecto a
[../../001-eisenhower-task-manager/contracts/openapi.yaml](../../001-eisenhower-task-manager/contracts/openapi.yaml),
salvo los dos cambios de despliegue siguientes.

### Cambios de contrato de la API

| Endpoint | Cambio | Auth | Motivo |
|---|---|---|---|
| `GET /healthz` | añade el campo `version` (valor de `APP_VERSION`) | anónimo, sin datos | US4, humo de despliegue |
| `GET /readyz` (nuevo) | `200` si la lectura mínima de Firestore funciona; `503` si no | anónimo, sin datos | FR-016 |

Ambos son cambios aditivos (compatibles hacia atrás).

## Variables de entorno por servicio

### `mytasks-api`

| Variable | staging | production | Notas |
|---|---|---|---|
| `APP_ENV` | `staging` | `production` | `config.py` lo valida (falla cerrado) |
| `GOOGLE_CLOUD_PROJECT` | id del proyecto de staging | id del proyecto de producción | nunca `demo-*` |
| `CORS_ORIGINS` | URL de `mytasks-web` de staging | URL de `mytasks-web` de producción | una sola |
| `APP_VERSION` | hash de árbol del componente | ídem | lo fija el pipeline al desplegar; Terraform la ignora (`ignore_changes`) para no revertirla |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | **no definidas** | **no definidas** | la API se niega a arrancar si existen |

### `mytasks-web` (se sirve en `/config.js`)

| Variable | Contenido |
|---|---|
| `API_BASE_URL` | URL de `mytasks-api` del mismo entorno |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` | configuración web pública del proyecto del entorno |
| `APP_VERSION` | versión del frontend |
| `USE_EMULATORS` | siempre `false` fuera de local |

Requisito de Firebase: `FIREBASE_AUTH_DOMAIN` es el dominio de autenticación del proyecto del
entorno; la SPA no debe poder apuntar al proyecto de otro entorno (FR-014).

## Matriz de identidades

| Identidad | Proyecto | Quién la usa | Puede | No puede |
|---|---|---|---|---|
| `mytasks-ai-agent` | producción (plataforma) | El agente, solo por el MCP | Leer estado y registros de los dos proyectos; en el arranque, lo que el propietario conceda temporalmente | Desplegar, aplicar Terraform, administrar IAM (tras el arranque) |
| `deployer-staging` | staging | `deploy-staging.yml` (federación) | Crear revisiones y cambiar tráfico de los dos servicios de staging; publicar y leer imágenes en el repositorio (proyecto de producción) | Tocar los servicios, el IAM o los datos de producción; tocar Firestore |
| `deployer-production` | producción | `deploy-production.yml` (federación) | Crear revisiones y cambiar tráfico de los dos servicios de producción; leer imágenes | Tocar staging; publicar imágenes nuevas (solo promueve las validadas) |
| `terraform-staging` | staging | `infra.yml` (federación, con aprobación) | Aplicar la infraestructura de la raíz `staging` | Actuar fuera del proyecto de staging |
| `terraform-production` | producción | `infra.yml` (federación, con aprobación) | Aplicar las raíces `production` y `platform` | Actuar en el proyecto de staging |
| `terraform-plan-staging` | staging | `infra.yml`, job `terraform-validate` en PR (federación al evento `pull_request`) | Leer el proyecto de staging y su estado de Terraform | Escribir, administrar IAM, actuar en producción |
| `terraform-plan-production` | producción | `infra.yml`, job `terraform-validate` en PR (federación al evento `pull_request`) | Leer el proyecto de producción, la plataforma y sus estados | Escribir, administrar IAM, actuar en staging |
| `mytasks-api-run-<env>` | del entorno | Servicio `mytasks-api` | Leer y escribir Firestore de su proyecto | Cualquier otra cosa |
| `mytasks-web-run-<env>` | del entorno | Servicio `mytasks-web` | Nada más que servir contenido | Cualquier otra cosa |
| Agente de servicio de Cloud Run de staging | staging | Plataforma | Leer imágenes del repositorio (proyecto de producción) | — |

Reglas:
- Ninguna cuenta de servicio tiene `roles/owner` ni `roles/editor`.
- Como producción comparte proyecto con la plataforma, los roles de despliegue se conceden sobre
  el servicio, la cuenta de ejecución o el repositorio concretos, no sobre todo el proyecto.
- Momento de concesión: los permisos de `deployer-*` sobre el repositorio de imágenes se conceden
  en el arranque (Fase 3); los de `roles/run.developer` sobre cada servicio y
  `roles/iam.serviceAccountUser` sobre las cuentas de ejecución, en el módulo de entorno
  (Fase 4), cuando esos recursos existen.
- Solo `terraform-production` puede administrar la federación de identidad y el repositorio.
- Las identidades de despliegue y de Terraform solo son suplantables por la federación de GitHub,
  vinculada al *environment* correspondiente; no hay claves para ellas. Las `terraform-plan-*` se
  vinculan al evento `pull_request` del repositorio propio y son de solo lectura.
- La única clave de larga duración del sistema es la de `mytasks-ai-agent` (FR-025).
- Los permisos de arranque temporales de `mytasks-ai-agent` se retiran al terminar el arranque
  (runbook) y el agente queda de solo lectura.

## Recursos por entorno (lista de comprobación de la Ficha de Terraform)

Habilitación de APIs necesarias; base de datos Firestore nativa en la región; política TTL de
`purge_at` en `tasks`; los tres índices de `firestore.indexes.json`; Identity Platform con los
dominios autorizados del frontend; cuentas de ejecución y de despliegue con sus roles; dos
servicios de Cloud Run con sus límites de instancias, variables y permiso de invocación;
permiso de lectura del repositorio para el agente de servicio de Cloud Run; presupuesto con
alertas (Fase 6). Sin VPC, balanceador ni dominio propio.

## Reglas de aislamiento verificables (SC-009)

1. Ninguna variable, permiso ni recurso de un entorno referencia el proyecto del otro, con una
   única excepción acotada: el repositorio de imágenes (en el proyecto de producción), que staging
   lee y en el que publica, sin acceso a nada más de producción.
2. Los datos creados en staging no existen en producción y viceversa (quickstart, escenario 5).
3. La API de un entorno rechaza tokens emitidos por el proyecto del otro (verificación del
   proyecto emisor).
