---

description: "Lista de tareas de implementación de la feature 005-custom-domain"
---

# Tasks: Dominio propio con certificado gratuito en producción

**Input**: documentos de diseño de `specs/005-custom-domain/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/edge.md](./contracts/edge.md),
[contracts/pipeline-env.md](./contracts/pipeline-env.md), [quickstart.md](./quickstart.md)

**Tests**: **obligatorios** donde hay lógica verificable (Principio II): los scripts del pipeline y la
paridad de entornos llevan pruebas que se escriben primero y deben fallar. La infraestructura no tiene
tests unitarios: la valida `terraform fmt`/`validate`/`plan` en el CI de `infra.yml` y la validación por
escenarios de [quickstart.md](./quickstart.md). No hay código de aplicación nuevo, así que no hay tests
de Vitest, pytest ni Playwright nuevos (los existentes deben seguir en verde).

**Organization**: las fases siguen el orden del plan porque cada `## Phase N` se entrega en su propia
rama `feature/005-custom-domain-fase-N` y PR a `develop` (Principio VII). Las historias son
**US1** abrir la aplicación con el dominio propio, **US2** iniciar sesión desde él, **US3** certificado
gratuito que se renueva solo, **US4** dirección canónica y redirecciones, **US5** gobierno por
IaC/pipeline y guías.

**Correspondencia con las fases del plan.md**: Phase 1 = Fase 0 del plan; Phase 2 = Fase 2 del plan
(pipeline y CORS); Phase 3 = Fase 1 del plan (Hosting); Phase 4 = Fase 3 del plan (dominio);
Phase 5 = Fase 4 del plan; Phase 6 = Fase 5 del plan. Se cambió el orden de 2 y 3 para que, cuando
Hosting exista en staging, la API ya acepte su origen y la validación pueda hacerse completa.

**Cómo se reparte el trabajo y por qué este orden**:

- La **Phase 1** no toca infraestructura: deja a mano al propietario lo que solo él puede hacer
  (permisos, variable de GitHub) y verifica en solo lectura. Nada de lo demás se aplica sin ella.
- La **Phase 2** (pipeline) es inocua por sí sola: ampliar CORS con un origen que aún no existe no cambia
  el comportamiento de ningún usuario, así que `develop` sigue desplegable.
- La **Phase 3** crea Hosting en staging y producción. Staging pasa a servir la web por `web.app`; es la
  prueba real del camino que usará el dominio.
- La **Phase 4** declara los dominios solo en producción. Crearlos es inocuo hasta que el propietario
  ponga el DNS.
- Las fases 2–4 viajan **en la misma release**; la **Phase 6** la ejecuta el propietario con el pipeline.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US5); sin etiqueta, la tarea es de soporte o de cierre
- **(propietario)**: acto humano que el agente no puede ni debe hacer (permisos, DNS, aprobación del
  `apply`, y toda fusión de PR: un agente nunca ejecuta `merge`)

## Convenciones

- Estructura: `infra/`, `.github/`, `specs/005-custom-domain/` (ver plan.md, *Source Code*). No se toca
  `backend/` ni `frontend/`.
- Todo cambio de infraestructura lo escribe `mytasks-iac-developer`; el agente **no** ejecuta
  `terraform apply` ni `gcloud`: el `apply` lo hace `infra.yml` tras la aprobación del propietario
  (Principios V y VI). Las lecturas de verificación van solo por el MCP de Google Cloud con la cuenta de
  servicio del agente; si el MCP no puede hacerlas, el agente se detiene y avisa.
- `terraform validate` y `plan` no pueden arrancar el proveedor en el sandbox: lo valida el CI. En local
  solo `terraform fmt -check` y los scripts de Python (`python3 .github/scripts/tests/<prueba>.py`).
- El trabajo sobre `deploy.yml` no tiene fila en la tabla de skills de `CLAUDE.md`: se hace con
  `mytasks-iac-developer` y se **justifica en la PR de la Phase 2** (Principio VIII).
- Código, comentarios y mensajes de commit en **inglés**; documentación y PRs en **español**
  (Principio IX). Los identificadores `T###` se asignan en orden de ejecución.

---

## Phase 1: Prerrequisitos y verificación en solo lectura (sin cambios de infraestructura)

**Purpose**: dejar listo lo que solo puede hacer el propietario y confirmar el punto de partida.
Se entrega como PR documental (`mytasks-project-manager` + `mytasks-iac-developer` para la guía).

**Goal**: el propietario tiene una guía exacta; los permisos y la variable están concedidos y verificados.

**Independent Test**: la lectura con el MCP muestra los roles concedidos a `terraform-staging` y
`terraform-production`; el entorno `production` de GitHub tiene `CUSTOM_WEB_ORIGINS`.

- [ ] T001 [P] [US5] Comprobar en solo lectura con el MCP de Google Cloud (cuenta del agente) si existe el sitio por defecto de Hosting en `pdlco-mytasks` y `pdlco-mytasks-stg`, y si la API `firebasehosting.googleapis.com` está activa; anotar el resultado en `specs/005-custom-domain/research.md` (R5, «A verificar»). Si el MCP no puede leerlo, no usar otra vía: anotarlo y pedir al propietario que lo mire en la consola de Firebase
- [ ] T002 [P] [US5] Redactar `specs/005-custom-domain/guia-propietario-hosting.md` (mismo formato que `specs/002-cloud-run-cicd/guia-propietario-*.md`): conceder `roles/firebasehosting.admin` a `terraform-staging@pdlco-mytasks-stg.iam.gserviceaccount.com` y `terraform-production@pdlco-mytasks.iam.gserviceaccount.com` en la consola de IAM de su proyecto, crear la variable **no secreta** `CUSTOM_WEB_ORIGINS=https://inserttask.com` en *Settings → Environments → production → Variables*, y cómo comprobar ambas cosas. Los comandos van solo como texto; el agente no los ejecuta
- [ ] T003 (propietario) Seguir la guía de T002: conceder los dos roles y crear la variable `CUSTOM_WEB_ORIGINS` en el entorno `production` (no en `staging`)
- [ ] T004 [US5] Verificar en solo lectura con el MCP que `terraform-staging` y `terraform-production` tienen `roles/firebasehosting.admin` y que no se concedió nada más; registrar la comprobación (fecha, identidades, roles) en una sección nueva «14. Dominio propio» de `infra/RUNBOOK.md` (esqueleto: permisos concedidos; las demás subsecciones las rellena la Phase 4)

**Checkpoint**: permisos y variable verificados; el esqueleto de la sección 14 del RUNBOOK existe.

---

## Phase 2: Pipeline: lista de orígenes CORS compuesta (US2)

**Purpose**: que la API acepte los orígenes de Hosting y del dominio propio sin romper los despliegues
existentes. Skill: `mytasks-iac-developer` (excepción a justificar en la PR).

**Goal**: `deploy.yml` compone `CORS_ORIGINS` según [contracts/pipeline-env.md](./contracts/pipeline-env.md)
§1, la comprueba antes y después de crear la revisión y rechaza orígenes mal formados.

**Independent Test**: las pruebas de scripts pasan; un despliegue real de staging deja
`CORS_ORIGINS` con los dos orígenes esperados y la prueba de humo en verde (escenario 8 del quickstart).

### Tests de la Phase 2 (escribirlos primero; deben fallar)

- [ ] T005 [P] [US2] Crear `.github/scripts/tests/test_cors_origins.py` con los casos de la tabla de `pipeline-env.md` §1: staging sin variable (dos orígenes); producción con `https://inserttask.com` (tres); varios orígenes separados por espacio; valor con `http://`, `*`, ruta, puerto, mayúsculas o espacio interno (falla nombrando el valor); duplicado (se descarta); orden estable. Ejecuta el script que creará T008
- [ ] T006 [P] [US2] Ampliar `.github/scripts/tests/test_deploy_variable_check.py`: la comprobación previa de `CORS_ORIGINS` pasa si el valor **contiene** la URL `run.app` de este entorno aunque lleve más orígenes y falla si es de otro entorno o no existe; añadir un caso «servicio de producción con el valor antiguo (solo `run.app`)» que debe pasar
- [ ] T007 [P] [US2] Ampliar `.github/scripts/tests/test_deploy_bootstrap_admin.py` (o crear `test_deploy_custom_origins.py` siguiendo su estructura) para comprobar que el job lee `vars.CUSTOM_WEB_ORIGINS`, que el paso de validación va antes de cualquier construcción o revisión y que la asignación de `CORS_ORIGINS` aparece en el despliegue de revisiones

### Implementación de la Phase 2

- [ ] T008 [US2] Crear `.github/scripts/cors-origins.sh`: recibe `PROJECT_ID`, `PROJECT_NUMBER`, `REGION` y `CUSTOM_WEB_ORIGINS` (opcional, separada por espacios); valida cada origen (`https://` + dominio en minúsculas, sin ruta ni puerto ni `*`); imprime la lista compuesta separada por comas, sin duplicados, en el orden de `pipeline-env.md` §1; ante un valor inválido sale con error y `::error::` nombrando el valor
- [ ] T009 [US2] En `.github/workflows/deploy.yml`, añadir `CUSTOM_WEB_ORIGINS: ${{ vars.CUSTOM_WEB_ORIGINS }}` al `env` del job (junto a `BOOTSTRAP_ADMIN_EMAIL`) y un paso «Check the custom web origins» que ejecuta `cors-origins.sh` antes de cualquier construcción y guarda la lista compuesta como salida del job
- [ ] T010 [US2] En `.github/workflows/deploy.yml`, paso «Check the service variables»: cambiar la comprobación de `CORS_ORIGINS` de igualdad exacta a «contiene la URL `run.app` de este entorno» (modo nuevo `NOMBRE~=valor` en la función `check`), sin debilitar el resto de variables
- [ ] T011 [US2] En `.github/workflows/deploy.yml`, paso «Deploy the revisions without traffic»: escribir `CORS_ORIGINS` de la API con `--update-env-vars` usando el delimitador alternativo de `gcloud` (`^@^`) para que las comas de la lista no la dividan, conservando `APP_VERSION` y `BOOTSTRAP_ADMIN_EMAIL`
- [ ] T012 [US2] En `.github/workflows/deploy.yml`, añadir un paso posterior a la creación de la revisión y **anterior a mover el tráfico** que lee las variables de la revisión nueva de la API y exige que `CORS_ORIGINS` sea **exactamente** la lista compuesta; si no, el despliegue se detiene sin mover tráfico y nombra la diferencia (sin imprimir otras variables)
- [ ] T013 [US2] Ejecutar `python3 .github/scripts/tests/test_cors_origins.py`, `test_deploy_variable_check.py` y la prueba de T007 y comprobar la sintaxis de los bloques `run:` de `deploy.yml` con el script existente en `.github/scripts/tests/`; todos en verde
- [ ] T014 [P] [US5] Anotar en `specs/002-cloud-run-cicd/contracts/pipeline.md` que `CORS_ORIGINS` pasa a ser una lista compuesta por el pipeline (remitir a `specs/005-custom-domain/contracts/pipeline-env.md`) y en `infra/RUNBOOK.md` §11 «Flujo de despliegue» la variable `CUSTOM_WEB_ORIGINS`
- [ ] T015 [US2] Pasar `mytasks-security-auditor` por el cambio de `deploy.yml` (validación de entrada de la variable, sin interpolación insegura en `run:`, sin comodines) y registrar el informe en `specs/005-custom-domain/security-review-fase-2.md`

**Checkpoint**: `develop` sigue desplegable; con la variable aún sin definir, staging despliega igual que antes más el origen `web.app`.

---

## Phase 3: Firebase Hosting en staging y producción (US1, US2)

**Purpose**: que ambos entornos sirvan la web por Hosting (`<proyecto>.web.app`) con el mismo módulo.
Skill: `mytasks-iac-developer`. Requiere la Phase 1 completada.

**Goal**: sitio, versión y *release* de Hosting con una regla `**` → `mytasks-web`; dominio de
`web.app` y de los dominios personalizados autorizados en el inicio de sesión; sin dominios todavía.

**Independent Test**: `https://pdlco-mytasks-stg.web.app/` sirve la aplicación de staging, con
certificado válido, las mismas cabeceras de seguridad que `run.app`, y se puede iniciar sesión y usar el
tablero (escenarios 1–7 y 9 del quickstart).

### Tests de la Phase 3 (escribirlos primero; deben fallar)

- [ ] T016 [P] [US1] Ampliar `.github/scripts/tests/test_env_roots_parity.py`: exigir el proveedor `google-beta` fijado y su `provider` en ambos roots, y permitir que difiera **solo** la lista de dominios personalizados además de lo que ya puede diferir; debe fallar hasta que T017–T022 estén hechas

### Implementación de la Phase 3

- [ ] T017 [US1] Añadir `google-beta` (`hashicorp/google-beta`, `~> 8.6.0`) a `required_providers` de `infra/modules/environment/versions.tf`, `infra/envs/staging/versions.tf` e `infra/envs/production/versions.tf`; declarar `provider "google-beta"` con los mismos `project`, `region`, `user_project_override` y `billing_project` que `google` en `infra/envs/staging/providers.tf` e `infra/envs/production/providers.tf`, y pasárselo al módulo en `infra/envs/*/main.tf` (`providers = { google = google, google-beta = google-beta }`)
- [ ] T018 [US1] Actualizar `infra/envs/staging/.terraform.lock.hcl` e `infra/envs/production/.terraform.lock.hcl` con el proveedor nuevo y *hashes* de las plataformas del CI y de macOS (`terraform providers lock …`, con `allowed_domains: registry.terraform.io` y `releases.hashicorp.com`); si el sandbox no lo permite, pedir al propietario que lo genere y no continuar sin los ficheros
- [ ] T019 [P] [US1] Añadir `firebasehosting.googleapis.com` a la variable `apis` de `infra/modules/environment/variables.tf`
- [ ] T020 [P] [US1] Añadir la variable `custom_domains` (lista de objetos `domain` y `redirect_to` opcional, por defecto `[]`) a `infra/modules/environment/variables.tf`, con validaciones: nombres en minúsculas sin esquema ni barra, sin duplicados y `redirect_to` apuntando a otro dominio de la misma lista. Pasar `custom_domains = []` explícito en `infra/envs/staging/main.tf` (producción lo rellena la Phase 4)
- [ ] T021 [US1] Crear `infra/modules/environment/hosting.tf` con `provider = google-beta`: el sitio por defecto (`site_id` = `var.project_id`) con `lifecycle { prevent_destroy = true }`, la versión con una única regla `**` hacia el servicio `google_cloud_run_v2_service.web` (nombre y región del entorno, **sin** `pinTag`) y su *release* con un mensaje que identifique la feature; comentarios en inglés que expliquen por qué Hosting no sirve contenido propio
- [ ] T022 [US1] Según el resultado de T001: si el sitio por defecto ya existe, añadir el bloque `import` correspondiente en `infra/envs/staging/main.tf` y `infra/envs/production/main.tf` (mismo estilo que el de Identity Platform) y explicarlo en un comentario; si no existe, dejar que lo cree el módulo
- [ ] T023 [US2] En `infra/modules/environment/identity.tf`, añadir a `authorized_domains` los dominios de `var.custom_domains` que no tengan `redirect_to`, y a `allowed_referrers` de la clave de API web `https://${var.project_id}.web.app/*` y `https://<dominio>/*` para esos mismos dominios; conservar todo lo existente
- [ ] T024 [P] [US1] Añadir a `infra/modules/environment/outputs.tf` `hosting_site_id` y `hosting_url` (`https://<site>.web.app`), y a `infra/README.md` un apartado breve sobre el proveedor `google-beta`: por qué se usa, que se limita a los recursos de Hosting y cómo fijar su versión
- [ ] T025 [US1] Ejecutar `terraform fmt -check -recursive infra` y `python3 .github/scripts/tests/test_env_roots_parity.py`; ambos en verde
- [ ] T026 [US1] Con la PR abierta, leer el plan de solo lectura de staging y de producción en el resumen de `infra.yml` (anotaciones del check): solo deben aparecer **altas** de Hosting y el cambio de `authorized_domains`/*referrers*; Cloud Run, Firestore y Identity Platform sin otros cambios. Registrar la lectura en la PR
- [ ] T027 [US1] Si el plan de solo lectura falla por falta de permisos de Hosting en `terraform-plan-*`, añadir los permisos de lectura que indique el error a `infra/iam/roles/plan-reader.yaml` (sin escritura, sin datos) y dejar la petición al propietario en la PR
- [ ] T028 (propietario) Si T027 aplicó: actualizar el rol personalizado `mytasksPlanReader` con la nueva definición. Después, tras fusionar la PR, aprobar en el entorno `infra-staging` el `apply` de staging tras leer su plan
- [ ] T029 [P] [US1] Con staging ya aplicado, ejecutar los escenarios 1, 2, 3, 6, 7 y 9 del quickstart con `curl` (certificado, redirección HTTP→HTTPS, cabeceras, dirección `run.app` viva, versión coherente, rendimiento) y registrar el resultado en `specs/005-custom-domain/validacion-staging.md`. Si falta alguna cabecera de seguridad o no hay redirección HTTP→HTTPS, declararla en la configuración de Hosting del módulo y repetir
- [ ] T030 (propietario) Escenarios 4 y 5 del quickstart en staging (inicio de sesión con la cuenta invitada y con la no invitada desde `web.app`; tablero, tarea y perfil sin errores de CORS ni de CSP en la consola) y escenario 8 (despliegue de staging con la lista CORS esperada); anotarlo en `specs/005-custom-domain/validacion-staging.md`

**Checkpoint**: staging sirve la web por Hosting con todo el flujo funcionando; el dominio propio todavía no existe.

---

## Phase 4: Dominio propio `inserttask.com` en producción (US1, US3, US4)

**Purpose**: declarar los dominios solo en producción y dejar la operación documentada. Skill:
`mytasks-iac-developer`. Requiere la Phase 3 fusionada y aplicada en staging.

**Goal**: `inserttask.com` (canónico) y `www.inserttask.com` (301 al canónico) declarados con certificado
gestionado, sin esperar al DNS, con el estado y los registros requeridos legibles tras el `apply`.

**Independent Test**: el plan de producción añade exactamente los dos dominios; tras el `apply` los
registros DNS requeridos se pueden leer y la guía es suficiente para ponerlos (escenarios 10–11).

### Tests de la Phase 4 (escribirlos primero; deben fallar)

- [ ] T031 [P] [US4] Ampliar `.github/scripts/tests/test_env_roots_parity.py` para comprobar que **solo** `infra/envs/production/main.tf` define dominios en `custom_domains` y que staging lo deja vacío; debe fallar hasta T032–T033

### Implementación de la Phase 4

- [ ] T032 [US1] En `infra/modules/environment/hosting.tf`, añadir `google_firebase_hosting_custom_domain` con `for_each` sobre `var.custom_domains` (`provider = google-beta`, `site_id` del sitio, `wait_dns_verification = false`, `redirect_target` cuando `redirect_to` esté definido, certificado gestionado con el tipo por defecto, `prevent_destroy`), dependiendo del *release*; comentario en inglés sobre la regla de 30 días de propiedad
- [ ] T033 [US4] En `infra/envs/production/main.tf`, pasar `custom_domains` con `inserttask.com` (canónico) y `www.inserttask.com` con `redirect_to = "inserttask.com"`
- [ ] T034 [US3] Añadir a `infra/modules/environment/outputs.tf` una salida por dominio con `host_state`, `ownership_state`, el estado del certificado, `issues` y `required_dns_updates` (valores públicos), vacía en staging
- [ ] T035 [US3] Revisar `.github/workflows/infra.yml`: si el resumen del `apply` no muestra las salidas de Terraform, añadir al resumen solo la salida de los dominios (T034), sin otras salidas ni secretos, para que el propietario lea los registros DNS sin entrar en la consola; añadir su prueba al script de pruebas de `infra` que corresponda
- [ ] T036 [US3] Completar `infra/RUNBOOK.md` §14: (a) registros DNS que debe poner el propietario (TXT permanente, A/AAAA del apex y de `www`, CAA solo si ya existen), retirada previa de registros de «aparcado» y comprobación con una consulta DNS; (b) plazos (hasta 24 h de emisión, 30 días de propiedad); (c) tabla de diagnóstico de la research R12; (d) cómo leer el estado con las salidas del `apply` y con la consola de Firebase; (e) renovación automática y qué la rompe (retirar el TXT o cambiar el DNS); (f) retirar el dominio dejando `run.app` y `web.app` operativos; (g) aviso a las personas usuarias: la sesión y las preferencias locales se reinician por origen
- [ ] T037 [P] [US1] Añadir la dirección pública de producción y la de `web.app` al `README.md` (apartado de entornos) y a la tabla de entornos de `infra/RUNBOOK.md` §11
- [ ] T038 [US4] Ejecutar `terraform fmt -check -recursive infra` y `python3 .github/scripts/tests/test_env_roots_parity.py`; en verde
- [ ] T039 [US1] Leer el plan de solo lectura de producción en la PR: solo altas de los dos dominios y el cambio de `authorized_domains` y *referrers* (con `inserttask.com`), nada más; registrar la lectura en la PR

**Checkpoint**: el código declara el dominio; sigue sin afectar a ningún usuario hasta que exista el DNS.

---

## Phase 5: Revisión de seguridad, documentación y cierre (US5)

**Purpose**: cerrar la feature con la revisión obligatoria y la Definition of Done. Skills:
`mytasks-security-auditor`, `mytasks-project-manager`.

**Goal**: informe de seguridad sin críticos ni altos abiertos; documentación al día; DoD repasada.

**Independent Test**: `security-review-final.md` y `definition-of-done.md` existen y no dejan puntos
abiertos salvo los de la puesta en servicio (Phase 6).

- [ ] T040 [US5] Revisión de seguridad **final** con `mytasks-security-auditor` (Principio III): dominios autorizados y *referrers* (sin comodines), lista CORS, `roles/firebasehosting.admin` y su mitigación (`prevent_destroy` y aprobación del `apply`), cabeceras de seguridad a través de Hosting, riesgo de toma de subdominio si se retira el dominio dejando DNS, URL adicional `web.app`, y el proveedor beta fijado; integrar el informe de la Phase 2 y registrarlo en `specs/005-custom-domain/security-review-final.md`
- [ ] T041 [US5] Repasar el checklist *Definition of Done* de la constitución para la feature completa y registrar el resultado en `specs/005-custom-domain/definition-of-done.md`, marcando como pendientes solo los puntos de la Phase 6
- [ ] T042 [P] [US5] Comprobar que `infra/README.md`, `infra/RUNBOOK.md` y `README.md` describen lo implementado (proveedor beta, sección 14, direcciones) y que `specs/005-custom-domain/contracts/*.md` coinciden con lo construido; corregir lo que haya cambiado durante la implementación
- [ ] T043 (propietario) Con las Phases 2–4 fusionadas y el CI de `develop` en verde, ejecutar en staging los escenarios 1–9 completos del quickstart si falta alguno, y cerrar `specs/005-custom-domain/validacion-staging.md`

**Checkpoint**: la feature queda lista para release.

---

## Phase 6: Release y puesta en servicio del dominio (propietario + pipeline)

**Purpose**: llevar la feature a producción y activar el dominio. Mayoría de tareas son del propietario;
el agente ayuda con las comprobaciones de solo lectura. Requiere la Phase 5 fusionada.

**Goal**: `https://inserttask.com` en servicio con certificado válido y las redirecciones funcionando.

**Independent Test**: escenarios 10–19 del quickstart en verde y registrados en
`specs/005-custom-domain/validacion-produccion.md`.

- [ ] T044 [US5] Crear la rama `release/1.3.0` desde `origin/develop` **sin commits propios** (el *ruleset* exige los 9 checks al crearla; si el último commit de `develop` los trae en rojo por un test flaky conocido, relanzar el job antes) y abrir la PR a `main` en español, con la lista de cambios, la validación de staging y las instrucciones posteriores a la fusión
- [ ] T045 (propietario) Fusionar la PR de la release; leer el plan de `plan-production` en `infra.yml` (altas de Hosting y de los dos dominios; cambios de `authorized_domains` y *referrers*; nada sobre Cloud Run, Firestore ni Firebase Auth más allá de eso) y aprobar el `apply` en el entorno `infra-production`
- [ ] T046 (propietario) Aprobar/esperar `deploy-production` y avisar cuando termine; si falla por «versión no validada», no relanzar y avisar al agente
- [ ] T047 [US1] Escenario 10 del quickstart: comprobar con `curl` que `https://pdlco-mytasks.web.app/` sirve la aplicación de producción (certificado, cabeceras, `/config.js` con la API y el proyecto de producción) y que `GET /health` de la API y `APP_VERSION` coinciden; comprobar la lista `CORS_ORIGINS` de la API de producción con el MCP en solo lectura
- [ ] T048 (propietario) Escenario 11–12: leer los registros requeridos en el resumen del `apply` (T035) o en la consola de Firebase, retirar en su proveedor los `A`/`AAAA`/`CNAME` previos, y añadir el `TXT` de propiedad, los `A`/`AAAA` del apex y de `www` y, solo si ya existían `CAA`, los dos `CAA`. **Plazo: antes de 30 días desde el `apply`**
- [ ] T049 [US3] Escenario 13: seguir el estado del dominio (salidas de Terraform en un `plan` posterior o consola de Firebase) hasta `OWNERSHIP_ACTIVE` y certificado activo; si queda en «Pending» o «Needs setup» más de 24 h, aplicar la tabla de diagnóstico de la RUNBOOK §14
- [ ] T050 [US1] Escenario 14 y 15: abrir `https://inserttask.com` en Chrome, Safari, Firefox y Edge actuales (candado, certificado emitido para el dominio, sin avisos) y comprobar las redirecciones `http://` y `www` con `curl -sI`
- [ ] T051 (propietario) Escenarios 16, 17 y 18: iniciar sesión con la cuenta invitada y con la no invitada desde `inserttask.com`, recorrer tablero, tareas, perfil, avatar y administración de accesos sin errores de CSP ni de CORS, y confirmar que `/config.js` apunta a producción
- [ ] T052 [US3] Anotar la fecha de caducidad del certificado y, pasadas unas semanas, comprobar que se renovó solo y que la factura no tiene concepto de certificado (escenario 19); si se hace tras el cierre, dejarlo como recordatorio en `validacion-produccion.md`
- [ ] T053 [US5] Registrar el resultado en `specs/005-custom-domain/validacion-produccion.md` (valores comunicados por el propietario, sin inventar detalle), marcar T041 como cerrada en `definition-of-done.md` y dejar la feature como terminada; abrir la PR documental a `develop`
- [ ] T054 (propietario) Decidir sobre el retro-merge de `main` a `develop` (GitFlow) y, si procede, pedir al agente que abra la PR; el agente no la fusiona

**Checkpoint**: dominio en servicio, validado y documentado.

---

## Dependencies & Execution Order

### Orden de las fases

- **Phase 1**: sin dependencias; T003 (propietario) bloquea el `apply` de la Phase 3 y T004 deja el RUNBOOK listo para la Phase 4.
- **Phase 2**: independiente de la 1 para el código; puede hacerse en paralelo a ella. Debe estar fusionada antes de validar la Phase 3 (T030).
- **Phase 3**: necesita la Phase 1 completa (permisos). Bloquea la Phase 4.
- **Phase 4**: necesita la Phase 3 fusionada y aplicada en staging.
- **Phase 5**: necesita las Phases 2–4 fusionadas.
- **Phase 6**: necesita la Phase 5 fusionada y el CI de `develop` en verde.

### Dentro de cada fase

- Los tests (T005–T007, T016, T031) se escriben antes y deben fallar.
- Cada PR espera a que el CI esté en verde antes de pedir la fusión al propietario.
- Nunca se ejecuta `terraform apply` ni `gcloud` de escritura desde el agente.

### Oportunidades de paralelismo

- Phase 1: T001 y T002 en paralelo.
- Phase 2: T005, T006 y T007 en paralelo; T014 aparte.
- Phase 3: T019, T020 y T024 en paralelo tras T017; T029 puede repartirse entre agente (curl) y propietario (cuentas).
- Phases 1 y 2 pueden ir en paralelo entre sí.

### Historias y fases

| Historia | Fases | Qué la completa |
|---|---|---|
| US1 Abrir con el dominio propio | 3, 4, 6 | T029, T032–T033, T047, T050 |
| US2 Iniciar sesión desde él | 2, 3, 6 | T006–T012, T023, T030, T051 |
| US3 Certificado gratuito que se renueva | 4, 6 | T034–T036, T049, T052 |
| US4 Canónico y redirecciones | 4, 6 | T031, T033, T050 |
| US5 Gobierno por IaC y guías | 1, 2, 5, 6 | T001–T004, T014–T015, T040–T043, T044–T054 |

---

## Implementation Strategy

### MVP primero

El MVP útil para el propietario es la **US1 con la US2**: Phases 1, 2 y 3 dejan la web servida por Hosting
en staging con el flujo completo; con la Phase 4 y el DNS se convierte en `inserttask.com`. No tiene
sentido entregar la Phase 4 sin la 3.

### Entrega incremental

1. Phase 1 y Phase 2 en paralelo → fusionar la 2 (inocua) → desplegar en staging.
2. Phase 3 → `apply` de staging aprobado → validar con `web.app`.
3. Phase 4 y Phase 5 → release 1.3.0 → `apply` de producción aprobado → DNS → validación.

### Riesgos conocidos

- **Recursos beta de Hosting**: la forma de la versión y la adopción del sitio por defecto se confirman
  con el primer `plan` real en staging (T026). Si el plan muestra un diseño distinto, se ajusta el
  módulo antes de seguir.
- **Chequeo de CORS en el pipeline**: un error aquí puede bloquear los despliegues de ambos entornos; por
  eso las pruebas van primero y la PR de la Phase 2 se despliega primero en staging (T013, escenario 8).
- **Permisos del propietario**: sin T003 el `apply` de la Phase 3 falla con error de permisos;
  `infra.yml` lo anota en el check.
- **Propiedad del dominio en 30 días**: si el propietario no pone el DNS a tiempo, Hosting borra el
  dominio y habría que volver a crearlo (un nuevo `apply`); T048 lo deja a la vista.
- **Flaky conocido de la 003** (`test_invite_the_same_address_twice_at_once…`): puede ponerse rojo el
  CI de `develop`; relanzar el job antes de crear `release/1.3.0` (T044). No tocar su código en esta
  feature.
- **Nada de lo que hace el propietario en su registrador** puede verificarlo el agente directamente: se
  comprueba por el estado de Hosting y por consultas DNS públicas.
