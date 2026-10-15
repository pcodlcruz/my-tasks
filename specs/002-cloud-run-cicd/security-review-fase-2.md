# Informe de Auditoría de Seguridad — Aplicación desplegable y CI (feature 002, Fase 2)

**Fecha**: 2026-10-06 | **Rama auditada**: `feature/002-cloud-run-cicd-fase-2` (commit `c32fb88`, PR #24) | **Solicitada por**: el propietario (no obligatoria por el Principio III: la fase no toca autenticación, autorización ni el modelo de datos)

**Alcance**: `backend/src/mytasks_api/` (`config.py`, `factory.py`: `/healthz` y `/readyz`), `backend/scripts/export_openapi.py`, `backend/project.toml` y `.python-version`, `frontend/src/lib/runtimeConfig.ts` y `firebase.ts`, `frontend/Dockerfile`, `frontend/nginx/` (configuración, script de arranque y sus tests), `.github/workflows/ci.yml` y las dependencias de ambos componentes. Lectura del código y comprobaciones sobre las imágenes construidas en local (`mytasks-api:local`, `mytasks-web:local`); `npm audit` y `uv audit` sobre los ficheros de bloqueo. No se ha ejecutado nada sobre Google Cloud: esta fase no lo toca.

**Tipología detectada**: aplicación web (SPA en Nginx), API REST (FastAPI), cadena de suministro y CI (GitHub Actions) y, de forma preparatoria, cloud-native/GCP (las imágenes que se desplegarán en Cloud Run en la Fase 4).

**Marcos aplicados**: OWASP Top 10 (A05 Security Misconfiguration, A06 Vulnerable and Outdated Components, A08 Software and Data Integrity Failures), OWASP API Security Top 10 (API4 Unrestricted Resource Consumption, API8 Security Misconfiguration) y CIS Google Cloud Foundation Benchmark en lo que afecta a la imagen y su ejecución.

**Nivel de riesgo global**: **Medio**. **No hay hallazgos críticos ni altos: ninguno bloquea la fusión de la Fase 2.** Hay un hallazgo medio, que conviene resolver antes de exponer la API en Cloud Run (Fase 4), y tres bajos.

---

## Resumen ejecutivo

La fase cumple su objetivo sin debilitar la seguridad existente: los endpoints de datos siguen exigiendo token (comprobado en la imagen: `401` sin él), la API se niega a arrancar con emuladores fuera de local, y las dos imágenes corren sin privilegios, sin `.env` y con las bases fijadas. El CI no tiene acceso a ninguna credencial de Google Cloud.

Los riesgos que quedan son de diseño del nuevo endpoint anónimo y de higiene de la cadena de suministro: `/readyz` hace trabajo real por cada petición anónima sin ningún límite, el login de pruebas ha pasado de eliminarse en la compilación a viajar en el bundle de producción protegido solo en ejecución, y las dependencias y las imágenes base no se vigilan de forma continua.

**Lo que está bien (verificado, sin hallazgo)**

- **Autenticación intacta.** `GET /api/v1/tasks` sin token devuelve `401` en la imagen de la API. `/healthz` y `/readyz` son anónimos por diseño y no devuelven datos: `/readyz` responde solo `{"status": "ready" | "unavailable"}` y la causa va al log, nunca a la respuesta (test: ni `unreachable` ni `credentials` aparecen en el cuerpo).
- **`/readyz` falla cerrado y acotado.** Con la identidad rota responde `503` en 3,0 s (antes `500` en 9,7 s). El cliente se crea dentro del bloque protegido y fuera del bucle de eventos.
- **Sin cambio del modelo de datos.** `/readyz` solo **lee** `_readyz/probe` y nunca lo crea. `firestore.rules` deniega todo acceso de cliente (`allow read, write: if false`), así que esa colección no es alcanzable desde el navegador. No se incorpora ningún campo ni colección persistente.
- **Imágenes sin privilegios y sin secretos.** API: `uid 33`, sin `.env`, `tests/`, `scripts/` ni `.venv` (lista `exclude` de `project.toml`), 52 paquetes de producción (el grupo `dev` ya no entra). Web: `uid 101`, sin `.env` ni valores locales incrustados (se buscó `demo-mytasks`, `localhost:8000` y `fake-api-key` en el bundle: ninguno).
- **Base de la web y builder fijados por digest** (`node`, `nginx-unprivileged`, builder de Google) y `uv.lock` versionado; las acciones de terceros del CI están fijadas por SHA completo.
- **El script de arranque de la web es una barrera real contra la inyección.** Cada variable se valida con lista blanca antes de entrar en JavaScript y en la directiva CSP; se rechaza cualquier comilla, `;`, espacio, ruta o barra final, y también un salto de línea (el hueco que `grep` dejaba abierto se cerró con test). `USE_EMULATORS` distinto de `false` aborta el arranque.
- **Las dos puertas contra el login de pruebas** funcionan: el script fuerza `USE_EMULATORS: 'false'` y `runtimeConfig` solo lo activa si el *host* es `localhost`, `127.0.0.1` o `[::1]` (probado también con `localhost.evil.com`).
- **El workflow de CI es seguro por construcción.** Permisos de solo lectura a nivel de workflow, `persist-credentials: false`, sin `paths`, sin secretos de Google Cloud. Las 15 expresiones `${{ }}` son constantes del propio fichero o `github.base_ref` usado en un `with:`, nunca dentro de un `run:`: no hay inyección por nombre de rama. `secrets-scan` en verde.
- **Cabeceras de seguridad y CSP estrictos**: `style-src 'self'` sin `unsafe-inline`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS. `index.html` y `config.js` con `no-store`.
- **Dependencias de Python**: `uv audit` sin vulnerabilidades conocidas en los 64 paquetes.

**Categorías no evaluables en esta fase**: segmentación de red, WAF y alertas (no existe aún ningún servicio desplegado; llegan en las Fases 3 y 4) y gestión de incidentes y recuperación (se cubre en la revisión final, T092).

---

## Hallazgos

### [MED-001] `/readyz` es anónimo y hace trabajo real por cada petición, sin límite ni caché

| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `backend/src/mytasks_api/factory.py` (`readyz`) |

**Descripción**
Cualquiera puede llamar a `/readyz` sin credenciales y cada llamada hace una lectura de Firestore (facturable) o, si la identidad está rota, lanza un hilo del *executor* por defecto que puede quedarse hasta el tiempo límite buscando credenciales y escribe una línea de log de nivel `ERROR`. No hay límite de frecuencia, ni caché del resultado, ni nada en la plataforma que lo acote (el diseño descarta a propósito Cloud Armor y balanceador). Un volumen alto de peticiones anónimas amplifica el coste de Firestore y de Cloud Logging, y en el estado degradado agota los hilos del *executor* y llena el registro de errores falsos.

**Evidencia**
`factory.py`: el manejador `readyz` llama a `asyncio.to_thread(client_factory)` y a `.get()` en cada petición, sin memorización; en el `except` emite `log_event(..., logging.ERROR, "readiness_failed", ...)` por petición. `contracts/pipeline.md` e `infra` no definen todavía límites de instancias (T065, Fase 4), así que hoy no hay otra defensa. El tiempo límite de 3 s acota cada petición, pero no su número.

**Remediación requerida**
Memorizar en el proceso el último resultado de `/readyz` durante unos segundos (el valor concreto lo decide quien implemente, del orden de 5 a 10 s), de modo que el trabajo real tenga una cota por instancia independiente del tráfico; que el log de fallo no se emita más de una vez por ventana; y, en la Fase 4, fijar el máximo de instancias de `mytasks-api` (ya previsto en T065/T067) como segunda cota de coste. El sondeo de Cloud Run y el humo del pipeline siguen funcionando igual con la caché.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (caché y log); `mytasks-iac-developer` (límite de instancias, ya en el plan)
- Tipo de cambio: De implementación + De configuración

---

### [LOW-001] El login de pruebas ya no se elimina del bundle de producción

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: Security Misconfiguration (defensa en profundidad) |
| **Componente afectado** | `frontend/src/lib/firebase.ts`, `frontend/src/lib/runtimeConfig.ts` |

**Descripción**
Antes, la condición `import.meta.env.VITE_USE_EMULATORS === 'true'` se resolvía al compilar y, sin esa variable en una compilación de producción, el código de `connectAuthEmulator` y de `window.__mytasksTestLogin` desaparecía del bundle. Con la configuración en ejecución (necesaria para que la imagen sea idéntica en los dos entornos), la decisión se toma en el navegador y ese código viaja en producción, protegido solo por dos comprobaciones: el script de arranque que fuerza `false` y la comprobación del *host*. Ambas son sólidas y están probadas, pero se ha pasado de «el código no existe» a «el código existe y está desactivado».

**Evidencia**
`grep` sobre `/usr/share/nginx/html/assets/index-BiN6xbUJ.js` de `mytasks-web:local`: contiene `__mytasksTestLogin`. El riesgo residual es bajo: la función solo firma con una credencial falsa y contra el emulador de Auth, y un Firebase real la rechazaría; para activarla haría falta servir la SPA desde `localhost` con `USE_EMULATORS=true`.

**Remediación requerida**
Recuperar la eliminación en compilación sin perder la imagen única: proteger ese bloque con una constante de compilación (distinta del entorno de ejecución) que sea falsa en la compilación de producción de la imagen y verdadera en el servidor de desarrollo y en el e2e, de forma que el bundle de la imagen no contenga el login de pruebas. Añadir una comprobación en CI de que el bundle de la imagen no incluye `__mytasksTestLogin`.

**Destinatario**
- Skill/agente: `mytasks-frontend-developer`
- Tipo de cambio: De implementación

---

### [LOW-002] El CSP permite `apis.google.com` como origen de scripts

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: Security Misconfiguration |
| **Componente afectado** | `frontend/nginx/docker-entrypoint.d/40-runtime-config.sh` (directiva `script-src`) |

**Descripción**
`script-src 'self' https://apis.google.com` es necesario para el inicio de sesión con ventana emergente de Firebase (carga el cargador de la API de Google). Ese origen aloja *endpoints* con parámetros de devolución de llamada que son un vector conocido para eludir un CSP basado en listas de orígenes si existiera una inyección de HTML. Hoy no hay ninguna inyección conocida (React escapa por defecto y no se usa `dangerouslySetInnerHTML`), así que es una debilidad de la capa de defensa, no una vulnerabilidad explotable.

**Evidencia**
Cabecera `Content-Security-Policy` observada en `mytasks-web:local`: `script-src 'self' https://apis.google.com`. `grep` de `dangerouslySetInnerHTML` en `frontend/src`: sin coincidencias.

**Remediación requerida**
Documentar el riesgo como aceptado en `research.md`/RUNBOOK, con su motivo (el flujo de ventana emergente de Firebase lo exige), y reevaluarlo si se cambia el método de acceso (p. ej. a redirección). Mantener la prohibición de `dangerouslySetInnerHTML` en el *lint*.

**Destinatario**
- Skill/agente: `mytasks-frontend-developer` (documentación y regla de *lint*); la aceptación del riesgo es decisión del propietario
- Tipo de cambio: De configuración

---

### [LOW-003] Las dependencias y las imágenes base no se vigilan en CI ni todas están fijadas

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A06: Vulnerable and Outdated Components · A08: Software and Data Integrity Failures |
| **Componente afectado** | `.github/workflows/ci.yml`, `backend/project.toml`, `frontend/Dockerfile` |

**Descripción**
Tres puntos de la misma familia:

1. **Sin control de vulnerabilidades en CI.** Ningún job ejecuta `npm audit` ni `uv audit`. Hoy `npm audit --omit=dev` da 4 altas, todas por `@grpc/grpc-js` (< 1.13.6) dentro de `firebase`; **no son alcanzables**: la SPA no importa el cliente de Firestore y `grpc-js` es una librería de Node. Pero nada avisaría si apareciera una alcanzable. La compilación de la imagen web además ejecuta los *scripts* de instalación de `npm ci`.
2. **La imagen de ejecución de la API no está fijada.** El builder está por digest, pero su imagen de ejecución (`gcr.io/buildpacks/google-24/run`) se descarga con la etiqueta `latest`, y el runtime de Python y `uv` los descarga el buildpack en cada construcción (3.13.14 hoy). Lo documenta R13 para Python; la imagen de ejecución no.
3. **Las acciones y herramientas del CI** quedan fijadas por SHA o versión, pero no hay un mecanismo planificado de actualización (el contrato lo menciona como «actualización planificada»).

**Evidencia**
`ci.yml`: ningún paso de auditoría. Salida de `pack build`: `latest: Pulling from buildpacks/google-24/run … Digest: sha256:8134dea3…`. `npm audit --omit=dev --json`: 4 vulnerabilidades altas, `fixAvailable: false` para `firebase`. `uv audit`: sin hallazgos.

**Remediación requerida**
(a) Añadir al CI un paso de auditoría de dependencias de producción (`npm audit --omit=dev` y `uv audit`) con umbral *alto* y una lista de excepciones triadas y fechadas para las no alcanzables (hoy, las de `grpc-js`); (b) usar `npm ci --ignore-scripts` en la imagen web; (c) anotar en R13 que la imagen de ejecución se actualiza con cada construcción y decidir si se acepta o se fija; (d) definir quién y cuándo actualiza acciones y builder (p. ej. Dependabot para `github-actions`, `npm` y `uv`).

**Destinatario**
- Skill/agente: los puntos (b) y (c) → `mytasks-frontend-developer` y `mytasks-backend-developer`. Los puntos (a) y (d) son cambios de **workflow/configuración de GitHub** y ninguna fila de la tabla de `CLAUDE.md` los cubre: **a decidir por el propietario** (hasta ahora se han hecho a mano, con la excepción justificada en la PR).
- Tipo de cambio: De configuración

---

### [INFO-001] `/healthz` expone la versión desplegada de forma anónima

Se acepta como decisión de diseño (US4: la versión de cada entorno debe poder consultarse sin acceder a la infraestructura). El valor es el *hash* de árbol de `backend/`, que no revela dependencias ni rutas. Sin acción. Si algún día se considera sensible, bastaría con servir `version` solo en el humo del pipeline.

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| MED-001 | Media | Desarrollador backend e IaC | `mytasks-backend-developer`, `mytasks-iac-developer` (Fase 4) |
| LOW-001 | Baja | Desarrollador frontend | `mytasks-frontend-developer` |
| LOW-002 | Baja | Desarrollador frontend; aceptación del propietario | `mytasks-frontend-developer` |
| LOW-003 | Baja | Desarrolladores frontend y backend; **workflow: a decidir por el propietario** | `mytasks-frontend-developer`, `mytasks-backend-developer` |
| INFO-001 | Informativa | — (aceptado) | — |

**Recomendación**: la Fase 2 puede fusionarse. MED-001 debe estar resuelto antes de la Fase 4 (primer servicio expuesto); los bajos pueden ir al backlog técnico.
