# Research: Infraestructura en Google Cloud y pipeline CI/CD

**Feature**: `002-cloud-run-cicd` | **Fecha**: 2026-09-29 | **Plan**: [plan.md](./plan.md)

La constitución fija la nube (solo Google Cloud), Firestore, el despliegue por pipeline y la
identidad del agente; la petición fija Cloud Run para frontend y backend. Este documento resuelve
lo demás en formato ADR (decisión, justificación, alternativas). Las afirmaciones sobre
servicios se contrastaron con el MCP `google-developer-knowledge`; lo que **no** se pudo
confirmar se marca como *a verificar en la implementación*.

---

## R1. Cómputo: dos servicios de Cloud Run por entorno

- **Decision**: `mytasks-web` (SPA servida por un Nginx sin privilegios) y `mytasks-api` (FastAPI
  con Uvicorn), ambos en Cloud Run, con URL nativas `run.app` con HTTPS. Escala a cero en los dos
  entornos; instancias máximas acotadas.
- **Rationale**: es lo que pide el propietario y el patrón por defecto para HTTP sin estado con
  carga variable (guía de selección de cómputo). Sin balanceador, VPC ni dominio propio
  (Principio I; el dominio propio está fuera de alcance en la spec).
- **Alternatives considered**: frontend en Cloud Storage + CDN o Firebase Hosting (más barato,
  pero contradice la petición de Cloud Run para ambos y añade otro servicio); balanceador HTTPS
  con un mapa de URL (mismo origen y Cloud Armor, pero coste fijo mensual y complejidad no
  justificados para uso personal); GKE (sobredimensionado).

## R2. Proyectos de Google Cloud y región

- **Decision** (ratificada por el propietario el 2026-09-29): **dos proyectos**. `pdlco-mytasks`
  (ya existe) aloja **producción y la plataforma**: identidad del agente, federación de identidad
  de GitHub, Artifact Registry y estado de Terraform. `pdlco-mytasks-stg` (nombre provisional, por
  crear) aloja solo staging. Región `europe-southwest1` (Madrid) para Cloud Run, Firestore y
  Artifact Registry.
- **Rationale**: se aísla lo que más importa, los **usuarios y datos de producción frente a los de
  pruebas** (FR-009, SC-009): cada proyecto tiene su propia base de usuarios de autenticación,
  y la documentación de Firebase recomienda proyectos distintos para producción y no producción.
  Se ahorra un proyecto frente a la propuesta inicial de tres. La imagen se promueve en el sentido
  seguro: staging lee del registro de producción, no al revés. Madrid está disponible en Firestore
  (regional) y en Cloud Run (precios de nivel 1, según la documentación de ubicaciones) y minimiza
  la latencia para el propietario.
- **Coste de la decisión**: la plataforma convive con los datos de producción, lo que se aparta de
  la recomendación de un proyecto dedicado a los *pools* de identidad (riesgo R-7 del plan). Se
  mitiga con administración solo por Terraform con aprobación, cuenta del agente en solo lectura y
  permisos a nivel de recurso (servicio, repositorio, cuenta de ejecución) en vez de a nivel de
  proyecto.
- **Alternatives considered**:
  - *Un único proyecto con una base de datos Firestore por entorno*: verificado en la documentación
    que se admiten hasta 100 bases de datos por proyecto, pero (a) la capa gratuita de Firestore
    aplica a una sola base de datos por proyecto, (b) la autenticación es una base de usuarios por
    proyecto y los tokens valen para todo el proyecto (la API de staging aceptaría tokens de
    producción), salvo que se usen *tenants* (más complejidad), (c) `roles/datastore.user` es de
    proyecto y habría que restringirlo por base de datos con condiciones de IAM (la sintaxis
    exacta no se pudo verificar), (d) el radio de daño de un error de IAM o de Terraform abarca
    ambos entornos y (e) no hay presupuestos ni cuotas separados. Viable para uso personal;
    rechazado por (a)–(b) frente a un coste marginal de un proyecto más.
  - *Tres proyectos* (plataforma independiente): la opción más limpia, pero con un proyecto más
    que crear, mantener y vincular a facturación sin beneficio proporcional para uso personal.
  - `europe-west1` (Bélgica, también válida: mismas capacidades y una alternativa si Madrid diera
    problemas de cuota); multirregión `eur3` de Firestore (mayor coste y sin requisito de
    disponibilidad que lo justifique).
- **Pendiente del propietario**: crear `pdlco-mytasks-stg` y vincular facturación (Fase 0).
  Identity Platform exige facturación activa en cada proyecto que lo use.

## R3. CI/CD: GitHub Actions con federación de identidad

- **Decision**: GitHub Actions para tests, despliegue e infraestructura. El pipeline se
  autentica en Google Cloud con Workload Identity Federation (token OIDC de GitHub), sin claves
  guardadas. Los jobs de despliegue usan *GitHub Environments* (`staging`, `production`,
  `infra-*`) y el `pool` de identidad solo acepta tokens del repositorio del propietario.
- **Rationale**: el repositorio y los rulesets ya están en GitHub; los *required status checks* de
  la constitución se refieren a checks de GitHub; evita configurar Cloud Build y su conexión
  con GitHub. La documentación consultada confirma el flujo: pool y proveedor OIDC con emisor de
  GitHub, condición de atributos por propietario, y permisos `id-token: write` en el workflow.
- **Endurecimiento** (de la documentación de mejores prácticas de federación): usar identificadores
  numéricos inmutables (`repository_id`, `repository_owner_id`) en la condición para evitar
  *squatting*; **no** usar comodines en los `principalSet`; limitar quién puede modificar el
  *pool* (solo por Terraform con aprobación); un proyecto dedicado sería lo ideal, pero se aceptó
  compartirlo con producción (R2, R-7).
- **Sobre `assertion.environment`**: la documentación consultada no lo confirma para GitHub
  (sí para otros proveedores). Diseño previsto: vincular cada identidad de despliegue al claim
  `sub` de GitHub con la forma `repo:OWNER/REPO:environment:ENTORNO`, mapeado a un atributo del
  proveedor. *A verificar en la implementación (Fase 3)* que el claim llega como se espera.
- **Identidades de `plan` en PR** (decidido por el propietario el 2026-09-30): el `plan` de
  `terraform-validate` necesita leer el estado y el proyecto, así que existen `terraform-plan-staging`
  y `terraform-plan-production`, de **solo lectura** (visor del proyecto y lectura del estado; sin
  escritura ni IAM), vinculadas al evento `pull_request` del repositorio propio (nunca de *forks*).
  Son las únicas identidades de Google Cloud que una PR puede alcanzar. *A verificar (Fase 3)* que
  el claim `sub` de un `pull_request` llega como `repo:OWNER/REPO:pull_request` y se puede
  acotar. Riesgo R-10 del plan.
- **Alternatives considered**: Cloud Build con activadores de GitHub (segunda generación:
  requiere autorizar la conexión de forma manual y añade un servicio); Cloud Deploy (canary
  avanzado fuera de alcance); claves de cuenta de servicio en secretos de GitHub (rechazado por
  FR-013).

## R4. Identidades e IAM (mínimo privilegio)

| Identidad | Proyecto | Para qué | Roles (resumen) |
|---|---|---|---|
| `mytasks-api-run-<env>` | del entorno | Ejecuta `mytasks-api`; accede a Firestore | `roles/datastore.user` (solo) |
| `mytasks-web-run-<env>` | del entorno | Ejecuta `mytasks-web` | ninguno |
| `deployer-<env>` | del entorno | Despliega revisiones desde el pipeline | `roles/run.developer` **sobre sus dos servicios**; `roles/iam.serviceAccountUser` solo sobre las dos cuentas de ejecución; `roles/artifactregistry.writer` sobre el repositorio (en el proyecto de producción) |
| `terraform-<env>` | del entorno | Aplica Terraform del entorno; `terraform-production` aplica también `infra/platform` (aprobación del propietario) | conjunto acotado de roles de administración de los servicios usados (revisión de seguridad; R-5) |
| `terraform-plan-<env>` | del entorno (`production` también lee la plataforma) | `terraform-validate` en PR (federación al evento `pull_request`) | **solo lectura**: visor del proyecto y lectura del estado; sin IAM ni escritura |
| `mytasks-ai-agent` | producción/plataforma | Identidad del agente (MCP) | tras el arranque: **solo lectura** en los dos proyectos |

- **Registro de imágenes entre proyectos**: el repositorio vive en el proyecto de producción. El
  agente de servicio de Cloud Run del proyecto de staging
  (`service-<número de proyecto>@serverless-robot-prod.iam.gserviceaccount.com`) necesita
  `roles/artifactregistry.reader` sobre ese repositorio (confirmado en la documentación de
  despliegue entre proyectos); el de producción lo lee dentro de su proyecto. `deployer-staging`
  necesita además permiso de escritura sobre el repositorio, y solo sobre él: no puede tocar los
  servicios ni los datos de producción.
- **Permisos a nivel de recurso**: como producción comparte proyecto con la plataforma, los roles
  de despliegue se conceden sobre el servicio, la cuenta de ejecución o el repositorio concretos,
  no sobre todo el proyecto.
- **Roles de despliegue**: `roles/run.developer` sobre el servicio, `roles/artifactregistry.reader`
  para leer la imagen y `roles/iam.serviceAccountUser` sobre la identidad de ejecución (confirmado
  en la documentación de IAM de Cloud Run).
- **Sin `roles/owner` ni `roles/editor`** en ninguna cuenta de servicio (lista de comprobación de
  seguridad del arquitecto).
- **Invocación anónima**: `allUsers` con `roles/run.invoker` en `mytasks-web` y `mytasks-api`
  (el navegador llama directamente a ambos). La protección de datos está en el token (Principio III).

## R5. Identificación y promoción de imágenes; ramas que despliegan en staging

- **Decision**: cada componente se construye como imagen inmutable etiquetada con el **hash de
  árbol de Git de su carpeta** (`backend/` o `frontend/`), no con el hash del commit. Tras superar
  las pruebas de humo en staging, la imagen recibe una etiqueta adicional `validated-<hash>`. La
  pipeline de producción **promueve** (despliega el mismo resumen de imagen) si existe esa
  etiqueta; si no existe, **falla** sin desplegar. Staging se despliega al hacer push a `develop`,
  `release/*` y `hotfix/*`.
- **Rationale**: con GitFlow, el commit de fusión en `main` es distinto del commit de `develop`
  aunque el contenido sea idéntico; el hash del árbol de la carpeta sí coincide, de modo que
  "lo validado en staging" y "lo que llega a `main`" se reconocen como el mismo artefacto (FR-006).
  Para que un `hotfix/*` cumpla el Principio IV (superar staging antes de producción), su rama
  también despliega en staging; su fusión en `main` reutiliza esa imagen. Un cambio que llegue a
  `main` sin haber pasado por staging no se despliega (puerta dura; no hay despliegue manual de
  emergencia, Principio VI).
- **Etiquetas inmutables** en Artifact Registry: una etiqueta no puede moverse ni borrarse, pero
  se pueden añadir etiquetas nuevas (confirmado en la documentación), lo que encaja con
  `validated-<hash>`.
- **Efecto en staging**: staging es único; una rama `hotfix/*` o `release/*` sustituye
  temporalmente la versión de `develop`, que se restaura en el siguiente push a `develop`.
- **Cambio propuesto a la spec**: FR-002 dice "fusión en `develop`"; conviene ampliarlo a
  `release/*` y `hotfix/*` (ver *Decisiones para el propietario* en el plan).
- **Alternatives considered**: etiquetar por hash de commit (no coincide entre `develop` y `main`);
  reconstruir en `main` (artefacto distinto); promoción manual con aprobación (contradice la
  automatización pedida).

## R6. Despliegue en dos pasos y coherencia frontend/API

- **Decision**: en cada entorno, `deploy.yml` (1) despliega una revisión nueva de cada servicio
  **sin tráfico y con una etiqueta**, (2) ejecuta las pruebas de humo contra las URL etiquetadas,
  (3) solo si todo pasa, dirige el 100 % del tráfico a las revisiones nuevas, primero la API y
  después el frontend, y (4) si falla cualquier paso previo al cambio de tráfico, no toca el
  tráfico y el job falla.
- **Rationale**: la documentación de Cloud Run confirma que una revisión desplegada sin tráfico
  no recibe tráfico de producción y que la etiqueta le da una URL propia para probarla antes de
  migrar el tráfico. Esto garantiza FR-007 sin depender del comportamiento por defecto ante
  fallos. La documentación no dice explícitamente qué ocurre con una revisión que no arranca en
  un despliegue normal; por eso el diseño no se apoya en ello.
- **Coherencia (FR-008)**: dos servicios no se conmutan atómicamente. Reglas: la API cambia
  primero; **los cambios de contrato deben ser compatibles hacia atrás durante una versión**
  (añadir campos/endpoints antes de retirarlos, "expandir y contraer"); si el paso de tráfico del
  frontend falla tras el de la API, el job revierte el tráfico de la API a la revisión anterior.
  La regla de compatibilidad **se hace cumplir en CI** (decidido el 2026-09-30): el check
  `api-contract-compat` genera el contrato OpenAPI de la API de la PR y el de su rama destino y
  falla ante un cambio incompatible (campo o endpoint retirado, tipo más restrictivo); retirar algo
  exige dos PR consecutivas (expandir y contraer).
- **Pruebas de humo** (`smoke`): `mytasks-api` responde en `/readyz` (Firestore accesible) y en
  `/healthz` con la versión esperada; un endpoint de datos sin token devuelve `401` (la API no
  está abierta); `mytasks-web` sirve `/` y `/config.js` con la URL de API del entorno.
- **Alternatives considered**: despliegue directo con tráfico inmediato (la comprobación llega
  tarde); Cloud Deploy con *canary* (fuera de alcance de la spec).

## R7. Configuración en tiempo de ejecución, URL y red

- **Decision**: el frontend lee su configuración (URL de la API y configuración pública de
  Firebase) de `window.__APP_CONFIG__`, que `/config.js` define al arrancar el contenedor a
  partir de variables de entorno del servicio. `import.meta.env` queda como respaldo para
  desarrollo local. La API recibe `APP_ENV`, `GOOGLE_CLOUD_PROJECT`, `CORS_ORIGINS` y
  `APP_VERSION` como variables de entorno.
- **Rationale**: Vite incrusta `VITE_*` en la compilación; sin este cambio habría una imagen por
  entorno y no se podría promover el mismo artefacto (FR-006, FR-014). El código actual usa
  `import.meta.env` en `frontend/src/lib/firebase.ts` y `frontend/src/lib/apiClient.ts`.
- **URL previsibles**: la documentación confirma el formato determinista
  `https://SERVICIO-NÚMERO_DE_PROYECTO.REGIÓN.run.app` (siempre que el segmento DNS tenga ≤ 63
  caracteres), asignado antes de crear el servicio. Terraform lo calcula desde el número de
  proyecto y puede fijar `CORS_ORIGINS` (URL del frontend) y la URL de la API sin dependencia
  circular. Los nombres de servicio deben ser cortos para no superar el límite.
- **Red**: sin VPC ni conector; Firestore e Identity Platform se acceden por las APIs de Google.
  Cabeceras de seguridad adicionales en Nginx (la API ya las añade).
- **Autenticación de usuarios**: los dominios del frontend (`run.app` de cada entorno) se
  añaden a los *dominios autorizados* de Identity Platform por Terraform.

## R8. Secretos y proveedor de Google

- **Decision**: la aplicación **no necesita secretos en ejecución**: la API usa la identidad de su
  cuenta de ejecución para Firestore y la configuración web de Firebase es pública. Secret Manager
  queda habilitado pero sin secretos de aplicación en esta feature. El proveedor "Google" de
  Identity Platform se configura **manualmente una vez por entorno** (consentimiento OAuth y
  cliente), documentado en `infra/RUNBOOK.md`.
- **Rationale**: la documentación consultada indica que la configuración por API/Terraform del
  proveedor exige `client_id` y `client_secret`, y que la pantalla de consentimiento es un proceso
  manual sin automatización documentada. Evitar el secreto en Terraform (y en su estado) es
  preferible a un secreto de OAuth en el pipeline.
- **Coste de la decisión**: SC-007 se cumple con un paso manual **documentado** (la spec exige "sin
  pasos manuales no documentados"). Riesgo R-2 del plan.
- **Requisito previo**: Identity Platform necesita el plan de facturación activo en el proyecto.
- **Alternatives considered**: guardar el secreto del cliente en Secret Manager y aplicarlo por
  Terraform (el secreto acabaría en el estado y exige otro paso manual para crearlo de todos
  modos).

## R9. Infraestructura como código: Terraform, estado y aplicación

- **Decision**: Terraform con los proveedores `google` y `google-beta`. Un módulo de entorno
  reutilizado por las raíces `staging` y `production` y una raíz `platform` (recursos que están en el
  proyecto de producción pero no son del entorno: federación, registro, estado). Estado en un
  bucket de GCS versionado del proyecto de producción, un estado por raíz. `platform` y
  `production` se aplican solo tras fusionar en `main`, con la identidad `terraform-production`;
  `staging`, tras fusionar en `develop`, con `terraform-staging`. **`plan` en PR y `apply` solo desde
  `infra.yml`, con aprobación del propietario mediante el *environment* de GitHub.** Ni el agente
  ni el propietario ejecutan `apply` en local.
- **Rationale**: FR-011 (reproducible) y Principios V y VI. El agente no puede ejecutar Terraform:
  el MCP solo ejecuta comandos de `gcloud` y FR-023 le impide leer la clave. La aprobación del
  *environment* materializa la "confirmación explícita" exigida a todo cambio de infraestructura
  (FR-020).
- **Firestore**: la política TTL se declara con un recurso de campo sobre la colección `tasks`
  y el campo `purge_at` (con `ttl_config`), y los índices compuestos con un recurso de índice; la
  documentación consultada confirma ambos. Los índices deben coincidir con
  `firestore.indexes.json` de la feature 001 (colección `tasks`, ámbito de colección).
- **Arranque (chicken-and-egg)**: para poder aplicar por pipeline, deben existir antes el bucket
  de estado, la federación de identidad y las identidades de Terraform (`terraform-*` y
  `terraform-plan-*`). Además, como `platform` y `production` solo se aplican al fusionar en
  `main`, el arranque incluye **todo lo que staging necesita antes de la primera release**: el
  repositorio de Artifact Registry, las cuentas `deployer-*` con sus permisos a nivel de recurso y
  la lectura del repositorio para el agente de servicio de Cloud Run de staging. Se crean una
  única vez con el MCP y la cuenta del agente, con permisos temporales concedidos por el
  propietario y confirmación explícita de cada cambio, y después se **adoptan** en el código de
  `infra/platform` (importación de estado, que se ejecuta en la primera aplicación desde `main`). Los permisos temporales se retiran al terminar (runbook).
- **Alternatives considered**: `terraform apply` en local con la clave del agente (contradice
  FR-023); Pulumi (sin ventaja para el equipo); Config Connector (exige un clúster).

## R10. Observabilidad, registro de despliegues y notificaciones

- **Decision**:
  - **Registro de despliegues (FR-017)**: los *environments* de GitHub registran cada despliegue
    con commit, rama, resultado y URL; además, cada revisión de Cloud Run lleva etiquetas de
    commit, hash de árbol y ejecución del pipeline (`commit`, `tree-hash`, `pipeline-run`).
  - **Versión visible (US4)**: `APP_VERSION` se expone en `/healthz` y en `/config.js`.
  - **Notificaciones (FR-018, SC-006)**: las notificaciones nativas de GitHub Actions por fallo de
    workflow (correo/móvil del propietario), documentadas en el runbook y verificadas en el
    quickstart. Sin servicio propio.
  - **Registros**: Cloud Logging por defecto (el backend ya emite JSON estructurado).
  - **Presupuestos**: alertas de facturación al 50/90/100 % por proyecto (el de producción incluye la plataforma); requieren
    permisos de facturación del propietario (Fase 6).
- **Rationale**: máxima simplicidad (Principio I) usando lo que ya existe. Monitorización de
  aplicación más allá de esto está fuera de alcance de la spec.
- **Alternatives considered**: notificaciones a Slack/Pub/Sub con Cloud Run (más piezas);
  *uptime checks* de Cloud Monitoring (fuera de alcance).

## R11. Dimensionado y coste

- **Decision**: 1 vCPU y 512 MiB (API) / 256 MiB (web); instancias mínimas 0 en ambos entornos;
  instancias máximas 2 en staging y 5 en producción (tope de coste y de abuso, R-4);
  facturación basada en solicitudes.
- **Rationale**: uso personal. Según la documentación: la capa gratuita de Cloud Run incluye
  2 millones de solicitudes, 180 000 vCPU-segundos y 360 000 GiB-segundos al mes; con
  instancias mínimas 0 no se cobra sin tráfico, y con mínimo 1 se cobra el ciclo de vida completo
  (más barato en reposo). Coste estimado ≈ 0–5 USD/mes por entorno. **No verificado** con la
  documentación consultada: precio y capa gratuita de Artifact Registry, de Firestore y de
  Identity Platform; se espera que sean marginales para este volumen y deben confirmarse antes
  de fijar el presupuesto (Fase 6).
- **Trade-off**: con mínimo 0 el primer acceso tras un periodo de inactividad sufre arranque en
  frío (~1–2 s según la guía de selección). Aceptado para uso personal; si molesta, subir a 1 en
  producción tiene coste fijo pequeño.

## R12. Identidad aislada del agente (resumen)

Detalle y verificaciones en [contracts/agent-identity.md](./contracts/agent-identity.md).

- **Decision**: el MCP de Google Cloud se define en `.mcp.json` del proyecto con un directorio de
  configuración de `gcloud` propio que solo contiene la identidad del agente (clave de su cuenta
  de servicio, sin suplantación). El servidor actual de ámbito usuario, que suplanta a la cuenta
  desde credenciales personales, se **retira**. El agente no puede leer la configuración personal
  de `gcloud`, sus credenciales por defecto ni la clave (sandbox y denegaciones de lectura), y un
  hook determinista rechaza cualquier intento de cambiar de identidad. La auditoría de Google
  Cloud verifica a posteriori que solo actuó la cuenta del agente.
- **Rationale**: la garantía descansa en que las credenciales personales **no existen** en el
  entorno del MCP, no en que el agente decida no usarlas; las capas de bloqueo y el hook son
  defensa en profundidad.
- **Riesgo**: R-1 (políticas de organización que impidan crear claves) y R-6 (comportamiento del
  MCP no verificado).

### Verificado (T007, 2026-10-01)

Fuentes: README y `src/index.ts` de `googleapis/gcloud-mcp`, y la documentación de Claude Code
sobre sandbox, permisos, ajustes y hooks.

- **`gcloud-mcp` no bloquea el cambio de identidad por sí mismo (cierra R-6).** Su lista de
  comandos denegados por defecto solo contiene comandos interactivos o de SSH (`compute ssh`,
  `compute start-iap-tunnel`, `compute connect-to-serial-port`, `compute tpus tpu-vm ssh`,
  `compute tpus queued-resources ssh`, `cloud-shell ssh`, `workstations ssh`, `app instances ssh`,
  `interactive`, `meta`). **No** incluye `auth`, `config set`, `--account` ni
  `--impersonate-service-account`. Admite un fichero JSON de denylist/allowlist con `--config`
  (formato no documentado en el README). Sus permisos son los de la cuenta activa de `gcloud`.
  Conclusión: el hook de identidad (T009) es necesario como segunda capa; la capa 1 (sin
  credenciales personales en el almacén aislado) sigue siendo la garantía principal.
- **Sandbox de Bash** (`.claude/settings.json`): `sandbox.enabled`,
  `sandbox.filesystem.denyRead` / `allowRead` (gana la ruta más específica),
  `sandbox.credentials.files` y `sandbox.credentials.envVars` con `"mode": "deny"` (las variables
  se eliminan del entorno de cada comando), `sandbox.allowUnsandboxedCommands: false` (anula el
  parámetro `dangerouslyDisableSandbox`) y `sandbox.failIfUnavailable: true`. Las entradas
  `deny` se fusionan entre ámbitos y ninguno puede retirarlas. Por defecto el sandbox **permite**
  leer todo el equipo salvo directorios denegados, y avisa y sigue sin sandbox si no arranca.
- **Herramientas de fichero**: el sandbox solo cubre Bash. Para `Read`, `Grep` y `Glob` hacen falta
  reglas `permissions.deny` con `Read(...)`: `~/ruta` (relativa al directorio personal) y
  `//ruta` (absoluta); `Edit(...)` cubre las herramientas de edición. Claude Code aplica `Read`
  "en la medida de lo posible" a Grep/Glob y a las menciones `@fichero`, y los `deny` también
  actúan sobre el destino de un enlace simbólico.
- **Hook `PreToolUse`**: se registra en `settings.json` con `matcher` `mcp__gcloud__.*` (o la
  herramienta concreta `mcp__gcloud__run_gcloud_command`); recibe por la entrada estándar un JSON
  con `tool_name` y `tool_input`; el código de salida 2 (con el motivo por la salida de errores) o
  un JSON con `permissionDecision: "deny"` bloquean la llamada. Dispone de `$CLAUDE_PROJECT_DIR`.
- **Variables del MCP**: el servidor MCP es un proceso propio, no sandboxed; recibe el entorno
  definido en `.mcp.json` (`env`), no el de Bash.

## R13. Empaquetado de imágenes: Buildpacks por defecto, Dockerfile por excepción

- **Decision** (ratificada por el propietario el 2026-09-30): las imágenes se construyen con
  **Buildpacks de Google Cloud** siempre que el componente encaje. Hoy:
  - `mytasks-api`: buildpack de Python (builder `gcr.io/buildpacks/builder` fijado por digest
    o, si no es posible, por etiqueta de versión, nunca `latest`; su identificador vive dentro de
    `backend/` para que subirlo cambie el hash de árbol y reconstruya la imagen, de modo que los
    parches del builder sí llegan a las imágenes), con `uv.lock` + `pyproject.toml` y el
    arranque fijado con `GOOGLE_ENTRYPOINT` en `backend/project.toml` (Uvicorn en `PORT`/8080).
    **Se sube el runtime de la API a Python 3.13**: el soporte de `pyproject.toml` es *Preview*
    en 3.12 y GA desde 3.13 (la constitución admite "Python 3.12+", así que no hay conflicto).
  - `mytasks-web`: **Dockerfile** (build de Vite + Nginx sin privilegios). Es una excepción
    justificada: el buildpack de Node ejecuta `npm run build`, **elimina las `devDependencies`**
    tras el build y arranca un proceso Node; la documentación consultada no cubre servir una SPA
    estática. Obtener el mismo resultado exigiría escribir y mantener un servidor Node propio
    (fallback SPA, cabeceras, caché y `/config.js` en runtime) con más código y más superficie
    que Nginx.
- **Cómo se construye**: `pack build --publish` dentro de GitHub Actions (el runner ya trae
  Docker), autenticado por la federación de identidad, publicando en Artifact Registry con la
  etiqueta de hash de árbol (R5). **No se usa Cloud Build ni `gcloud run deploy --source`**: eso
  añadiría un servicio (contra el Principio I) y construiría en el momento del despliegue en vez
  de promover un artefacto ya validado (contra FR-006).
- **Rationale**: menos ficheros de empaquetado que mantener, parches de seguridad de la imagen
  base y del runtime aportados por el builder, y usuario sin privilegios sin configuración propia
  (*a verificar*, ver R-8). La promoción de R5 no cambia: se identifica y promueve el mismo
  digest, da igual cómo se construyó.
- **A verificar en la implementación (Fase 2)**: (a) que el builder instala solo las
  dependencias de producción de `uv.lock` (no el grupo `dev`); (b) el mecanismo para fijar la
  versión de Python (`.python-version` o `GOOGLE_PYTHON_VERSION`); (c) que la imagen final corre
  sin privilegios; (d) que ningún `.env` ni caché local entra en la imagen (en CI el checkout es
  limpio, pero `backend/.env` existe en local); (e) si `pack` admite builds repetibles lo bastante
  estables para el check `images-build`; (f) dónde fijar el builder dentro de `backend/`
  (`project.toml` si `pack` lo admite, o un fichero propio) y si Google publica digests estables.
- **Regla para el futuro**: un componente nuevo usa Buildpacks salvo que se justifique en
  *Complexity Tracking* por qué no encaja (runtime no soportado, servidor estático, dependencias
  del sistema que el builder no ofrece).
- **Alternatives considered**: Dockerfile para ambos (lo que había; más control pero más
  mantenimiento); buildpacks para ambos con servidor Node propio para la web; buildpacks de
  Paketo con Nginx para la web (segundo builder y segunda política de soporte); Cloud Build o
  `--source` (ver arriba).

## R14. Repositorio único para aplicación e infraestructura

- **Decision** (ratificada por el propietario el 2026-09-30): `backend/`, `frontend/` e `infra/`
  permanecen en **un único repositorio**. La preocupación (un error en una fusión rompe varias
  piezas) se trata con salvaguardas, no con un segundo repositorio.
- **Rationale**: ya están desacoplados los artefactos (la imagen se identifica por el hash de
  árbol de su carpeta, así que `infra/**` no la cambia), las identidades (despliegue y Terraform
  separadas), las ejecuciones (aprobación del propietario antes de cada `apply`) y la propiedad
  (Terraform ignora imagen y tráfico). Separar duplicaría GitFlow, rulesets, environments y
  federación, partiría Spec Kit y la constitución (una feature como la 002 cruza app e infra) y
  dejaría el contrato de variables de entorno en dos sitios con riesgo de desfase. El beneficio
  clásico (permisos distintos por equipo) no existe con un único propietario (Principio I).
- **Salvaguardas adoptadas**: protección contra borrado de Firestore, Cloud Run y de los
  recursos de plataforma (Fichas 5 y 6); checks requeridos que siempre se ejecutan, sin filtro de
  rutas a nivel de workflow; reglas de interacción entre despliegue e infraestructura, con grupos
  de concurrencia separados (contracts/pipeline.md); cambios de contrato de variables en dos PR
  consecutivas.
- **Cuándo reabrirlo**: (1) un segundo proyecto o aplicación comparte la plataforma; (2) alguien
  distinto del propietario opera la aplicación o la infraestructura; (3) la cadencia de cambios
  de infraestructura diverge mucho de la de la aplicación; (4) se quiere reconfigurar la
  plataforma con independencia de cada feature.
- **Si se reabre**: separar solo `infra/platform` (federación, estado y registro: el mayor
  impacto). `envs/*` y el módulo de entorno cambian con la aplicación y se quedan junto a ella.
  Requeriría que la federación confíe en ambos repositorios (ids numéricos y entornos de cada uno).
- **Alternatives considered**: repositorio de infraestructura completo e independiente; solo
  `platform` separado desde el principio (añade coordinación sin necesidad hoy).

---

## Documentación consultada

Consultas al MCP `google-developer-knowledge` (2026-09-29):

- Despliegue en Cloud Run desde GitHub Actions con federación de identidad y roles del
  desplegador: `docs.cloud.google.com/run/docs/reference/iam/roles`,
  `docs.cloud.google.com/functions/docs/reference/iam/roles`.
- Federación con canalizaciones de despliegue y mejores prácticas:
  `docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines`,
  `docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation`.
- Revisiones sin tráfico, etiquetas y migración de tráfico:
  `docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration`,
  `docs.cloud.google.com/run/docs/configuring/healthchecks`,
  `docs.cloud.google.com/run/docs/container-contract`.
- URL deterministas de Cloud Run: `docs.cloud.google.com/run/docs/triggering/https-request`.
- Ubicaciones de Firestore y Cloud Run: `firebase.google.com/docs/firestore/locations`,
  `docs.cloud.google.com/run/docs/locations`.
- Varias bases de datos por proyecto, capa gratuita e IAM por base de datos:
  `docs.cloud.google.com/firestore/native/docs/security/iam`,
  `docs.cloud.google.com/firestore/quotas`, `firebase.google.com/docs/firestore/manage-databases`.
- Usuarios por proyecto, *tenants* y entornos: `firebase.google.com/docs/projects/dev-workflows/general-best-practices`,
  `docs.cloud.google.com/identity-platform/docs/multi-tenancy`.
- TTL e índices con Terraform: `firebase.google.com/docs/firestore/ttl`,
  `firebase.google.com/docs/reference/firestore/indexes`.
- Proveedor de Google en Identity Platform:
  `docs.cloud.google.com/identity-platform/docs/web/google`,
  `firebase.google.com/docs/auth/configure-oauth-rest-api`.
- Precios y capa gratuita de Cloud Run:
  `docs.cloud.google.com/run/docs/configuring/billing-settings`,
  `docs.cloud.google.com/run/docs/tips/services-cost-optimization`,
  `docs.cloud.google.com/run/docs/configuring/min-instances`.
- Buildpacks de Google Cloud (`pack`, Python con `uv`, Node, builders y soporte por versión de
  runtime, `GOOGLE_ENTRYPOINT`): `docs.cloud.google.com/run/docs/deploying-source-code`,
  `docs.cloud.google.com/docs/buildpacks/python`,
  `docs.cloud.google.com/docs/buildpacks/nodejs`,
  `docs.cloud.google.com/docs/buildpacks/builders`,
  `docs.cloud.google.com/docs/buildpacks/runtime-support`,
  `docs.cloud.google.com/docs/buildpacks/service-specific-configs`.
- Artifact Registry entre proyectos y etiquetas inmutables:
  `docs.cloud.google.com/artifact-registry/docs/integrate-cloud-run`,
  `docs.cloud.google.com/artifact-registry/docs/repositories/create-repos`.

## Lo que no se ha podido confirmar

- Que el claim `environment` de GitHub llegue mapeable en el proveedor de identidad y que el
  `sub` de un `pull_request` se pueda acotar al repositorio propio (R3).
- Si `gcloud-mcp` bloquea por sí mismo el cambio de identidad (R12, R-6).
- Precios de Artifact Registry, Firestore e Identity Platform (R11).
- Buildpacks (R13): dependencias de producción desde `uv.lock`, fijación de la versión de Python,
  usuario sin privilegios de la imagen final, repetibilidad de las construcciones y cualquier
  soporte de SPA estática en el buildpack de Node.
- Nombres exactos de las opciones de sandbox de Claude Code para denegar lecturas: verificar con
  la documentación de Claude Code al implementar la Fase 1.
