---

description: "Lista de tareas de implementación de la feature 002-cloud-run-cicd"
---

# Tasks: Infraestructura en Google Cloud y pipeline CI/CD

**Input**: documentos de diseño de `specs/002-cloud-run-cicd/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/pipeline.md](./contracts/pipeline.md),
[contracts/environments.md](./contracts/environments.md),
[contracts/agent-identity.md](./contracts/agent-identity.md),
[contracts/implementation-cards.md](./contracts/implementation-cards.md),
[quickstart.md](./quickstart.md)

**Tests**: **obligatorios** por el Principio II de la constitución (NON-NEGOTIABLE) para el código
nuevo (hook de identidad, endpoints de disponibilidad, exportación del contrato, configuración en
runtime del frontend). Se escriben primero y deben fallar antes de implementar. El flujo de
despliegue se valida con las pruebas de humo y con los escenarios de
[quickstart.md](./quickstart.md); esta feature no añade flujos de usuario, así que no añade tests
e2e de Playwright.

**Organization**: las fases siguen el orden del plan (Fases 1 a 6) porque cada `## Phase N` se
entrega en su propia rama `feature/002-cloud-run-cicd-fase-N` y PR a `develop` (Principio VII). Cada
tarea lleva la etiqueta de la historia de usuario a la que sirve: **US1** staging, **US2**
producción, **US3** entornos aislados y reproducibles (incluye la identidad del agente), **US4**
visibilidad y fallos.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1…US4)
- Cada descripción incluye la ruta exacta del fichero o el recurso
- **(propietario)**: acto humano que el agente no puede ni debe hacer (incluida toda fusión de PR:
  un agente nunca ejecuta `merge`); las tareas sin marca las ejecuta el agente indicado en la
  cabecera de la fase

## Convenciones

- Estructura: `backend/`, `frontend/`, `infra/`, `.github/workflows/`, `.claude/` (ver plan.md,
  *Source Code*).
- Código, comentarios de código, Terraform y workflows en **inglés**; documentación y PRs en
  **español**; commits en inglés con Conventional Commits (Principio IX).
- Toda operación sobre Google Cloud del agente pasa por el MCP con la cuenta de servicio del agente
  y **confirmación explícita del propietario en cada cambio** (Principios V y VI). Nunca `gcloud`,
  `gsutil` ni `bq` directos. El despliegue de la aplicación es solo del pipeline.
- Terraform nunca se aplica en local: `plan` en PR y `apply` solo desde `infra.yml` con aprobación.
- Las acciones de GitHub Actions se fijan por SHA completo; los permisos del token son mínimos.
- Los identificadores `T###` se asignan en orden de ejecución; una tarea que depende de otra lo
  indica con su ID.

---

## Requisitos previos del propietario (Fase 0 del plan, sin rama ni PR)

**Purpose**: lo que solo el propietario puede hacer y de lo que dependen las Fases 1 y 3. No es
código: no lleva `## Phase`, así que `/speckit-implement` no lo trata como una fase.

- [X] T001 (propietario) Crear el proyecto de Google Cloud de staging (nombre provisional `pdlco-mytasks-stg`; confirmar el definitivo), vincular la facturación y anotar su id y número de proyecto
- [X] T002 (propietario) Comprobar en `pdlco-mytasks` que la organización permite crear claves de cuenta de servicio (riesgo R-1); si no lo permite, **detener la feature** y replantear FR-025 con `/speckit-clarify`
- [X] T003 (propietario) Crear la clave de `mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com` con credenciales propias y guardarla en `~/.config/mytasks-agent/` con permisos `0600`, fuera del repositorio (FR-025)
- [X] T004 (propietario) Conceder a `mytasks-ai-agent` los permisos temporales de arranque en ambos proyectos, **solo** los necesarios para bucket de estado, federación de identidad, cuentas de servicio, Artifact Registry, sus permisos a nivel de recurso y registro de auditoría, más lectura de registros; **sin** roles de despliegue de Cloud Run (Principio VI). Anotar rol, fecha y motivo para retirarlos en T060
- [X] T005 (propietario) Activar las notificaciones de GitHub Actions por fallo de workflow (correo y/o móvil) en la cuenta del propietario (FR-018)
- [X] T006 (propietario) Crear los *environments* de GitHub `staging`, `production`, `infra-staging` e `infra-production`: `staging` solo para `develop`, `release/*` y `hotfix/*`; `production` solo para `main`; `infra-staging` solo para `develop` e `infra-production` solo para `main`, ambos con revisor obligatorio (el propietario)
- [X] T006a (propietario) Ratificar con `/speckit-constitution` la enmienda 1.3.0: el Principio V aplica al agente (el pipeline opera con identidades federadas propias), la restricción de "Identidad en la nube" distingue la cuenta del agente de las cuentas del pipeline (`terraform-*`, `terraform-plan-*`, `deployer-*`) y el Principio IV admite `release/*` y `hotfix/*` como orígenes de staging; `CLAUDE.md` se actualiza en la misma PR. **Requisito previo de la Fase 3** (resuelve D1/D2 de `/speckit-analyze`)

---

## Phase 1: Identidad aislada del agente (US3)

**Agente/skill**: `mytasks-google-cloud-operator` + skill `update-config` para `settings.json` y
hooks. Revisión obligatoria de `mytasks-security-auditor` (Ficha 1).

**Purpose**: sustituir la suplantación actual por un almacén de credenciales aislado con la
identidad del agente y hacer técnicamente imposible el uso de credenciales personales
(FR-022 a FR-025). **Bloquea las Fases 3 a 6**: hasta completarla no hay operaciones reales sobre
Google Cloud.

**Independent Test**: las 9 comprobaciones de
[contracts/agent-identity.md § Verificación repetible](./contracts/agent-identity.md) pasan, y el
registro de auditoría muestra solo a `mytasks-ai-agent`.

- [X] T007 [US3] Verificar con la documentación qué bloquea ya `gcloud-mcp` (`--account`, `--impersonate-service-account`, `gcloud auth`) y cuáles son las opciones exactas de sandbox y denegación de lectura de Claude Code (R-6); anotar el resultado en `specs/002-cloud-run-cicd/research.md` (§ R12, subsección *Verificado*)
- [X] T008 [P] [US3] Escribir primero los tests del hook de identidad en `.claude/hooks/tests/test_gcloud_identity_guard.py`: rechazo de `--account`, `--impersonate-service-account`, `gcloud auth ...`, `gcloud config set account|auth/*` y redefinición de `CLOUDSDK_CONFIG`; aceptación de comandos de solo lectura; el rechazo se registra sin volcar credenciales
- [X] T009 [US3] Implementar el hook determinista `PreToolUse` en `.claude/hooks/gcloud_identity_guard.py` para la herramienta `mcp__gcloud__run_gcloud_command`, con registro de rechazos (fecha, herramienta, motivo) en un fichero local fuera del repo (depende de T008)
- [X] T010 [US3] Crear `.mcp.json` en la raíz con el servidor MCP de Google Cloud y `CLOUDSDK_CONFIG` apuntando al directorio aislado bajo `~/.config/mytasks-agent/` (rutas relativas al directorio personal, sin secretos ni rutas absolutas personales)
- [X] T011 [US3] Actualizar `.claude/settings.json` (skill `update-config`): activar el sandbox de Bash y denegar la lectura del directorio personal de `gcloud`, del fichero de credenciales por defecto y de `~/.config/mytasks-agent/`, con reglas `deny` de lectura equivalentes para las herramientas de fichero; **conservar** las reglas `deny` de `gcloud`, `gsutil` y `bq`
- [X] T012 [US3] En `.claude/settings.json` (mismo fichero que T011), impedir que `GOOGLE_APPLICATION_CREDENTIALS`, `CLOUDSDK_*` y tokens lleguen al Bash del agente y registrar el hook de T009
- [X] T013 [US3] (propietario) Activar la clave de T003 dentro del directorio aislado sin suplantación (`gcloud auth activate-service-account` con `CLOUDSDK_CONFIG` del directorio aislado); el agente no puede leer la clave
- [X] T014 [US3] (propietario) Retirar el servidor MCP `gcloud` de ámbito usuario que suplanta a la cuenta del agente, de modo que no coexistan dos servidores de Google Cloud
- [X] T015 [US3] Activar por el MCP (con confirmación explícita) los registros de auditoría de acceso a datos de Firestore e IAM en `pdlco-mytasks`; anotar el cambio para adoptarlo en Terraform en T055 (depende de T013 y T014)
- [X] T016 [US3] Crear `infra/RUNBOOK.md` (en español) con tres secciones iniciales: lista de las 9 comprobaciones de identidad como procedimiento ejecutable, rotación de la clave cada 90 días (con un recordatorio periódico en el calendario del propietario) y revocación inmediata
- [X] T017 [US3] Ejecutar las 9 comprobaciones de T016 y la consulta del registro de auditoría (solo lectura, por el MCP); pegar los resultados en la PR (depende de T009–T016)
- [X] T018 [US3] Reiniciar la sesión de Claude Code y repetir las comprobaciones 2 a 7 (comprobación 9)
- [X] T019 [US3] Revisión de `mytasks-security-auditor` de la identidad aislada: informe sin hallazgos bloqueantes en la PR

**Checkpoint**: MCP operativo solo con la identidad del agente; comprobaciones en verde; sin
servidor MCP de Google Cloud con credenciales personales.

---

## Phase 2: Aplicación desplegable y CI (US1 base)

**Agente/skill**: `mytasks-backend-developer`, `mytasks-frontend-developer`; los workflows de
GitHub Actions los hace el agente principal manualmente y se justifica en la PR (Principio VIII:
ningún skill los cubre). **No toca Google Cloud**: puede avanzar en paralelo con la Fase 1.

**Purpose**: que la API y el frontend se puedan empaquetar como imágenes idénticas para todos los
entornos, y que los checks requeridos de CI existan con sus nombres estables (Fichas 2, 3 y 4).

**Independent Test**: `pack build` de la API y `docker build` del frontend producen imágenes que
arrancan con las variables de un entorno y responden; `ci.yml` ejecuta los checks en una PR sin
desplegar y falla si se rompe un test o el contrato de la API.

### Backend (Ficha 2)

- [X] T020 [US1] Subir el backend a Python 3.13: `requires-python`, `python_version` de mypy y `target-version` de ruff en `backend/pyproject.toml`, fijar la versión (`backend/.python-version` o la variable del builder, según lo que verifique T028) y regenerar `backend/uv.lock`; `ruff`, `mypy --strict` y todos los tests en verde (depende de T028 para el método de fijación)
- [X] T021 [P] [US1] Test unitario de `APP_VERSION` (valor por defecto local y lectura desde el entorno, solo lectura) en `backend/tests/unit/test_config.py`
- [X] T022 [P] [US1] Test de integración contra el emulador en `backend/tests/integration/test_health.py`: `/healthz` incluye `version`; `/readyz` devuelve `200` con Firestore accesible y `503` sin acceso; ambos anónimos y sin datos ni detalles internos
- [X] T023 [US1] Añadir `APP_VERSION` a `backend/src/mytasks_api/config.py` con valor por defecto para local (depende de T021)
- [X] T024 [US1] Añadir `GET /readyz` (lectura mínima de Firestore) y el campo `version` en `GET /healthz` en `backend/src/mytasks_api/factory.py`, cambios aditivos y anónimos (depende de T022, T023)
- [X] T025 [P] [US1] Test unitario del exportador del contrato en `backend/tests/unit/test_export_openapi.py`: el volcado es determinista y contiene las rutas y esquemas de la API
- [X] T026 [US1] Crear `backend/scripts/export_openapi.py`, que vuelca `app.openapi()` a un fichero JSON ordenado, para el check `api-contract-compat` (depende de T025)
- [X] T027 [US1] Crear `backend/project.toml` con `GOOGLE_ENTRYPOINT` (Uvicorn escuchando en `PORT`, 8080) para el empaquetado con Buildpacks, sin Dockerfile, y fijar el builder (por digest o versión, nunca `latest`) **dentro de `backend/`**, de modo que cambiarlo cambie el hash de árbol
- [X] T028 [US1] Verificar localmente con `pack build` los puntos (a)–(f) de research R13: solo dependencias de producción de `uv.lock`, fijación de la versión de Python, ejecución sin privilegios, ningún `.env` ni caché dentro de la imagen, repetibilidad y lugar donde se fija el builder; la imagen arranca y responde en `/healthz`. Anotar el resultado en `specs/002-cloud-run-cicd/research.md` (§ R13, *Verificado*) y, si algo falla sin remedio, proponer en la PR un Dockerfile justificado (riesgo R-8)

### Frontend (Ficha 3)

- [X] T029 [P] [US1] Test unitario de `runtimeConfig` en `frontend/tests/unit/lib/runtimeConfig.test.ts`: lee `window.__APP_CONFIG__`, recurre a `import.meta.env` en local y `USE_EMULATORS` no puede activarse fuera de local
- [X] T030 [US1] Crear `frontend/src/lib/runtimeConfig.ts` (depende de T029)
- [X] T031 [US1] Migrar `frontend/src/lib/firebase.ts` y `frontend/src/lib/apiClient.ts` a `runtimeConfig` sin cambiar su comportamiento local; los tests unitarios existentes siguen en verde (depende de T030)
- [X] T032 [P] [US1] Crear `frontend/public/config.js` con los valores por defecto de desarrollo y cargar `/config.js` antes del bundle en `frontend/index.html`
- [X] T033 [P] [US1] Crear la configuración de Nginx sin privilegios en `frontend/nginx/` (fallback de rutas a `index.html`, caché larga para recursos con hash, sin caché para `index.html` y `config.js`, cabeceras de seguridad y CSP compatible con Firebase Auth y con la URL de la API del entorno) y `frontend/nginx/docker-entrypoint.d/` con el script que genera `/config.js` desde las variables de entorno y falla con un mensaje claro si falta una obligatoria; incluir un test automatizado del script (variables presentes y ausentes) que se ejecute en CI (Principio II)
- [X] T034 [US1] Crear `frontend/Dockerfile` (build de Vite + Nginx sin privilegios en el puerto 8080) y `frontend/.dockerignore`; ninguna variable de entorno incrustada en la compilación (depende de T031–T033)
- [X] T035 [US1] Verificar la imagen: la misma imagen sirve con dos juegos de variables distintos; `/config.js` refleja el entorno y no es cacheable; `/history` devuelve la SPA; `USE_EMULATORS` y `__mytasksTestLogin` no se activan fuera de local; Vitest, ESLint, `tsc` y el e2e de Playwright existente en verde

### Workflows de CI (Ficha 4)

- [X] T036 [US1] Crear `.github/workflows/ci.yml` con disparador `pull_request` a `develop`, `main`, `release/*` y `hotfix/*` y `workflow_call`, sin ningún filtro `paths` a nivel de workflow, permisos de solo lectura y acciones fijadas por SHA; jobs `backend-lint-types` (ruff y mypy estricto) y `backend-tests` (pytest unitarios e integración contra los emuladores con Python 3.13, **más** los tests del hook de `.claude/hooks/tests/` en cuanto exista T008; hasta entonces el job no los incluye, para no fallar si la Fase 2 se fusiona antes que la Fase 1)
- [X] T037 [US1] Añadir a `ci.yml` los jobs `frontend-lint-types` (ESLint, Prettier, `tsc`) y `frontend-tests` (Vitest) (mismo fichero que T036)
- [X] T038 [US1] Añadir a `ci.yml` el job `e2e` (Playwright contra frontend, API y emuladores)
- [X] T039 [US1] Añadir a `ci.yml` los jobs `images-build` (API con `pack build` sin publicar, web con su Dockerfile) y `secrets-scan` (análisis de secretos del cambio; proponer la herramienta y fijar su acción por SHA, justificado en la PR)
- [X] T040 [US1] Añadir a `ci.yml` el job `api-contract-compat`: genera con `backend/scripts/export_openapi.py` el contrato de la PR y el de su rama destino ejecutando el script de la PR contra el árbol de la rama destino (si esta aún no tiene contrato exportable, el check pasa y lo registra), y falla ante un cambio incompatible (campo o endpoint retirado, tipo más restrictivo) con una herramienta de comparación fijada por SHA o versión (depende de T026)
- [X] T041 [US1] Validar `ci.yml` en una rama de prueba: todos los checks verdes sin desplegar nada; romper a propósito un test hace fallar su check y retirar un campo del contrato hace fallar `api-contract-compat` (escenario 2 del quickstart)

**Checkpoint**: imágenes construibles y checks de CI operativos; los nombres de los checks son los
de [contracts/pipeline.md](./contracts/pipeline.md) (salvo `terraform-validate`, en la Fase 3).

---

## Phase 3: Arranque y plataforma (US3)

**Agente/skill**: `mytasks-iac-developer` (código Terraform) y `mytasks-google-cloud-operator`
(arranque único vía MCP con confirmación explícita). Workflows a mano. Revisión de
`mytasks-security-auditor` (Ficha 5). **Depende de la Fase 1 y de los requisitos del propietario
T001–T006a (incluida la enmienda de la constitución, T006a).**

**Purpose**: dejar operativo **todo lo que staging necesita antes de la primera release** y adoptarlo
en `infra/platform`. Como `platform` y `production` solo se aplican al fusionar en `main`, el
arranque por el MCP incluye estado, federación, identidades, Artifact Registry y cuentas
`deployer-*`; el código los adopta por importación.

**Independent Test**: `terraform plan` de `infra/platform` sin cambios tras adoptar el arranque; un
job de GitHub en una rama no permitida no obtiene credenciales; un plan que destruye estado,
registro o federación falla por `prevent_destroy`.

- [ ] T041a [US3] (propietario, **opcional**) Probar si el proyecto admite la política de denegación del agente (los proyectos no tienen organización, así que `roles/iam.denyAdmin` puede no estar disponible); si sí, crearla en `pdlco-mytasks` y `pdlco-mytasks-stg` según el §4.1 de [contracts/agent-bootstrap-permissions.md](./contracts/agent-bootstrap-permissions.md); si no, anotar en el RUNBOOK que la capa 1 no está disponible. No bloquea T041b ni T041c (resuelve MED-003, capa 1) Guía paso a paso: [guia-propietario-med-003.md](./guia-propietario-med-003.md)
- [X] T041b [US3] (propietario) Sustituir los permisos temporales de `mytasks-ai-agent` según el §3 y §4.2 de [contracts/agent-bootstrap-permissions.md](./contracts/agent-bootstrap-permissions.md): añadir cada rol con condición de caducidad `2026-10-31T23:59:59Z`, **después** retirar los incondicionales y retirar `roles/resourcemanager.projectIamAdmin` en ambos proyectos; `serviceAccountAdmin` se conserva (con caducidad) porque el agente crea las cuentas del pipeline; anotar en el RUNBOOK §4 (resuelve MED-003, capas 2 y 3) Guía paso a paso: [guia-propietario-med-003.md](./guia-propietario-med-003.md)
- [X] T041c [US3] (propietario) Crear en ambos proyectos el canal de notificación por correo y la política de alertas por registros del §4.3 de [contracts/agent-bootstrap-permissions.md](./contracts/agent-bootstrap-permissions.md), fijando antes los nombres de método con entradas reales del registro; el agente no recibe ningún rol de escritura de Monitoring (resuelve MED-003, capa 4) Guía paso a paso: [guia-propietario-med-003.md](./guia-propietario-med-003.md)
- [X] T041d [US3] Verificar por el MCP, con confirmación explícita y una cuenta de prueba desechable, las comprobaciones 10 a 14 del §5 de [contracts/agent-bootstrap-permissions.md](./contracts/agent-bootstrap-permissions.md); anotar los resultados en `infra/RUNBOOK.md` §6, actualizar su §4 y borrar la cuenta de prueba (`mytasks-google-cloud-operator`) (depende de T041b y T041c)
- [X] T042 [US3] Habilitar por el MCP (con confirmación explícita) las APIs necesarias para el arranque en `pdlco-mytasks` y en el proyecto de staging; anotar cada cambio para el RUNBOOK (depende de T041d: primera operación real tras acotar los permisos del agente)
- [X] T043 [US3] Crear por el MCP el bucket de estado de Terraform en `pdlco-mytasks` (versionado, acceso uniforme, región `europe-southwest1`) y anotar su nombre (depende de T042)
- [X] T044 [US3] Crear por el MCP el *pool* y el proveedor OIDC de Workload Identity Federation de GitHub con condición por identificadores numéricos de propietario y repositorio y sin comodines (depende de T042)
- [X] T045 [US3] Verificar que el claim `sub` de GitHub llega con la forma `repo:OWNER/REPO:environment:ENTORNO` para los *environments* y `repo:OWNER/REPO:pull_request` para las PR, y que ambos se pueden mapear y acotar; anotar el resultado en `specs/002-cloud-run-cicd/research.md` (R3) (depende de T044)
- [X] T046 [US3] Crear por el MCP las cuentas `terraform-production` y `terraform-staging` y sus vinculaciones de federación por *environment* (`infra-production`, `infra-staging`); `terraform-staging` solo accede al prefijo de su estado. Los roles **a nivel de proyecto** de estas cuentas los concede el propietario con la lista de la Ficha 5, porque el agente ya no tiene `projectIamAdmin` (depende de T043, T045, T041d)
- [X] T047 [US3] Crear por el MCP las cuentas de solo lectura `terraform-plan-production` y `terraform-plan-staging` (visor del proyecto y lectura del estado; sin IAM ni escritura) vinculadas al evento `pull_request` del repositorio propio y no a *forks*; el visor a nivel de proyecto lo concede el propietario, la lectura del bucket de estado el agente (depende de T043, T045, T041d) **Aplazado (decisión del propietario, 2026-10-09):** las cuentas, sus vinculaciones y la lectura de su prefijo del estado están creadas; el rol de lectura del proyecto (y si `roles/viewer` expone datos de Firestore, sin verificar) se decide en la Fase 4 con el `plan` real, junto a MED-001
- [X] T048 [US3] Crear por el MCP el repositorio de Artifact Registry `mytasks` en `europe-southwest1` con etiquetas inmutables, con lectura para el agente de servicio de Cloud Run de staging (depende de T042)
- [X] T049 [US3] Crear por el MCP las cuentas `deployer-staging` y `deployer-production` con sus vinculaciones de federación por *environment* y solo los permisos que ya tienen destino: lectura/escritura sobre el repositorio de Artifact Registry a nivel de recurso (`deployer-staging` escribe y `deployer-production` solo lee), sin `roles/owner` ni `roles/editor`. Los permisos sobre los servicios de Cloud Run y las cuentas de ejecución se conceden en la Fase 4 (T064/T065), cuando esos recursos existen (depende de T046, T048)
- [x] T050 [P] [US3] Crear el esqueleto de `infra/platform/` (proveedores `google` y `google-beta` con versión fijada, backend de estado en el bucket de T043, `.terraform.lock.hcl` versionado) con `infra/README.md` mínimo que remite a `RUNBOOK.md`
- [ ] T051 [US3] Declarar en `infra/platform/` el *pool*, el proveedor y las cuentas `terraform-*` y `terraform-plan-*` creados en T043–T047 con bloques de importación para adoptarlos sin recrearlos (depende de T047, T050)
- [ ] T052 [US3] Declarar en `infra/platform/` el repositorio de Artifact Registry de T048 con etiquetas inmutables y sus permisos a nivel de repositorio, adoptándolo por importación (depende de T050)
- [ ] T053 [US3] Declarar en `infra/platform/` las cuentas `deployer-*` de T049 y sus permisos sobre el repositorio de Artifact Registry a nivel de recurso, adoptándolas por importación (depende de T052, T049)
- [ ] T054 [US3] Añadir `prevent_destroy` al bucket de estado, al repositorio de Artifact Registry y al *pool* y proveedor de federación en `infra/platform/`
- [ ] T055 [US3] Declarar en `infra/platform/` el registro de auditoría de acceso a datos de Firestore e IAM de `pdlco-mytasks` anotado en T015 (depende de T051)
- [ ] T056 [US3] Crear `.github/workflows/infra.yml` con el job `terraform-validate` (`fmt`, `validate` y `plan` de las raíces afectadas con la identidad `terraform-plan-<env>`, publicado en la PR sin secretos) en `pull_request` de PR del repositorio propio sin filtro `paths` y omitido dentro del job si no hay cambios en `infra/**`
- [ ] T057 [US3] Añadir a `infra.yml` los jobs de `apply`: push a `develop` aplica `staging` (*environment* `infra-staging`), push a `main` aplica `production` y `platform` (`infra-production`), con aprobación obligatoria del propietario, permisos `id-token: write` solo donde se autentica y el mismo plan guardado como artefacto que se mostró para aprobar
- [ ] T058 [US3] Verificar que `terraform plan` de `infra/platform/` no muestra cambios (solo las importaciones previstas) tras adoptar el arranque, incluidos Artifact Registry y `deployer-*`
- [ ] T059 [US3] Verificar que un job de GitHub en una rama o *environment* no permitido no obtiene credenciales de la federación, que `terraform-plan-*` no puede escribir ni administrar IAM, y que un plan que destruye estado, registro o federación falla por `prevent_destroy`
- [ ] T060 [US3] Retirar por el MCP los permisos temporales concedidos a `mytasks-ai-agent` en T004 y anotar en `infra/RUNBOOK.md` cada permiso concedido y retirado; el agente queda de solo lectura. Fecha tope: **2026-10-31** (la condición de caducidad de T041b es la red de seguridad si se retrasa; renovarla es decisión explícita del propietario)
- [ ] T061 [US3] Revisión de `mytasks-security-auditor` de IAM, federación e identidades de `plan` en PR (riesgo R-10): sin hallazgos bloqueantes

**Checkpoint**: estado remoto, federación, registro e identidades operativos y bajo control de
Terraform; el agente es de solo lectura. Staging ya puede publicar imágenes aunque `platform` aún no
se haya aplicado desde `main`.

---

## Phase 4: Staging y despliegue automático (US1) 🎯 MVP

**Agente/skill**: `mytasks-iac-developer` (módulo y raíz), workflows a mano,
`mytasks-google-cloud-operator` para las verificaciones de solo lectura (Fichas 4 y 6).

**Goal**: cada fusión en `develop`, `release/*` o `hotfix/*` construye, prueba y despliega frontend
y backend en staging sin intervención.

**Independent Test**: fusionar una PR trivial en `develop` y comprobar, sin intervenir, que el
pipeline termina en verde en menos de 15 minutos y que staging sirve la nueva versión con
`/healthz`, `/readyz` y `/config.js` correctos.

- [ ] T062 [US1] Crear `infra/modules/environment/` con las APIs del entorno y la base de datos Firestore nativa en `europe-southwest1` con `deletion_protection` y `prevent_destroy`, la política TTL de `purge_at` sobre `tasks` y los tres índices de `firestore.indexes.json` de la feature 001
- [ ] T063 [US1] Añadir al módulo Identity Platform con los dominios autorizados del frontend (URL determinista `mytasks-web-<número de proyecto>.europe-southwest1.run.app`) (mismo módulo que T062)
- [ ] T064 [US1] Añadir al módulo las cuentas de ejecución `mytasks-api-run-<env>` (`roles/datastore.user`) y `mytasks-web-run-<env>` (sin roles) y el registro de auditoría de acceso a datos del entorno; conceder a `deployer-<env>` `roles/iam.serviceAccountUser` sobre esas dos cuentas de ejecución, a nivel de recurso
- [ ] T065 [US1] Añadir al módulo los dos servicios de Cloud Run (`mytasks-web`, `mytasks-api`) con imagen de marcador inicial, variables de [contracts/environments.md](./contracts/environments.md), límites de instancias, invocación anónima de plataforma y nombres cortos para conservar la URL determinista; conceder a `deployer-<env>` `roles/run.developer` sobre cada servicio, a nivel de recurso
- [ ] T065a [US1] Resolver MED-001 de [security-review-fase-2.md](./security-review-fase-2.md): memorizar en el proceso el último resultado de `GET /readyz` durante unos segundos (del orden de 5 a 10 s) y no emitir el log de fallo más de una vez por ventana, con test en `backend/tests/integration/test_health.py`, de modo que el trabajo real del endpoint anónimo tenga una cota por instancia independiente del tráfico; el máximo de instancias de `mytasks-api` de T065 y T067 es la segunda cota. Los hallazgos LOW-001 a LOW-003 del mismo informe van al backlog técnico (depende de T065)
- [ ] T066 [US1] En los servicios de T065 añadir `ignore_changes` sobre lo que gestiona el pipeline (imagen, tráfico, variable `APP_VERSION` y etiquetas de revisión `commit`, `tree-hash`, `pipeline-run`) y `deletion_protection` (depende de T065)
- [ ] T067 [US1] Crear `infra/envs/staging/` que instancia el módulo con los valores de staging (máximo 2 instancias, mínimo 0), estado propio y `.terraform.lock.hcl` versionado (depende de T062–T066)
- [ ] T068 [US1] (propietario) Configurar una vez el proveedor de Google en Identity Platform de staging y documentarlo en `infra/RUNBOOK.md` (consentimiento OAuth y cliente; riesgo R-2)
- [ ] T069 [P] [US1] Crear el script de pruebas de humo en `.github/scripts/smoke-test.sh`: API `/healthz` `200` con la versión esperada, `/readyz` `200`, endpoint de datos sin token `401`, web `/` `200` y `/config.js` con la URL de API del entorno y no la de otro
- [ ] T070 [US1] Crear `.github/workflows/deploy.yml` reutilizable, primera parte según [contracts/pipeline.md](./contracts/pipeline.md): invoca `ci.yml` y no despliega si falla, calcula el hash de árbol de `backend/` y `frontend/` y, solo en staging y solo si falta la imagen, construye y publica con etiqueta inmutable (`pack build --publish` para la API con el builder leído de `backend/`, Dockerfile para la web)
- [ ] T071 [US1] Añadir a `deploy.yml` la promoción y la revisión sin tráfico: en producción exige `validated-<hash>` de ambos componentes y falla antes de tocar nada si falta; despliega una revisión sin tráfico y etiquetada con `commit`, `tree-hash` y `pipeline-run`, y falla nombrando la variable si falta una obligatoria (mismo fichero que T070)
- [ ] T072 [US1] Añadir a `deploy.yml` el humo con `.github/scripts/smoke-test.sh` y el cambio de tráfico: primero la API y después la web, con reversión de la API si falla la web (depende de T069; mismo fichero que T071)
- [ ] T073 [US1] Añadir a `deploy.yml` la etiqueta `validated-<hash>` tras superar el humo en staging y el registro del despliegue (commit, rama, resultado y URL) en el *environment* de GitHub (mismo fichero que T072)
- [ ] T074 [US1] Crear `.github/workflows/deploy-staging.yml` con disparador `push` a `develop`, `release/*` y `hotfix/*`, *environment* `staging`, federación con `deployer-staging` y grupo de concurrencia `deploy-staging` sin cancelar la ejecución en curso (depende de T073)
- [ ] T075 [US1] (propietario) Fusionar la PR de la fase y aprobar el `apply` de `infra.yml` para `staging`; después el agente relanza `deploy-staging` si el primer intento falló por servicios aún inexistentes y comprueba los escenarios 2 y 3 del quickstart. Anotar la duración del despliegue (el percentil 95 de SC-001 se evalúa con las primeras 20 ejecuciones)
- [ ] T076 [US1] Comprobar el escenario 4 (un humo fallido no cambia el tráfico y una variable ausente falla antes de desplegar nombrándola), que `deploy.yml` no despliega cuando `ci.yml` falla (FR-004, SC-004) y el escenario 9 (dos fusiones seguidas: nunca dos despliegues a la vez y queda la más reciente)

**Checkpoint**: staging se despliega solo desde `develop`, `release/*` y `hotfix/*`, con humo y
reversión; US1 funciona y se prueba sola (MVP).

---

## Phase 5: Producción y promoción (US2)

**Agente/skill**: `mytasks-iac-developer`, workflows a mano, `mytasks-google-cloud-operator` para
verificaciones de solo lectura (Fichas 4 y 6).

**Goal**: cada fusión en `main` despliega en producción exactamente la imagen validada en staging.

**Independent Test**: fusionar una release en `main` y comprobar que producción sirve la misma
imagen (mismo *digest*) que staging y que un cambio sin imagen validada no se despliega.

- [ ] T077 [US2] Crear `infra/envs/production/` que instancia el mismo módulo con los valores de producción (máximo 5 instancias, mínimo 0), estado propio y `.terraform.lock.hcl` versionado; comparar con la raíz `staging` y comprobar que solo difieren dimensionado e identificadores
- [ ] T078 [US2] (propietario) Configurar una vez el proveedor de Google en Identity Platform de producción y documentarlo en `infra/RUNBOOK.md` (riesgo R-2)
- [ ] T079 [US2] Crear `.github/workflows/deploy-production.yml` con disparador `push` a `main`, *environment* `production`, federación con `deployer-production`, promoción del mismo *digest* exigiendo `validated-<hash>` de ambos componentes (si falta, falla antes de tocar nada con el componente y el hash) y grupo de concurrencia `deploy-production` sin cancelar la ejecución en curso
- [ ] T080 [US2] (propietario) Configurar los rulesets de `main`, `develop`, `release/*` y `hotfix/*` con los nueve *required status checks* de [contracts/pipeline.md](./contracts/pipeline.md)
- [ ] T081 [US2] (propietario) Fusionar la release en `main` y aprobar el `apply` de `infra.yml` para `production` y `platform` (primera vez: ejecuta las importaciones de la plataforma); después el agente comprueba el escenario 6 del quickstart (mismo *digest* que staging, `/config.js` apunta a la API de producción) y su variante negativa (cambio sin pasar por staging: "versión no validada en staging" y producción sin cambios). Anotar la duración (SC-002)
- [ ] T082 [US2] Comprobar el escenario 7 del quickstart: ni el agente por el MCP ni una rama no permitida pueden crear revisiones de Cloud Run (SC-003)

**Checkpoint**: US1 y US2 funcionan; producción solo se despliega por pipeline con la imagen validada.

---

## Phase 6: Aislamiento, visibilidad y documentación (US3, US4)

**Agente/skill**: `mytasks-iac-developer`, `mytasks-google-cloud-operator` (solo lectura),
`mytasks-security-auditor` (Fichas 6 y 7).

**Goal**: demostrar el aislamiento, dar visibilidad del estado y de los fallos, y cerrar la
documentación operativa.

**Independent Test**: los diez escenarios de [quickstart.md](./quickstart.md) pasan y la revisión de
seguridad final no tiene hallazgos bloqueantes.

- [ ] T083 [US3] Comprobar el escenario 5 del quickstart por el MCP en solo lectura: una tarea creada en staging no existe en producción, las definiciones difieren solo en dimensionado e identificadores y cada API rechaza los tokens del otro proyecto (SC-009)
- [ ] T084 [US4] Comprobar el escenario 8 del quickstart: un fallo controlado de pipeline notifica al propietario en menos de 5 minutos con el paso fallido y el enlace (SC-006) y la versión de cada entorno es consultable en *Environments* y en `/healthz` sin acceder a la infraestructura
- [ ] T085 [US4] (propietario) Conceder los permisos de facturación necesarios y declarar en Terraform los presupuestos con alertas al 50, 90 y 100 % por proyecto en `infra/envs/staging/` y `infra/platform/` (el de producción incluye la plataforma) (FR-026)
- [ ] T086 [P] [US4] Confirmar con la documentación el precio y la capa gratuita de Artifact Registry, Firestore e Identity Platform, fijar los importes de los presupuestos de T085 y actualizar `specs/002-cloud-run-cicd/research.md` (R11 y *Lo que no se ha podido confirmar*) (FR-026)
- [ ] T087 [P] [US3] Completar `infra/README.md` (en español): visión general, estructura de `infra/`, cómo se aplica (siempre vía pipeline) y reglas de protección contra borrado
- [ ] T088 [US3] Completar `infra/RUNBOOK.md` (en español, FR-021): flujo de despliegue, entornos y URL, recuperación de un despliegue fallido, arranque único y permisos temporales, configuración del proveedor de Google (R-2), rotación y revocación de la clave, retirada de la protección contra borrado antes de destruir un entorno
- [ ] T089 [US3] Ejecutar el escenario 10 del quickstart: análisis de secretos sobre todo el repositorio e historial (0 credenciales: SC-008) y recreación de un entorno de pruebas desde `infra/` siguiendo solo `RUNBOOK.md` en un proyecto desechable acordado con el propietario (SC-007)
- [ ] T090 [US3] Sincronizar `specs/002-cloud-run-cicd/` con cualquier desfase que haya aparecido durante la implementación (spec, plan y contratos) en una PR `docs(spec)`
- [ ] T091 [US3] (propietario) Proponer y ratificar con `/speckit-constitution` una enmienda PATCH que pase a *activo* los mecanismos ya implementados: "Sin credenciales personales", "Despliegue solo vía pipeline", "Checks de CI" y "Tests por niveles" (las aclaraciones de los Principios V y IV y de la identidad en la nube van antes, en T006a)
- [ ] T092 [US3] Revisión final de `mytasks-security-auditor` sobre identidades, permisos, IAM, federación, identidades de `plan` y custodia de la clave: sin hallazgos bloqueantes
- [ ] T093 [US3] Ejecutar los diez escenarios de [quickstart.md](./quickstart.md) completos y repasar el checklist *Definition of Done* de la constitución

**Checkpoint**: la feature cumple sus criterios de aceptación y queda documentada.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Requisitos del propietario (T001–T006a)**: sin dependencias; bloquean la Fase 1 (T003) y la Fase 3 (T001, T004, T006, T006a).
- **Phase 1 (identidad del agente)**: depende de T002 y T003. Bloquea las Fases 3 a 6.
- **Phase 2 (aplicación desplegable y CI)**: sin dependencias; **en paralelo con la Fase 1** porque no toca Google Cloud.
- **Phase 3 (arranque y plataforma)**: depende de la Fase 1 y de T001–T006a. Las tareas T042–T049 y T060 son operaciones reales por el MCP.
- **Phase 4 (staging)**: depende de las Fases 2 y 3. Es el MVP.
- **Phase 5 (producción)**: depende de la Fase 4 (necesita la imagen validada en staging).
- **Phase 6 (cierre)**: depende de las Fases 4 y 5.

Orden: 1 ∥ 2 → 3 → 4 → 5 → 6.

### Dentro de cada fase

- Tests antes que la implementación (T008→T009, T021/T022→T023/T024, T025→T026, T029→T030).
- La fijación de la versión de Python (T020) necesita el resultado de T028; empezar por T027 y T028.
- Una tarea que edita el mismo fichero que otra no lleva `[P]` (p. ej. T036–T040, T070–T073, T011–T012, T062–T064).
- El `apply` de `staging` ocurre al fusionar en `develop` y el de `production` y `platform` al fusionar en `main`: por eso el arranque de la Fase 3 crea por el MCP todo lo que staging necesita, y la plataforma se adopta por importación en la primera aplicación desde `main` (T081).

### Oportunidades de paralelismo

- Fase 1 en paralelo con toda la Fase 2.
- Dentro de la Fase 2: backend (T020–T028) y frontend (T029–T035) en paralelo; T021, T022, T025 y T029 entre sí.
- Dentro de la Fase 3: T050 con las tareas de arranque; dentro de la Fase 4: T069 con el módulo (T062–T066); dentro de la Fase 6: T086 y T087.

## Parallel Example: Phase 2

```text
# Tests primero, en paralelo:
Task: "Test unitario de APP_VERSION en backend/tests/unit/test_config.py"
Task: "Test de integración de /healthz y /readyz en backend/tests/integration/test_health.py"
Task: "Test del exportador de contrato en backend/tests/unit/test_export_openapi.py"
Task: "Test unitario de runtimeConfig en frontend/tests/unit/lib/runtimeConfig.test.ts"

# Después, en paralelo:
Task: "Cargar /config.js en frontend/index.html y crear frontend/public/config.js"
Task: "Configuración de Nginx y script de /config.js en frontend/nginx/"
```

## Implementation Strategy

### MVP primero (Fases 1 a 4)

1. Requisitos del propietario (T001–T006a).
2. Fase 1 y Fase 2 en paralelo.
3. Fase 3 (arranque y plataforma).
4. Fase 4: **detenerse y validar** staging (escenarios 2, 3, 4 y 9).

### Entrega incremental

1. Fase 4 → staging automático (valor inmediato: la aplicación en la nube).
2. Fase 5 → producción por promoción de la misma imagen.
3. Fase 6 → aislamiento demostrado, visibilidad, documentación y cierre.

Cada fase es una PR independiente a `develop` (Principio VII) que solo el propietario fusiona.

## Notes

- Las tareas `[P]` afectan a ficheros distintos y no tienen dependencias pendientes.
- Las tareas `(propietario)` no las ejecuta el agente: se detiene y avisa al llegar a ellas.
- Ninguna operación sobre Google Cloud se ejecuta sin la Fase 1 completa (Principio V).
- **Decisiones incorporadas tras `/speckit-analyze`** (2026-09-30): el arranque incluye Artifact
  Registry y `deployer-*` (C1); el `plan` en PR usa identidades `terraform-plan-*` de solo lectura
  (I1); Terraform ignora `APP_VERSION` y las etiquetas de revisión (I2); FR-002 ya incluye
  `release/*` y `hotfix/*` (D1); `api-contract-compat` hace cumplir FR-008 (C2); el builder vive
  dentro de `backend/` (I3); FR-026 cubre los presupuestos (D2).
- **Decisiones incorporadas tras el segundo `/speckit-analyze`** (2026-10-01): la enmienda de la
  constitución (V, identidad en la nube, IV) pasa a requisito previo T006a (D1/D2); los permisos
  de `deployer-*` sobre servicios y cuentas de ejecución se conceden en la Fase 4 (D3); el job de
  tests del hook, `api-contract-compat` y el script de Nginx quedan precisados (D4–D6).
- Commit tras cada tarea o grupo lógico; detenerse en cada *Checkpoint* para validar.
