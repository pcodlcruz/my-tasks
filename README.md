# MyTasks · Gestor personal de tareas

Aplicación web para gestionar tareas personales y laborales con la **matriz de Eisenhower**.
Cada persona inicia sesión con su cuenta de Google, crea tareas (título, descripción, urgente,
importante y ámbito) y las ve clasificadas automáticamente en uno de los cuatro cuadrantes:

| | Urgente | No urgente |
|---|---|---|
| **Importante** | Hacer ahora | Planificar |
| **No importante** | Delegar | Eliminar |

Además permite filtrar el tablero por ámbito (Laboral / Personal), fijar tareas, editarlas,
completarlas y reabrirlas, consultar el historial y mover tareas a una papelera que se vacía
sola a los 30 días. Cada cuenta solo ve y modifica sus propias tareas.

Se desarrolla con [Spec Kit](https://github.com/github/spec-kit) y agentes de IA. La fuente de
verdad de las reglas del proyecto es la constitución
([`.specify/memory/constitution.md`](.specify/memory/constitution.md)); la primera feature está
especificada en [`specs/001-eisenhower-task-manager/`](specs/001-eisenhower-task-manager/).

## Arquitectura

- **Frontend** (`frontend/`): React 18 + TypeScript estricto, Vite, TanStack Query, Zustand y
  Tailwind CSS. Solo usa Firebase Auth (proveedor Google); nunca accede a Firestore.
- **Backend** (`backend/`): FastAPI (Python 3.12+) con capas router → servicio → repositorio.
  Verifica el ID token de Firebase en cada petición y guarda las tareas en Firestore, en
  `users/{uid}/tasks`.
- **Diseño** (`docs/design/`): design system y pantallas aprobadas en Stitch.

Esta feature se ejecuta y se valida **solo en local**, contra los emuladores de Firebase con el
project id ficticio `demo-mytasks`: no hace falta ninguna credencial ni se toca Google Cloud.

## Requisitos

- Python 3.12+ y [`uv`](https://docs.astral.sh/uv/)
- Node.js 20 LTS+ y npm
- Java 11+ (lo necesitan los emuladores de Firebase)
- Navegadores de Playwright: `npx playwright install` (una vez, desde `frontend/`)

## Arranque en local

Tres terminales desde la raíz del repositorio: emuladores, backend y frontend. Los comandos
exactos están en [`quickstart.md`](specs/001-eisenhower-task-manager/quickstart.md#arranque).

Con todo en marcha, `http://localhost:5173` muestra la pantalla de inicio de sesión y
`http://localhost:8000/healthz` responde `{"status":"ok"}`.

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
