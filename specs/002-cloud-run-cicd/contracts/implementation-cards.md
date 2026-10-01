# Fichas de Implementación

**Feature**: `002-cloud-run-cicd` | **Plan**: [../plan.md](../plan.md)

Una ficha por componente delegable. Las fichas no contienen código ni comandos; los agentes o
skills que las reciben los producen. Todas las ramas siguen el ciclo de la constitución:
`feature/002-cloud-run-cicd-fase-N` desde `origin/develop`, una PR por fase, fusionada por el
propietario.

---

## Ficha 1 — Identidad aislada del agente (MCP de Google Cloud)

**Agente/Skill recomendado**: `mytasks-google-cloud-operator` (verificación y arranque) con el
skill `update-config` para `settings.json` y hooks; revisión obligatoria con `mytasks-security-auditor`.
**Componente**: sustituir la suplantación actual por un almacén aislado con la identidad del
agente y bloquear técnicamente las credenciales personales.
**Fase**: 1

### Qué debe construir
Todo lo descrito en [agent-identity.md](./agent-identity.md): `.mcp.json` con el directorio de
configuración aislado, retirada del servidor de ámbito usuario, sandbox y denegaciones de
lectura, hook de guardia con registro de rechazos, y la lista de verificación repetible.

### Restricciones de arquitectura (no negociables)
- Sin secretos ni rutas personales absolutas en el repositorio.
- Sin suplantación de cuentas: la clave es de la propia cuenta del agente (clarificación).
- La regla `deny` de `gcloud`/`gsutil`/`bq` se conserva.
- El agente no crea ni rota la clave: lo hace el propietario.
- Comprobar antes qué bloquea ya `gcloud-mcp` y qué nombres de sandbox admite Claude Code.

### Interfaces y contratos
- **Entrada**: clave creada por el propietario (Fase 0).
- **Salida**: MCP operativo solo con la identidad del agente; lista de verificación en verde.
- **Dependencias**: Fase 0.

### Criterios de aceptación
- [ ] Las 9 comprobaciones de la tabla de verificación pasan.
- [ ] No existe ningún servidor MCP de Google Cloud con credenciales personales.
- [ ] El registro de auditoría muestra solo a `mytasks-ai-agent` (FR-024).
- [ ] Informe de `mytasks-security-auditor` sin hallazgos bloqueantes.

### Rama GitFlow
`feature/002-cloud-run-cicd-fase-1`; PR destino: `develop`.

---

## Ficha 2 — Backend desplegable

**Agente/Skill recomendado**: `mytasks-backend-developer`
**Componente**: imagen de contenedor de la API (Buildpacks) y endpoints de disponibilidad.
**Fase**: 2

### Qué debe construir
- Subir el backend a **Python 3.13** (`requires-python`, target de ruff y mypy) y comprobar que
  lint, mypy estricto y todos los tests siguen en verde.
- Imagen de la API con **Buildpacks de Google Cloud**, sin Dockerfile: `backend/project.toml` con
  `GOOGLE_ENTRYPOINT` (Uvicorn en `PORT`, 8080), dependencias desde `uv.lock` y `pyproject.toml`,
  builder fijado por digest o versión **dentro de `backend/`** (así subirlo cambia el hash y
  reconstruye la imagen). Usuario sin privilegios, sin variables de entorno
  incrustadas ni ficheros `.env`. Verificar los puntos (a)–(e) de research R13 y dejar el
  resultado en la PR; si alguno falla sin remedio, proponer un Dockerfile justificado (riesgo R-8).
- `GET /healthz` incluye `version` (de `APP_VERSION`); `GET /readyz` hace una lectura mínima de
  Firestore y responde `200` o `503`. Ambos anónimos y sin datos.
- `APP_VERSION` en `config.py` con valor por defecto para local.
- `backend/scripts/export_openapi.py`, con su test, que vuelca el contrato OpenAPI de la API para
  el check `api-contract-compat`.
- Tests: unitario de la configuración; integración de `/healthz` y `/readyz` contra el emulador
  (Principio II).

### Restricciones de arquitectura (no negociables)
- Los endpoints de datos siguen exigiendo token; `/healthz` y `/readyz` no exponen datos ni
  detalles internos.
- La API sigue negándose a arrancar con variables de emulador o proyecto `demo-*` en
  staging/producción (ya implementado).
- Cambios aditivos en el contrato (compatibles hacia atrás).

### Interfaces y contratos
- **Entrada**: variables de [environments.md](./environments.md).
- **Salida**: imagen `mytasks-api` y endpoints de disponibilidad.
- **Dependencias**: ninguna.

### Criterios de aceptación
- [ ] `pack build` produce la imagen sin Dockerfile, arranca con las variables de un entorno y
      responde en `/healthz`, sin privilegios y sin `.env` dentro.
- [ ] `/readyz` devuelve `503` sin acceso a Firestore y `200` con acceso.
- [ ] Tests unitarios e integración en verde; lint y mypy estrictos limpios.

### Rama GitFlow
`feature/002-cloud-run-cicd-fase-2`; PR destino: `develop`.

---

## Ficha 3 — Frontend desplegable

**Agente/Skill recomendado**: `mytasks-frontend-developer`
**Componente**: imagen de contenedor del frontend y configuración en tiempo de ejecución.
**Fase**: 2

### Qué debe construir
- Imagen: build de Vite y servidor Nginx sin privilegios en el puerto 8080; fallback de rutas a
  `index.html` (React Router), caché larga para los recursos con hash y sin caché para
  `index.html` y `config.js`, cabeceras de seguridad (CSP compatible con Firebase Auth y con la
  URL de la API del entorno, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`).
- Al arrancar, el contenedor genera `/config.js` con `window.__APP_CONFIG__` a partir de
  variables de entorno ([environments.md](./environments.md)); el arranque falla con mensaje
  claro si falta una obligatoria.
- `runtimeConfig` con respaldo a `import.meta.env` para desarrollo y e2e locales; `firebase.ts` y
  `apiClient.ts` pasan a usarlo sin cambiar su comportamiento.
- Tests: unitarios de `runtimeConfig`; el e2e de Playwright existente sigue pasando sin cambios.

### Restricciones de arquitectura (no negociables)
- La imagen es **idéntica** en staging y producción: nada del entorno se incrusta en la
  compilación.
- `USE_EMULATORS` y `__mytasksTestLogin` no deben poder activarse fuera de local.
- Sin secretos en `config.js` (todo lo que contiene es público).

### Interfaces y contratos
- **Entrada**: variables de entorno del servicio.
- **Salida**: imagen `mytasks-web`, `/config.js`.
- **Dependencias**: ninguna.

### Criterios de aceptación
- [ ] Una sola imagen sirve en dos entornos cambiando solo las variables.
- [ ] `/config.js` refleja el entorno y no es cacheable.
- [ ] El acceso directo a rutas internas (`/history`) devuelve la SPA.
- [ ] Vitest, ESLint, `tsc` y Playwright en verde.

### Rama GitFlow
`feature/002-cloud-run-cicd-fase-2`; PR destino: `develop`.

---

## Ficha 4 — Workflows de CI y de despliegue

**Agente/Skill recomendado**: ninguno de rol cubre GitHub Actions. Se hace manualmente y se
justifica en la PR (Principio VIII); alternativamente el propietario puede asignar
`mytasks-iac-developer`.
**Componente**: `ci.yml`, `deploy.yml`, `deploy-staging.yml`, `deploy-production.yml`, `infra.yml`.
**Fase**: 2 (CI), 4 (staging), 5 (producción), 3 (infra)

### Qué debe construir
Exactamente lo definido en [pipeline.md](./pipeline.md): checks con los nombres estables,
identificación por hash de árbol, promoción con `validated-<hash>`, despliegue en dos pasos,
pruebas de humo, cambio de tráfico ordenado y reversión, concurrencia por entorno, aprobación en
`infra.yml`, notificaciones y registro de despliegues.

### Restricciones de arquitectura (no negociables)
- Sin claves ni secretos de Google Cloud en GitHub: solo federación de identidad.
- Acciones de terceros fijadas por SHA; permisos del token mínimos.
- Ninguna PR puede alcanzar una identidad de despliegue.
- Un cambio sin imagen validada no llega a producción (sin despliegue manual de emergencia).

### Interfaces y contratos
- **Entrada**: identidades y entornos de [environments.md](./environments.md).
- **Salida**: checks requeridos y despliegues automáticos.
- **Dependencias**: Ficha 5 (federación) para todo lo que se autentica; Fichas 2 y 3 para las
  imágenes.

### Criterios de aceptación
- [ ] Cada job de la tabla de checks existe con su nombre y falla cuando corresponde.
- [ ] Un despliegue con humo fallido no cambia el tráfico.
- [ ] Dos ejecuciones solapadas nunca despliegan a la vez.
- [ ] Producción rechaza un hash sin `validated-`.
- [ ] `api-contract-compat` falla ante un cambio incompatible del contrato de la API.
- [ ] `deploy.yml` no despliega si `ci.yml` falla.

### Rama GitFlow
Una rama por fase (`feature/002-cloud-run-cicd-fase-N`); PR destino: `develop`.

---

## Ficha 5 — Terraform: plataforma (en el proyecto de producción) y arranque

**Agente/Skill recomendado**: `mytasks-iac-developer` (código); `mytasks-google-cloud-operator`
(arranque único vía MCP, con confirmación explícita del propietario en cada cambio).
**Componente**: `infra/platform`: estado, federación de identidad, Artifact Registry, identidades
`terraform-*` y `deployer-*`, todo en el proyecto `pdlco-mytasks` (producción).
**Fase**: 3

### Qué debe construir
- Bucket de estado versionado y con acceso uniforme.
- *Pool* y proveedor de federación de GitHub con condición por propietario y repositorio (ids
  numéricos) y vinculaciones por *environment* (research R3); sin comodines.
- Artifact Registry `mytasks` en la región, con etiquetas inmutables; permiso de lectura para el
  agente de servicio de Cloud Run de staging y de escritura solo para `deployer-staging`
  (concedidos sobre el repositorio, no sobre el proyecto).
- Permisos a nivel de recurso: producción comparte proyecto con la plataforma, así que ningún rol
  de despliegue se concede a nivel de proyecto.
- Identidades `terraform-*`, `terraform-plan-*` (solo lectura, federadas a `pull_request`) y
  `deployer-*` con los roles de [environments.md](./environments.md).
- `.terraform.lock.hcl` versionado en cada raíz y proveedores con versión fijada (Principio III).
- Retirada de los permisos temporales del agente al terminar el arranque (runbook).

### Restricciones de arquitectura (no negociables)
- Terraform solo se aplica por `infra.yml` con aprobación; el arranque mínimo (recursos sin los
  que el pipeline no puede existir) se hace una vez con el MCP y se adopta después por importación.
  Como `platform` solo se aplica desde `main`, ese arranque incluye **todo lo que staging necesita
  antes de la primera release**: Artifact Registry, `deployer-*` con sus permisos a nivel de
  recurso y la lectura del repositorio para el agente de servicio de Cloud Run de staging.
- Sin `roles/owner`/`roles/editor`; sin claves para las identidades del pipeline.
- `prevent_destroy` en el bucket de estado, el repositorio de Artifact Registry y el *pool* y
  proveedor de federación: un plan que los destruya falla antes de llegar a la aprobación.
- Región `europe-southwest1`.

### Interfaces y contratos
- **Entrada**: proyecto de staging creado y con facturación (Fase 0); Fase 1 completada.
- **Salida**: federación operativa, registro de imágenes, estado remoto.
- **Dependencias**: Fase 0 y Fase 1.

### Criterios de aceptación
- [ ] `plan` sin cambios tras adoptar el arranque.
- [ ] Un job de GitHub en una rama no permitida no obtiene credenciales.
- [ ] Un `plan` que destruye el estado, el registro o la federación falla por `prevent_destroy`.
- [ ] Revisión de `mytasks-security-auditor` sobre IAM y federación sin bloqueantes.

### Rama GitFlow
`feature/002-cloud-run-cicd-fase-3`; PR destino: `develop`.

---

## Ficha 6 — Terraform: módulo de entorno, staging y producción

**Agente/Skill recomendado**: `mytasks-iac-developer`
**Componente**: `infra/modules/environment`, `infra/envs/staging`, `infra/envs/production`.
**Fase**: 4 (staging) y 5 (producción)

### Qué debe construir
Los recursos por entorno listados en [environments.md](./environments.md): APIs, Firestore
nativo, política TTL de `purge_at` sobre `tasks`, los tres índices de `firestore.indexes.json`,
Identity Platform con dominios autorizados del frontend, cuentas de ejecución, los dos servicios de
Cloud Run con URL/variables/límites/invocación, y presupuesto (Fase 6).

### Restricciones de arquitectura (no negociables)
- Un único módulo para ambos entornos: solo varían dimensionado e identificadores.
- Los servicios se crean con una imagen de marcador inicial y luego los gestiona el pipeline:
  Terraform **no** debe revertir lo que fija el pipeline: la imagen, el tráfico, la variable
  `APP_VERSION` y las etiquetas de revisión (`commit`, `tree-hash`, `pipeline-run`); ignorar esos
  atributos con `ignore_changes`.
- Sin recursos que referencien el otro entorno.
- Protección contra borrado: `deletion_protection` activado en la base de datos Firestore y en los
  dos servicios de Cloud Run de **ambos** entornos, y `prevent_destroy` en la base de datos.
  Retirarla exige una PR propia y aprobada que solo desactive la protección (paso previo y
  separado del borrado); así un `destroy` accidental de datos no pasa en un solo `apply`.
- Nombres de servicio cortos para conservar la URL determinista (≤ 63 caracteres en el segmento).

### Interfaces y contratos
- **Entrada**: federación e identidades de la Ficha 5.
- **Salida**: entornos listos para que el pipeline despliegue; URL previsibles.
- **Dependencias**: Ficha 5.

### Criterios de aceptación
- [ ] La comparación de los dos entornos solo muestra diferencias de dimensionado e identificadores.
- [ ] Un despliegue del pipeline no genera diferencias en el siguiente `plan`.
- [ ] TTL e índices coinciden con la feature 001.
- [ ] Un `plan` que borra Firestore o un servicio falla mientras la protección está activa.
- [ ] Un entorno se recrea desde cero sin pasos no documentados salvo el proveedor de Google (R-2)
      y, para destruirlo antes, la PR que retira la protección contra borrado.

### Rama GitFlow
`feature/002-cloud-run-cicd-fase-4` y `-fase-5`; PR destino: `develop`.

---

## Ficha 7 — Operación real (arranque y verificación)

**Agente/Skill recomendado**: `mytasks-google-cloud-operator`
**Componente**: acciones reales sobre Google Cloud que no pasan por el pipeline: arranque único,
verificación de identidad y lectura de estado.
**Fase**: 1, 3, 6

### Qué debe construir
Ejecución supervisada, siempre por el MCP con la cuenta del agente y confirmación explícita del
propietario en cada cambio, del arranque de la Ficha 5, y las verificaciones de solo lectura de
[../quickstart.md](../quickstart.md). El despliegue de la aplicación **no** es de este skill: es
solo del pipeline (Principio VI).

### Restricciones de arquitectura (no negociables)
- Nada de credenciales personales ni de `gcloud` directo.
- Ningún despliegue manual a staging o producción.
- Cada permiso temporal concedido se retira y se anota en el runbook.

### Criterios de aceptación
- [ ] Arranque completado y permisos temporales retirados.
- [ ] Verificaciones de solo lectura en verde.

### Rama GitFlow
La de la fase que corresponda.
