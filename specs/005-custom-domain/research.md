# Investigación (Fase 0): dominio propio con certificado gratuito

**Feature**: [spec.md](./spec.md) · **Fecha**: 2026-10-25 · **Rol**: arquitecto de Google Cloud
(`mytasks-google-cloud-architect`)

Fuentes consultadas (MCP `google-developer-knowledge`, documentación a fecha de hoy) y comprobaciones
en el repositorio. Lo que **no** se pudo comprobar aparece marcado como «a verificar» con el paso
concreto que lo comprueba.

Documentos citados:
`documents/firebase.google.com/docs/hosting/cloud-run`,
`documents/firebase.google.com/docs/hosting/custom-domain`,
`documents/docs.cloud.google.com/iam/docs/roles-permissions/firebasehosting`,
`documents/firebase.google.com/docs/hosting/usage-quotas-pricing`,
`documents/developers.google.com/public-key-infrastructure/faq/configure-caa`; y la referencia del
recurso `google_firebase_hosting_custom_domain` del proveedor `google-beta`
(`terraform-provider-google-beta`, `website/docs/r/firebase_hosting_custom_domain.html.markdown`).

---

## R1 — ¿Puede Firebase Hosting encaminar a Cloud Run en `europe-southwest1`? (el riesgo del plan)

**Decisión**: sí; se usa un *rewrite* de Hosting hacia el servicio Cloud Run `mytasks-web` existente.
No hay que cambiar de región.

**Evidencia**: la guía «Serve dynamic content and host microservices with Cloud Run» lista
`europe-southwest1` entre las regiones donde se admiten *rewrites* de Hosting a Cloud Run. Solo
recomienda colocalizar en `us-west1`, `us-central1`, `us-east1`, `europe-west1` y `asia-east1` «para
el mejor rendimiento». Es una recomendación de latencia, no una restricción.

**Consecuencia**: hay un salto adicional entre la CDN de Hosting y Madrid. A este volumen (cuenta de
un único propietario con acceso por invitación) es asumible, y SC-005 lo mide en validación. El
riesgo que preocupaba a la spec queda **descartado**; no hace falta pedirte ninguna decisión sobre la
topología.

**Alternativas descartadas**
- *Mapeo de dominios de Cloud Run*: no disponible en esta región (restricción que ya aportaste).
- *Cambiar el servicio a una región colocalizada*: mueve la API y la web, rompe la paridad con Firestore
  (`europe-southwest1`) y no es necesario.
- *Balanceador de carga externo con NEG serverless y certificado gestionado*: funciona con la región,
  pero tiene coste fijo mensual por la regla de reenvío y la IP, lo que contradice «certificado
  gratuito» (FR-003/SC-002) como espíritu del proyecto y añade mucho más IaC.

## R2 — Qué sirve Hosting: un único *rewrite* `**` → `mytasks-web`, sin `pinTag`

**Decisión**: la versión de Hosting contiene solo una regla: todas las rutas se reescriben al servicio
`mytasks-web` de la región del entorno. Sin contenido estático propio en Hosting.

**Por qué**: `mytasks-web` ya sirve la SPA completa (activos con *hash*, `index.html`, `config.js`,
cabeceras de seguridad). Duplicar los estáticos en Hosting crearía dos fuentes de verdad y rompería
FR-012 (servir lo que despliega el pipeline).

**Sin `pinTag`**: con `pinTag` Hosting fija cada *release* a la revisión de Cloud Run vigente al
desplegar; haría falta un nuevo *release* de Hosting en cada despliegue del pipeline y la guía avisa de
límites de etiquetas (1000 por servicio). Sin él, Hosting enruta a la revisión que tenga el tráfico, y
el pipeline (revisiones sin tráfico → humo → mover tráfico) sigue siendo el único que decide qué se
sirve. Esto cumple FR-012 sin tocar el pipeline de despliegue de imágenes.

**Caché**: Hosting solo cachea en CDN las respuestas que el origen marca como cacheables. El
contenedor ya responde `no-store` para `index.html`, `config.js` y las rutas de la SPA, y
`public, max-age=31536000, immutable` para `/assets/` (nombres con *hash*): comportamiento correcto
sin cambios. (Dato de la guía: Hosting aplica un límite de 60 s por petición, irrelevante para una web
estática.)

**A verificar (en staging)**: que las cabeceras de seguridad del contenedor (`Content-Security-Policy`,
`Strict-Transport-Security`, `X-Frame-Options`…) llegan intactas al navegador a través de Hosting. Si
alguna se perdiera, se declaran en la configuración de Hosting (campo `headers` de la versión).

## R3 — La API queda fuera de Hosting

**Decisión**: la API sigue en su dirección `run.app` y el navegador la llama directamente, como hoy.
Hosting no encamina `/api/**`.

**Por qué**: (1) cero cambios en el código de la API y en `API_BASE_URL`; (2) evita que la CDN de
Hosting vea tráfico autenticado y respuestas con `Vary: Authorization` y avatares privados (la
revisión de seguridad de la 004 corrigió justo un riesgo de caché compartida, MED-001 de la Fase 6);
(3) Principio I: no se añade nada que no haga falta. Coste: hay que permitir el nuevo origen en CORS
(R9).

**Alternativa descartada**: servir la API bajo el mismo dominio (`/api/**` → `mytasks-api`). Quita
CORS, pero multiplica el riesgo anterior y obliga a revisar el contrato 001 entero. Se puede abordar
en otra feature si se quiere.

## R4 — Cómo se declara en Terraform: proveedor `google-beta`

**Hallazgo**: el proveedor `google` GA fijado en el repositorio (`~> 8.6.0`) **no contiene** ningún
recurso `google_firebase_hosting_*` (comprobado en el binario descargado: solo trae
`google_firebase_app_hosting_*`, que es App Hosting, otro producto con compilación propia desde
GitHub, no aplicable). Los recursos de Hosting (`google_firebase_hosting_site`, `_version`, `_release`
y `_custom_domain`) existen únicamente en `google-beta`, con un ejemplo oficial exacto para Hosting
→ Cloud Run.

**Decisión**: añadir `hashicorp/google-beta` fijado a la misma línea (`~> 8.6.0`), con su
`.terraform.lock.hcl` actualizado, y usarlo **solo** en esos cuatro recursos
(`provider = google-beta`). El resto de la infraestructura sigue en `google` GA.

**Por qué no las alternativas**
- *Firebase CLI en el pipeline (`firebase deploy --only hosting`)*: herramienta nueva, y habría que
  dar `firebasehosting.admin` a la identidad de despliegue (`deployer-*`), que hoy solo toca Cloud Run;
  además el dominio no pasaría por el plan revisado y la aprobación de `infra` (Principios V–VII).
- *Consola de Firebase a mano*: prohibido (Principio VI) y no repetible.
- *Llamar a la API REST desde un script*: reinventa el proveedor.

**Riesgo asumido (Complexity Tracking)**: los recursos beta pueden cambiar entre versiones. Se
mitiga fijando la versión, con el *lockfile* y con el plan de solo lectura en cada PR (`infra.yml`).

**A verificar (primer `plan` real en staging)**: la forma exacta de `google_firebase_hosting_version`
(inmutable: un cambio de configuración crea una versión nueva y un *release* nuevo) y la adopción por
`import` del sitio por defecto si ya existe.

## R5 — Sitio de Hosting: el sitio por defecto de cada proyecto

**Decisión**: usar el sitio por defecto de cada proyecto (`pdlco-mytasks` → `pdlco-mytasks.web.app`;
`pdlco-mytasks-stg` → `pdlco-mytasks-stg.web.app`), no crear sitios adicionales. Si ya existe (lo normal
en un proyecto Firebase), se adopta con un bloque `import`, como ya se hizo con Identity Platform; si
no, se crea.

**Por qué**: `<proyecto>.web.app` **ya está** entre los dominios autorizados de Identity Platform
(`identity.tf`), así que el inicio de sesión funciona en él sin cambios; y evita un segundo sitio.

**A verificar (antes de empezar)**: si el sitio por defecto existe en cada proyecto (lectura con el MCP
de Google Cloud cuando la cuenta del agente tenga lectura de Hosting, o el propietario en la consola).

## R6 — Dominio propio: apex canónico y `www` con redirección

**Decisión**: dos dominios personalizados en el sitio de **producción**:
`inserttask.com` (canónico, sirve la web) y `www.inserttask.com` con `redirect_target = inserttask.com`
(Hosting responde 301 conservando la ruta). Y uno en el sitio de **staging**:
`staging.inserttask.com`, sin redirección, como **ensayo** (decisión del propietario, R10).
`wait_dns_verification = false` en todos: el `apply` no debe quedarse esperando al DNS del propietario;
el estado se consulta después (R12).

**Certificado**: gratuito y gestionado por Hosting (CA `pki.goog` o `letsencrypt.org`), emitido y
renovado automáticamente («SSL incluido sin cargo» según la página de precios). Se deja el tipo por
defecto (`GROUPED`).

**Configuración rápida («Quick Setup»)** porque el dominio es nuevo y no recibe tráfico: no hace falta
migración sin cortes.

**Plazo a tener en cuenta**: si la propiedad del dominio no pasa a activa en 30 días desde su creación,
Hosting elimina el dominio personalizado. La guía debe fijar ese plazo al propietario.

## R7 — Qué hace el propietario en su proveedor de DNS (fuera de Google Cloud)

Los valores exactos los entrega Hosting tras el `apply` (atributo `required_dns_updates`, solo valores
públicos). Estructura esperada:

| Registro | Para qué | Notas |
|---|---|---|
| `TXT` con `hosting-site=<site_id>` | Propiedad del dominio | **Debe permanecer siempre**: Hosting lo usa para autorizar y renovar el certificado |
| `A` y `AAAA` del apex y de `www` hacia las IP de Hosting | Dirigir el tráfico | Retirar antes cualquier `A`/`AAAA`/`CNAME` del proveedor (típicos de «aparcado»): si hay otros, no se emite el certificado |
| `CAA` (solo si ya existen registros `CAA`) | Permitir la emisión | Deben autorizar `pki.goog` y `letsencrypt.org`; si no existe ninguno, no se toca |

La documentación avisa de que propagar y emitir puede tardar horas y hasta 24 h.

**Dos proyectos, un mismo dominio base.** La propiedad en Hosting se establece por proyecto de Firebase
mediante registros `TXT` y **se hereda por los subdominios**; la referencia del recurso indica que se
puede conceder otro proyecto sobre un subdominio añadiendo registros `TXT` específicos en él. Por tanto:

| Nombre | Proyecto propietario | Registro de propiedad |
|---|---|---|
| `inserttask.com` (y `www`, por herencia) | `pdlco-mytasks` | `TXT` `hosting-site=pdlco-mytasks` en el apex |
| `staging.inserttask.com` | `pdlco-mytasks-stg` | `TXT` `hosting-site=pdlco-mytasks-stg` en `staging.inserttask.com` |

Los `A`/`AAAA` de `staging` apuntan a Hosting igual que los del apex. **A verificar en el ensayo de
staging**: que Hosting acepta a la vez la propiedad del apex para producción y la del subdominio para
staging sin conflicto (`OWNERSHIP_CONFLICT`/`MISMATCH`). Si no la aceptara, el ensayo lo revela antes de
producción y se revisa el diseño con el propietario (la alternativa sería un dominio de ensayo distinto).

## R8 — Inicio de sesión: solo hay que autorizar el dominio

**Hallazgo**: el frontend inicia sesión con `signInWithPopup` y el `authDomain` seguirá siendo
`pdlco-mytasks.firebaseapp.com`, que sirve `/__/auth/handler` por sí mismo (ya documentado en la 002).
Por tanto **no se cambia `FIREBASE_AUTH_DOMAIN`** ni el cliente OAuth de Google.

**Qué sí cambia** (todo ya gestionado por Terraform en `identity.tf`):
- añadir `inserttask.com` (en producción) y `staging.inserttask.com` (en staging) a
  `authorized_domains` de Identity Platform (FR-009; conservar los existentes);
- añadir `https://inserttask.com/*` (producción) y `https://staging.inserttask.com/*` (staging) a los
  *referrers* permitidos de la clave de API web (si no, la clave rechaza las llamadas desde el dominio
  nuevo aunque esté autorizado);
- `www` **no** hace falta en ninguno: nunca carga la aplicación, solo redirige.

**A verificar (staging, vía `web.app`)**: que el *popup* funciona desde un origen servido por Hosting
(es el mismo mecanismo que el dominio propio, por eso se prueba antes en staging).

## R9 — CORS de la API: lista de orígenes compuesta por el pipeline

**Hallazgo**: `CORS_ORIGINS` es hoy un único valor (la URL `run.app` de la web) y **Terraform ignora
las variables de entorno** de los servicios una vez creados; las impone el pipeline, y el paso «Check the
service variables» de `deploy.yml` falla si el valor no es exactamente `CORS_ORIGINS=$web_url`. El
backend ya acepta una lista separada por comas (`cors_origin_list`).

**Decisión**: el pipeline compone `CORS_ORIGINS` como lista:
1. `https://mytasks-web-<nº>.<región>.run.app` (siempre; lo usan las pruebas de humo),
2. `https://<proyecto>.web.app` (siempre; es el origen del sitio de Hosting, en ambos entornos para
   mantener la paridad de topología),
3. los orígenes de dominios propios que declare una variable **no secreta** del entorno de GitHub
   (`CUSTOM_WEB_ORIGINS`: `https://inserttask.com` en `production` y
   `https://staging.inserttask.com` en `staging`), igual que ya ocurre con `BOOTSTRAP_ADMIN_EMAIL`.

Se aplica con `--update-env-vars` en el despliegue (patrón existente). Detalles que el desarrollador debe
respetar:
- la lista lleva comas y `gcloud` divide `--update-env-vars` por comas: hay que usar el delimitador
  alternativo de `gcloud` (p. ej. `^@^`) para ese valor;
- el chequeo previo hoy compara por igualdad exacta y, en un servicio existente, fallaría **antes** de
  que el despliegue ponga el valor nuevo. Debe pasar a exigir «contiene la URL `run.app` de este
  entorno» antes y a verificar la lista exacta **después** de crear la revisión, conservando la
  protección contra una configuración de otro entorno (FR-014 de la 002).

**Alternativa descartada**: quitar `env` de `ignore_changes` en Terraform; se descartó en la 002 por una
razón que sigue vigente (cada despliegue reescribiría `APP_VERSION`).

## R10 — Paridad con staging (Principio IV)

**Decisión** (revisada por el propietario tras el análisis): el módulo `environment` crea el sitio, la
versión, el *release* **y los dominios personalizados** en **los dos** entornos con el mismo código. La
lista de dominios es una variable del módulo: `staging.inserttask.com` en staging; `inserttask.com` y
`www.inserttask.com` (redirige) en producción. Así el recurso beta de dominio, la propiedad DNS y la
emisión del certificado se ensayan en staging **antes** de producción, que era el hueco que dejaba la
primera versión del diseño (hallazgo C1 de `/speckit-analyze`). La prueba `test_env_roots_parity.py` se
amplía para que solo puedan diferir el dimensionado, los identificadores y los valores de esa lista.

**Orden**: el `apply` de staging ocurre al fusionar en `develop`, el propietario pone el DNS de
`staging.inserttask.com` y se valida; solo entonces se crea la release a producción (FR-020, SC-009).
Staging mantiene también `<proyecto>.web.app`, que sigue funcionando.

## R11 — Permisos de Terraform (los concede el propietario)

**Hallazgo**: `terraform-staging` y `terraform-production` no tienen permisos de Hosting (los roles de
proyecto están enumerados en `RUNBOOK.md`, T046). La API `firebasehosting.googleapis.com` tampoco está
en la lista `apis` del módulo.

**Decisión**: tres cambios, los dos primeros del propietario (el agente no concede permisos):
1. Conceder `roles/firebasehosting.admin` a `terraform-<env>` en su proyecto. Es un rol predefinido,
   acotado al producto Hosting, y se prefiere a uno personalizado: el catálogo de permisos del rol es
   `firebasehosting.*` y mantener a mano una lista de permisos de versión/*release*/dominio es frágil.
   Incluye `firebasehosting.sites.delete`; se mitiga con `deletion_protection`-equivalente en Terraform
   (`prevent_destroy` en el sitio y en los dominios) y con la aprobación humana del `apply`.
2. Para los `plan` de solo lectura (`terraform-plan-<env>`): añadir al rol personalizado
   `mytasksPlanReader` los permisos de lectura de Hosting que el primer `plan` real pida (mismo
   procedimiento que usó la Fase 4 de la 002 para los roles de Firestore e Identity Platform). No se
   usa `roles/firebasehosting.viewer` porque solo da `sites.get/list`.
3. Añadir `firebasehosting.googleapis.com` a `apis` (lo aplica Terraform, que ya tiene
   `serviceusage.serviceUsageAdmin`).

El cambio de permisos es un cambio de autorización: pasa por `mytasks-security-auditor` (Principio III).

## R12 — Diagnóstico y operación del certificado (FR-017, SC-003)

Terraform expone en el estado `host_state`, `ownership_state`, `cert.state` y `issues` de cada dominio.
El plan los publica como *outputs* (sin secretos) para que un `terraform plan` de solo lectura, o la
consola de Firebase, sirvan de panel. Estados relevantes y qué hacer, según la documentación:

| Síntoma | Causa típica | Acción |
|---|---|---|
| «Needs setup» | `A`/`AAAA` sin propagar o desafío SSL caducado | Esperar hasta 24 h; si persiste, repasar los registros |
| «Pending» | `CAA` demasiado restrictivo o demasiados subdominios | Permitir `pki.goog` y `letsencrypt.org` |
| `HOST_CONFLICT` / `HOST_MISMATCH` | Quedan `A`/`AAAA` de otro proveedor | Retirarlos |
| `OWNERSHIP_MISSING`/`MISMATCH` | Falta o sobra un `TXT` | Dejar solo el del proyecto |
| `cert.state` = `CERT_EXPIRING_SOON` durante días | Se retiró el `TXT` o cambió el DNS | Restituir los registros |

## R13 — Coste

- **Certificado SSL y dominios personalizados**: incluidos sin cargo (página de precios de Hosting).
- **Hosting**: 10 GB de almacenamiento y 10 GB/mes de transferencia sin coste; por encima, 0,026 USD/GB
  y 0,15 USD/GB. El sitio no almacena contenido propio (solo la configuración), y los activos con *hash*
  se sirven desde la CDN. Con un único propietario y acceso por invitación se espera estar por debajo de
  la cuota gratuita.
- **Cloud Run**: sin cambio de dimensionado. Los activos con `immutable` se cachean en la CDN, de modo que
  el tráfico hacia Madrid puede incluso bajar.
- **Sin coste fijo**: no hay IP reservada ni balanceador (R1).
- No se pudo comprobar en la documentación si los *rewrites* a Cloud Run tienen una tarifa propia en
  Hosting; la página de precios no la lista. **A verificar**: revisar la factura de staging tras la
  primera semana con el sitio activo.

## R14 — Retorno atrás

Eliminar los dominios personalizados (PR que vacía su lista en el entorno afectado) deja la aplicación en
`<proyecto>.web.app` y en su dirección `run.app`, que no se tocan en ningún momento (FR-011). El sitio de
Hosting y el *rewrite* se pueden retirar sin afectar a Cloud Run. Los registros DNS del proveedor los
retira el propietario.

## R15 — Efectos en el navegador que no requieren código

- Las sesiones y las preferencias locales son **por origen**: la primera vez que alguien entra por
  `inserttask.com` inicia sesión de nuevo y la apariencia se reconstruye desde su perfil guardado en
  Firestore (feature 004). Sin pérdida de datos. Se avisa en la guía.
- La política de contenidos (CSP) del contenedor ya usa `'self'` para la web y fija `connect-src` a
  `API_BASE_URL` y `frame-src` al dominio de autenticación; ninguno cambia, así que **no hay cambios en
  nginx ni en el frontend**.

## Resumen de decisiones

| # | Decisión |
|---|---|
| R1 | Hosting → Cloud Run en `europe-southwest1`: admitido; sin cambio de región |
| R2 | Un único *rewrite* `**` → `mytasks-web`, sin `pinTag` |
| R3 | La API no pasa por Hosting |
| R4 | Recursos de Hosting en `google-beta` fijado (el GA no los tiene) |
| R5 | Sitio por defecto de cada proyecto |
| R6 | `inserttask.com` canónico; `www` redirige con 301; `staging.inserttask.com` de ensayo; certificado gratuito gestionado |
| R7 | El propietario pone `TXT` + `A`/`AAAA` (+`CAA` si procede) en su DNS |
| R8 | Solo se autoriza el dominio (Identity Platform + clave de API); el `authDomain` no cambia |
| R9 | CORS como lista compuesta por el pipeline; variable `CUSTOM_WEB_ORIGINS` en ambos entornos |
| R10 | Hosting y dominios personalizados en ambos entornos; staging ensaya `staging.inserttask.com` antes de producción |
| R11 | `roles/firebasehosting.admin` al `terraform-<env>` (lo concede el propietario) + API + lectura en el plan |
| R12 | Estado del certificado visible en las salidas de Terraform y en la consola |
| R13 | Coste esperado 0 €; a revisar en factura |
| R14 | Reversible sin tocar la dirección `run.app` |
| R15 | Sin cambios de nginx ni de frontend |
