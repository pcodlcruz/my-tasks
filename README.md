# MyTasks · Gestor personal de tareas

Aplicación web para gestionar tareas personales y laborales con la **matriz de Eisenhower**.
El acceso es **solo por invitación**: una persona inicia sesión con su cuenta de Google, pero solo
entra si el administrador ha invitado antes su correo. Una vez dentro, crea tareas (título,
descripción, urgente, importante y ámbito) y las ve clasificadas automáticamente en uno de los
cuatro cuadrantes:

| | Urgente | No urgente |
|---|---|---|
| **Importante** | Hacer ahora | Planificar |
| **No importante** | Delegar | Eliminar |

Además permite filtrar el tablero por ámbito (Laboral / Personal), fijar tareas, editarlas,
completarlas y reabrirlas, consultar el historial y mover tareas a una papelera que se vacía
sola a los 30 días. Cada cuenta solo ve y modifica sus propias tareas.

Hay dos roles: `user` y `admin`. El administrador gestiona los accesos desde la pantalla
**Accesos** (invitar a un correo, revocar una invitación y retirar el acceso a una persona, que
conserva sus tareas y las recupera si se la vuelve a invitar). Cómo se designa al administrador de
cada entorno, cómo invitar y cómo recuperar el acceso si se pierde la cuenta está en el
[runbook](infra/RUNBOOK.md#12-acceso-por-invitación-y-administración-feature-003-t053).

Cada persona tiene una pantalla **Perfil** (`/perfil`) con sus preferencias: tema (claro, oscuro
o el del sistema), densidad (cómoda o compacta), ámbito por defecto del tablero, orden de las
tareas dentro de cada cuadrante, periodo del historial (30 días, 90 días o todo), nombre para
mostrar y avatar (iniciales, uno de 12 predefinidos o una imagen propia que se encuadra al
subirla). Las preferencias son de cada cuenta y viajan con ella a cualquier dispositivo: viven en
Firestore, en `users/{uid}/settings/profile`, y las lee y escribe solo la API. El navegador guarda
además una copia del tema y la densidad en `localStorage` únicamente para pintar la pantalla sin
parpadeo antes de recibirlas. La imagen subida **no se guarda tal cual**: el servidor la
reprocesa (WebP cuadrado de 256×256, sin metadatos) y la guarda en `users/{uid}/settings/avatar`;
solo la ve su dueña. **No hay variables de entorno nuevas ni cambios de infraestructura**: la
feature añade la dependencia de backend `pillow` y amplía la CSP del contenedor web con `blob:`
solo en `img-src`.

**Progreso diario y tareas programadas** (feature 007). Cada persona fija en **Perfil** una meta de
tareas por día (de 1 a 20) y los días de la semana que cuentan. El marcador de la cabecera
muestra las completadas hoy frente a la meta, y la racha cuenta los días activos seguidos con la
meta cumplida; en un día no activo se puede avanzar, pero la racha no cambia. **El día empieza a
las 04:00** (no a medianoche) en la zona horaria de la persona, que el navegador comunica a la
API; las tareas completadas de madrugada cuentan para el día anterior. Al empezar la jornada
aparece, si se quiere, la pantalla **PULSA START** con el resultado del último día y la
**misión del día**: hasta cinco tareas elegidas que dan puntos extra y caducan sin penalización.
El **modo arcade** (opcional) añade puntos, niveles, logros y una sala de trofeos; la puntuación
es privada, sin tabla de récords. Con el modo desactivado el progreso se sigue calculando, pero
no se muestra. La pantalla **Progreso** (`/progreso`) enseña un calendario de 12 semanas, el
detalle de cada día y las estadísticas. Las **tareas programadas** (`/programadas`) crean una
tarea en el tablero de forma única, diaria, semanal o mensual; la API las genera al cargar la
aplicación, no hay ninguna tarea en segundo plano. Todo vive en Firestore bajo
`users/{uid}/` (`progress/state`, `progress_days/{día}` y `schedules/{id}`) y lo escribe solo la
API, que calcula puntos, rachas, niveles y logros: ningún endpoint los acepta del cliente.
**No hay variables de entorno nuevas ni cambios de infraestructura**: la feature añade la
dependencia de backend `tzdata` y la fuente Press Start 2P, autoalojada. Contrato en
[`specs/001-eisenhower-task-manager/contracts/openapi.yaml`](specs/001-eisenhower-task-manager/contracts/openapi.yaml)
(v1.4.0); operación en el
[runbook](infra/RUNBOOK.md#15-progreso-diario-tareas-programadas-y-modo-arcade-feature-007).

Se desarrolla con [Spec Kit](https://github.com/github/spec-kit) y agentes de IA. La fuente de
verdad de las reglas del proyecto es la constitución
([`.specify/memory/constitution.md`](.specify/memory/constitution.md)); la primera feature está
especificada en [`specs/001-eisenhower-task-manager/`](specs/001-eisenhower-task-manager/).

## Arquitectura

- **Frontend** (`frontend/`): React 18 + TypeScript estricto, Vite, TanStack Query, Zustand y
  Tailwind CSS. Solo usa Firebase Auth (proveedor Google); nunca accede a Firestore.
- **Backend** (`backend/`): FastAPI (Python 3.12+) con capas router → servicio → repositorio.
  Verifica el ID token de Firebase en cada petición, comprueba que exista una cuenta activa
  (`users/{uid}`, con rol y estado) y guarda las tareas en Firestore, en `users/{uid}/tasks`. Las
  invitaciones viven en `invitations/{correo}`; solo la API lee y escribe estas colecciones.
- **Diseño** (`docs/design/`): design system y pantallas aprobadas en Stitch.

Esta feature se ejecuta y se valida **solo en local**, contra los emuladores de Firebase con el
project id ficticio `demo-mytasks`: no hace falta ninguna credencial ni se toca Google Cloud.

## Entornos y direcciones

| | Staging | Producción |
|---|---|---|
| Dirección pública | `https://staging.inserttask.es` (ensayo) | `https://inserttask.es` (`www.inserttask.es` redirige a ella) |
| Firebase Hosting | `https://pdlco-mytasks-stg.web.app` | `https://pdlco-mytasks.web.app` |
| Cloud Run (web) | `https://mytasks-web-838389521553.europe-southwest1.run.app` | `https://mytasks-web-2195266360.europe-southwest1.run.app` |

El DNS vive en el registrador del dominio (no en Terraform): los registros de cada entorno los mantiene el
propietario a mano. Los dominios propios solo responden cuando esos registros resuelven y Hosting ha emitido el
certificado; hasta entonces la aplicación sigue en las direcciones de Hosting y de Cloud
Run, que no dejan de funcionar nunca. El procedimiento está en el
[runbook](infra/RUNBOOK.md#14-dominio-propio-con-firebase-hosting-feature-005).

## Requisitos

- Python 3.12+ y [`uv`](https://docs.astral.sh/uv/)
- Node.js 20 LTS+ y npm
- Java 11+ (lo necesitan los emuladores de Firebase)
- Navegadores de Playwright: `npx playwright install` (una vez, desde `frontend/`)

## Arranque en local

Tres terminales desde la raíz del repositorio: emuladores, backend y frontend. Los comandos
exactos están en [`quickstart.md`](specs/001-eisenhower-task-manager/quickstart.md#arranque).

Con todo en marcha, `http://localhost:5173` muestra la pantalla de inicio de sesión y
`http://localhost:8000/health` (o `/healthz`) responde `{"status":"ok"}`.

**Primer acceso en local**: como el acceso es por invitación, define en `backend/.env` el correo
del administrador inicial, por ejemplo `BOOTSTRAP_ADMIN_EMAIL=admin@example.com` (ver
`backend/.env.example`), y reinicia el backend. Esa dirección entra como `admin` en su primer
inicio de sesión (con el emulador de Auth, creando una cuenta de Google ficticia con ese correo);
desde **Accesos** puede invitar a otras. Los tests e2e ya se encargan de esto por su cuenta.

El backend solo admite los emuladores con `APP_ENV=local` (ya incluido en `backend/.env.example`).
Sin esa variable arranca como `production` y se niega a iniciar si ve variables de emulador o un
project id `demo-…`; es una salvaguarda para que nunca se acepten tokens sin firmar en un entorno
real ([informe de seguridad](specs/001-eisenhower-task-manager/security-review.md)). Con
`APP_ENV=local` también están disponibles `/docs` y `/openapi.json`.

## Tests

Los emuladores tienen que estar en marcha para los tests de integración.

| Nivel | Comando | Dónde |
|---|---|---|
| Backend (unitarios e integración por endpoint) | `uv run pytest` | `backend/` |
| Backend, calidad | `uv run ruff check`, `uv run ruff format --check` y `uv run mypy --strict src tests` | `backend/` |
| Frontend (unitarios) | `npm test` | `frontend/` |
| Frontend, calidad | `npm run lint`, `npm run format` y `npx tsc -b` | `frontend/` |
| e2e (Playwright; levanta lo que falte) | `npm run test:e2e` | `frontend/` |

El test de rendimiento (`perf`, p95 < 300 ms por endpoint con ~500 tareas) está excluido de la
ejecución por defecto: `uv run pytest -m perf`.

## Estructura

```text
backend/     API FastAPI (src/mytasks_api/) y sus tests
frontend/    SPA React (src/) y sus tests (Vitest y Playwright)
docs/design/ Design system y pantallas aprobadas de Stitch
specs/       Documentos de diseño de cada feature (spec, plan, tareas, contratos)
firebase.json, firestore.rules, firestore.indexes.json   Emuladores, reglas e índices
```

## Cómo se trabaja

El flujo (Spec Kit, GitFlow con una PR de diseño y una PR por fase, convenciones de idioma y
Definition of Done) está en [`CLAUDE.md`](CLAUDE.md) y en la constitución. En resumen: nunca se
hace commit directo a `develop` ni a `main`, la fusión de las PR la hace siempre el propietario y
los despliegues los hace solo el pipeline de CI/CD.
