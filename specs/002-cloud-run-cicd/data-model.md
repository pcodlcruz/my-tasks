# Data Model: Infraestructura en Google Cloud y pipeline CI/CD

**Feature**: `002-cloud-run-cicd` | **Fecha**: 2026-09-29 | **Research**: [research.md](./research.md)

Esta feature **no cambia el modelo de datos de la aplicación** (Firestore, `users/{uid}/tasks`,
ver la [feature 001](../001-eisenhower-task-manager/data-model.md)). Lo que sigue traduce las
*Key Entities* de la spec a recursos concretos, con sus nombres y relaciones. No incluye
definiciones de IaC.

## Entorno

Contexto aislado de la aplicación. Existen dos: `staging` y `production`.

| Atributo | staging | production |
|---|---|---|
| Proyecto de Google Cloud | `pdlco-mytasks-stg` (provisional, por crear) | `pdlco-mytasks` (existente; también aloja la plataforma) |
| Rama(s) que lo despliegan | `develop`, `release/*`, `hotfix/*` | `main` |
| *Environment* de GitHub | `staging` | `production` |
| Región | `europe-southwest1` | `europe-southwest1` |
| Base de datos Firestore | propia, modo nativo | propia, modo nativo |
| Instancias máximas API / web | 2 / 2 | 5 / 5 |
| Instancias mínimas | 0 | 0 |

Regla de paridad (Principio IV): todo lo demás lo define el mismo módulo; solo pueden variar
estos valores y los identificadores propios del entorno.

Plataforma (en el proyecto de producción `pdlco-mytasks`, decisión del propietario): identidad del
agente, federación de identidad de GitHub, Artifact Registry y estado de Terraform. Es el único
recurso compartido entre entornos; no contiene datos de aplicación. Como convive con producción,
sus permisos se conceden a nivel de recurso y solo se administra por Terraform con aprobación.

## Servicio de aplicación

Dos por entorno.

| Servicio | Nombre en Cloud Run | Identidad de ejecución | Acceso | Puerto |
|---|---|---|---|---|
| Frontend | `mytasks-web` | `mytasks-web-run-<env>` (sin roles) | invocación anónima de plataforma | 8080 |
| API | `mytasks-api` | `mytasks-api-run-<env>` (`roles/datastore.user`) | invocación anónima de plataforma; datos con token | 8080 |

- URL: `https://<servicio>-<número de proyecto>.europe-southwest1.run.app` (determinista).
- Estados de una revisión: `sin tráfico y etiquetada` → (humo OK) → `sirviendo` → `retirada`.
  Una revisión que falla las pruebas de humo permanece `sin tráfico` y no sustituye a la activa.

## Versión desplegada

Artefacto inmutable por componente.

| Atributo | Descripción |
|---|---|
| Repositorio | Artifact Registry `mytasks` (proyecto de producción), imágenes `mytasks-api` y `mytasks-web` |
| Identificador | hash de árbol de Git de `backend/` o `frontend/` (etiqueta `<hash>`) |
| Marca de validación | etiqueta `validated-<hash>`, añadida tras superar el humo en staging |
| Resumen (digest) | el que se despliega en ambos entornos (no se reconstruye) |
| Inmutabilidad | las etiquetas no se mueven ni se borran |

Transición: `construida` → `desplegada en staging` → `validada` → `promovida a producción`.
Producción solo acepta versiones `validadas`.

## Ejecución de pipeline

| Workflow | Disparador | Entorno destino | Resultado |
|---|---|---|---|
| `ci.yml` | PR a `develop`, `main`, `release/*`, `hotfix/*` | ninguno | checks requeridos |
| `deploy-staging.yml` | push a `develop`, `release/*`, `hotfix/*` | `staging` | despliegue o fallo |
| `deploy-production.yml` | push a `main` | `production` | despliegue o fallo |
| `infra.yml` | cualquier PR (plan de solo lectura; el job se omite sin cambios en `infra/**`) y push con cambios en `infra/**` (apply con aprobación) | `infra-*` | plan/apply |

Cada ejecución queda asociada a un commit, una rama, un entorno y un resultado (FR-017)
mediante los despliegues de GitHub y las etiquetas de la revisión de Cloud Run.
Concurrencia: un grupo por entorno; nunca dos despliegues a la vez y gana el más reciente
(FR-019).

## Identidades

Ver la matriz completa en [contracts/environments.md](./contracts/environments.md) (identidades,
roles y quién puede usarlas).

## Secreto / configuración de entorno

| Elemento | Naturaleza | Dónde vive |
|---|---|---|
| Configuración web de Firebase (clave de API pública, dominio de autenticación, proyecto) | pública | variables del servicio `mytasks-web`, servida en `/config.js` |
| URL de la API | pública | variable del servicio `mytasks-web` |
| `APP_ENV`, `GOOGLE_CLOUD_PROJECT`, `CORS_ORIGINS`, `APP_VERSION` | no sensible | variables del servicio `mytasks-api` |
| Cliente OAuth de Google | sensible | Identity Platform, configuración manual única (research R8) |
| Clave de la cuenta de servicio del agente | sensible | fuera del repo, en el almacén aislado local del propietario |
| Secretos de aplicación | ninguno | — (Secret Manager queda habilitado sin uso) |

## Validaciones y reglas derivadas de la spec

- Un entorno no contiene referencias a recursos de otro (FR-009, SC-009): el módulo de entorno no
  acepta identificadores del proyecto del otro entorno (salvo el repositorio de imágenes, que
  staging solo puede leer y al que solo puede publicar).
- La API en `APP_ENV=staging|production` rechaza arrancar con variables de emulador o con
  proyecto `demo-*` (ya implementado en la feature 001, `config.py`); el pipeline lo aprovecha
  como comprobación de arranque.
- Solo `deployer-<env>` puede crear revisiones de Cloud Run (FR-013, SC-003).
