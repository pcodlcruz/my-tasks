# Implementation Plan: Gestión de tareas con matriz de Eisenhower

**Branch**: `feature/001-eisenhower-task-manager` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-eisenhower-task-manager/spec.md`

## Summary

Primera feature del proyecto: una aplicación web multiusuario para gestionar tareas personales
y laborales con la matriz de Eisenhower. Cada usuario inicia sesión con su cuenta de Google, crea tareas (título,
descripción, urgente, importante, ámbito) que se clasifican automáticamente en uno de los cuatro
cuadrantes, las ve en un tablero 2×2 filtrable por ámbito, puede fijarlas, completarlas,
reabrirlas y moverlas a una papelera que se vacía a los 30 días.

Enfoque técnico: SPA React + TypeScript que consume una API REST FastAPI; autenticación con
"Iniciar sesión con Google" vía Firebase Auth (ID token verificado en el backend; el sistema no
almacena contraseñas); persistencia en Firestore con una
subcolección por usuario (`users/{uid}/tasks`) que aísla los datos por construcción; papelera
con política TTL de Firestore y filtro en lectura. **Los diseños de interfaz se hacen en Stitch**
y el propietario los aprueba antes de implementar el frontend, que usa Tailwind CSS para
trasladarlos con fidelidad. La feature se entrega funcionando y testeada en local con los
emuladores de Firebase; la infraestructura en la nube y el CI/CD son una feature aparte.

## Technical Context

**Language/Version**: Python 3.12+ (backend); TypeScript 5.x en modo estricto (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, `google-cloud-firestore`, `firebase-admin` (solo
para verificar tokens); React 18+, Vite, React Router, TanStack Query, Zustand, Firebase JS SDK
(solo Auth, proveedor Google), Tailwind CSS

**Storage**: Firestore en modo nativo (emulador en local); ver [data-model.md](./data-model.md)

**Testing**: pytest + pytest-asyncio + httpx (unitarios e integración contra los emuladores);
Vitest + Testing Library; Playwright (e2e)

**Target Platform**: navegadores de escritorio y móvil actuales (Chrome, Firefox, Safari, Edge);
backend en contenedor Linux (el servicio de ejecución en GCP lo decide
`mytasks-google-cloud-architect` en una feature de infraestructura)

**Project Type**: aplicación web (frontend SPA + backend API)

**Performance Goals**: p95 < 300 ms por endpoint de la API en local; tablero interactivo en
< 2 s tras el login. Da margen a SC-003 (crear y ver la tarea en < 15 s) y a SC-004
(< 5 s para localizar "Hacer ahora").

**Constraints**: todo endpoint de datos autenticado; nunca se accede a Firestore desde el
cliente; interfaz en español y WCAG 2.1 AA; sin operaciones reales en Google Cloud en esta
feature

**Scale/Scope**: uso personal, decenas de usuarios; ≤ ~500 tareas activas por usuario
(el tablero no se pagina); historial y papelera sin límite (paginados por cursor);
5 pantallas ([ui-screens.md](./contracts/ui-screens.md)) y 9 endpoints de datos más `/healthz`
([openapi.yaml](./contracts/openapi.yaml))

No quedan puntos marcados como NEEDS CLARIFICATION: todos se resolvieron en
[research.md](./research.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple este plan | Estado |
|---|---|---|
| **I. Simplicidad** | Dos piezas (SPA + API), impuestas por el stack de la constitución. Sin job de purgado (TTL + filtro en lectura), sin documento de usuario, cuadrante derivado en vez de guardado, tablero sin paginar. Las dependencias que no fija la constitución (`firebase-admin`, Firebase Auth, Tailwind) se justifican en *Complexity Tracking*. | ✅ |
| **II. Tests por niveles** | Unitarios: dominio (cálculo del cuadrante, transiciones, validaciones) y componentes. Integración: un test por endpoint de [openapi.yaml](./contracts/openapi.yaml) contra los emuladores de Firestore y Auth. e2e con Playwright: un flujo por historia de usuario (US1–US5). | ✅ |
| **III. Seguridad** | Todos los endpoints `/api/v1/*` exigen un ID token; solo `/healthz` es anónimo y no expone datos. Validación con Pydantic (`extra="forbid"`, longitudes, recorte de espacios) y con esquemas en el frontend. Aislamiento por ruta `users/{uid}`; las tareas ajenas dan `404`. Reglas de Firestore que deniegan todo acceso desde el cliente. Sin secretos en el repo (la config web de Firebase es pública; `.env` en `.gitignore`). Lockfiles `uv.lock` y `package-lock.json`. **Revisión con `mytasks-security-auditor` obligatoria** (toca autenticación, autorización y modelo de datos): será una tarea explícita antes de abrir la PR. | ✅ (revisión pendiente, prevista como tarea) |
| **IV. Paridad de entornos** | Esta feature solo toca local: emuladores y project id `demo-mytasks`. Staging y producción llegan con la feature de infraestructura y CI/CD. La configuración va por variables de entorno, así que el mismo código funciona en los tres entornos. | ✅ |
| **V. Identidad de agente / MCP** | Ninguna operación en Google Cloud. Habilitar Identity Platform, crear la política TTL y los índices en proyectos reales queda para la feature de infraestructura, vía `mytasks-google-cloud-operator` y MCP. Stitch no es Google Cloud: se usa su propio MCP. | ✅ |
| **VI. Despliegue por pipeline** | Esta feature no despliega nada. | ✅ (N/A) |
| **VII. Revisión humana** | Rama de diseño `feature/001-eisenhower-task-manager` → PR de diseño a `develop`. Cada fase de [tasks.md](./tasks.md#convenciones) (ver "Entrega por fases") se implementa en su propia rama (`feature/001-eisenhower-task-manager-fase-N`) y PR a `develop`, abiertas por el hook `speckit.git.pr`; el propietario fusiona cada una antes de la siguiente. | ✅ |
| **VIII. Agentes y skills** | Backend con `mytasks-backend-developer`; frontend con `mytasks-frontend-developer`; revisión con `mytasks-security-auditor`. **Diseño en Stitch: ningún skill lo cubre** → se hace manualmente y se justifica en la PR. La elección de Firebase Auth como servicio de GCP la valida `mytasks-google-cloud-architect` al diseñar la feature de infraestructura. | ✅ (excepción justificada) |
| **IX. Idioma** | Código y commits en inglés con Conventional Commits; interfaz, documentación y PR en español. | ✅ |

**Resultado (antes de la Fase 0)**: PASS. **Revisión tras la Fase 1**: PASS. El diseño
(contratos, modelo de datos) no añade servicios ni dependencias fuera de las justificadas
abajo, y todos los endpoints de datos del contrato declaran `firebaseIdToken`.

## Project Structure

### Documentation (this feature)

```text
specs/001-eisenhower-task-manager/
├── plan.md              # Este fichero
├── research.md          # Fase 0: decisiones técnicas
├── data-model.md        # Fase 1: entidades, estados, consultas
├── quickstart.md        # Fase 1: guía de validación local
├── contracts/
│   ├── openapi.yaml     # Fase 1: contrato de la API REST
│   └── ui-screens.md    # Fase 1: pantallas a diseñar en Stitch
├── checklists/
│   └── requirements.md
├── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
└── security-review.md   # Fase de Polish: informe de mytasks-security-auditor (T108)
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml            # uv; ruff, mypy, pytest
├── uv.lock
├── .env.example
├── src/mytasks_api/
│   ├── main.py               # App FastAPI, CORS, manejadores de error, /healthz
│   ├── config.py             # Settings (pydantic-settings) por variables de entorno
│   ├── auth.py               # Dependencia: verifica el ID token → CurrentUser(uid)
│   ├── domain/
│   │   └── task.py           # Enums, cálculo del cuadrante, reglas de transición (puro, sin I/O)
│   ├── schemas/
│   │   └── task.py           # Pydantic de request/response (TaskCreate, TaskUpdate, Task, TaskPage)
│   ├── repositories/
│   │   └── task_repository.py  # Firestore: users/{uid}/tasks, consultas, transacciones
│   ├── services/
│   │   └── task_service.py   # Casos de uso: crear, editar, listar vistas, transiciones
│   └── routers/
│       └── tasks.py          # Endpoints /api/v1/tasks...
└── tests/
    ├── conftest.py           # Clientes contra los emuladores, usuarios de prueba, limpieza
    ├── unit/                 # domain/ y services/ (repositorio simulado)
    └── integration/          # Un test por endpoint contra los emuladores

frontend/
├── package.json
├── package-lock.json
├── .env.example
├── vite.config.ts
├── tailwind.config.ts        # Tokens del design system de Stitch
├── playwright.config.ts
├── src/
│   ├── main.tsx
│   ├── app/                  # Router, providers (QueryClient), rutas protegidas
│   ├── lib/                  # firebase.ts (Auth), apiClient.ts (fetch + token)
│   ├── features/
│   │   ├── auth/             # S1 Login con Google, hook useSession
│   │   ├── board/            # S3 Tablero, Quadrant, TaskCard
│   │   ├── task-form/        # S4 Formulario de crear/editar
│   │   ├── history/          # S5 Historial
│   │   └── trash/            # S6 Papelera
│   ├── api/                  # Tipos del contrato + hooks de TanStack Query por endpoint
│   └── stores/
│       └── uiStore.ts        # Zustand: filtro de ámbito
└── tests/
    ├── unit/                 # Vitest + Testing Library
    └── e2e/                  # Playwright, un spec por historia de usuario

docs/design/
├── DESIGN.md                 # Design system (fuente del de Stitch)
└── screens/                  # Exportes aprobados de Stitch (HTML + PNG) por pantalla

firebase.json                 # Emuladores de Auth y Firestore
firestore.rules               # Denegar todo acceso directo desde el cliente
firestore.indexes.json        # Índices compuestos (data-model.md)
```

**Structure Decision**: aplicación web con `backend/` y `frontend/` como proyectos
independientes (cada uno con su gestor de dependencias y su lockfile), configuración de Firebase
en la raíz y diseños en `docs/design/`. El backend sigue la separación router → service →
repository del skill `mytasks-backend-developer`, más una capa `domain/` pura para que las reglas
del cuadrante y de las transiciones se prueben sin I/O. El frontend se organiza por *feature*,
una carpeta por pantalla del contrato de UI.

## Orden de trabajo previsto (orientativo para `/speckit-tasks`)

1. **Diseño (Stitch)**: `docs/design/DESIGN.md`, proyecto y design system en Stitch, las 5
   pantallas en escritorio y móvil → **aprobación del propietario** → exportes en
   `docs/design/screens/`.
2. **Base del proyecto**: `backend/`, `frontend/`, emuladores y reglas de Firestore.
3. **Backend por historia**: auth (US1) → crear y clasificar (US2) → tablero, edición y fijar
   (US3) → ámbito (US4) → completar, reabrir y papelera (US5), cada una con sus tests.
4. **Frontend por historia**, siguiendo las pantallas aprobadas y con sus tests e2e.
5. **Revisión con `mytasks-security-auditor`** y corrección de hallazgos antes de abrir la última PR.

El paso 1 puede avanzar en paralelo con los pasos 2 y 3; el paso 4 depende de la aprobación del
paso 1. Cada paso se entrega en su propia rama y PR a `develop` (una por fase de
[tasks.md](./tasks.md#convenciones)), no en una única PR para todo el plan.

## Complexity Tracking

> Justificaciones exigidas por el Principio I (dependencias y servicios no fijados por la constitución)

| Adición | Por qué se necesita | Alternativa más simple rechazada porque |
|---|---|---|
| Firebase Authentication (Identity Platform) con proveedor Google | La spec exige alta autoservicio y sesiones aisladas por usuario; el propietario no quiere almacenar contraseñas | Guardar contraseñas propias en Firestore exige hashing, protección frente a fuerza bruta y rotación: más código crítico de seguridad (Principio III); OAuth de Google sin Firebase exige sesiones propias y no tiene emulador local |
| `firebase-admin` (backend) | Verificar los ID tokens, también los del emulador de Auth | `google-auth` no acepta los tokens sin firmar del emulador, así que no habría tests de integración locales |
| Tailwind CSS | Trasladar con fidelidad las pantallas de Stitch, que genera HTML con clases de Tailwind (petición del usuario) | Con CSS Modules habría que reescribir a mano el estilo de cada pantalla, con riesgo de divergir del diseño aprobado |
| Política TTL de Firestore (en la feature de infraestructura) | Purgar la papelera a los 30 días (FR-014b) | Un job con Cloud Scheduler añade un servicio, permisos y un endpoint interno que proteger |
