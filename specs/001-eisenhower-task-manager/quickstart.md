# Quickstart: validar la feature 001 en local

**Feature**: `001-eisenhower-task-manager` | **Plan**: [plan.md](./plan.md)

Guía para levantar la aplicación en local y comprobar que cumple la spec. Toda la validación es
**local** con los emuladores de Firebase; esta feature no despliega nada en Google Cloud
([research.md § R11](./research.md#r11-fuera-de-alcance-de-esta-feature-explícito)).

## Requisitos previos

- Python 3.12+ y [`uv`](https://docs.astral.sh/uv/)
- Node.js 20 LTS+ y npm
- Java 11+ (lo necesitan los emuladores de Firebase)
- Navegadores de Playwright: `npx playwright install` (una sola vez, desde `frontend/`)

No hacen falta credenciales de Google Cloud: backend y frontend apuntan a los emuladores con
un project id ficticio (`demo-mytasks`; el prefijo `demo-` hace que los emuladores nunca
contacten con un proyecto real).

## Arranque

Tres terminales, desde la raíz del repo:

```bash
# 1. Emuladores de Auth (9099) y Firestore (8080), con la UI en :4000
npx firebase-tools emulators:start --project demo-mytasks

# 2. Backend en :8000
cd backend && cp .env.example .env && uv sync && uv run uvicorn mytasks_api.main:app --reload

# 3. Frontend en :5173
cd frontend && cp .env.example .env && npm ci && npm run dev
```

Resultado esperado: `GET http://localhost:8000/healthz` → `{"status":"ok"}`, y
`http://localhost:5173` muestra la pantalla de login.

> `backend/.env.example` incluye `APP_ENV=local`. Sin esa variable el backend arranca como
> `production` y se niega a iniciar con las variables de los emuladores (ver
> [security-review.md](./security-review.md), HIGH-001).

## Tests automáticos (Principio II)

```bash
# Backend: unitarios (dominio y servicio) + integración por endpoint contra los emuladores
cd backend && uv run pytest

# Frontend: unitarios con Vitest
cd frontend && npm test

# e2e con Playwright: levanta emuladores, backend y frontend, y recorre los flujos
cd frontend && npm run test:e2e
```

Resultado esperado: todo en verde. Los tests de integración y e2e fallan con un mensaje claro si
los emuladores no están en marcha, y nunca se conectan a un proyecto real.

## Validación manual por historia de usuario

Referencias: [contrato de la API](./contracts/openapi.yaml),
[pantallas](./contracts/ui-screens.md) y [modelo de datos](./data-model.md).

| # | Pasos | Resultado esperado | Spec |
|---|---|---|---|
| 1 | "Iniciar sesión con Google" con la cuenta ficticia `a@test.dev` (el emulador muestra un selector de cuentas simulado; "Add new account"); después, en otra ventana privada, con `b@test.dev` | Cada cuenta entra a un tablero vacío con los 4 cuadrantes y el mensaje de bienvenida | US1-1, FR-009 |
| 2 | Con B, pedir `GET /api/v1/tasks/{id}` usando el id de una tarea de A (se ve en la UI del emulador, :4000) | `404` | US1-2, SC-002 |
| 3 | `curl localhost:8000/api/v1/tasks?view=board` sin token | `401` | US1-3, FR-002 |
| 4 | Cerrar sesión y volver a entrar con `a@test.dev` | Entra a la misma cuenta, con sus tareas; no se crea una segunda cuenta | Caso límite |
| 5 | Crear una tarea con cada una de las 4 combinaciones de urgente/importante | Cada una aparece en Hacer ahora / Planificar / Delegar / Eliminar | US2-1..4 |
| 6 | Guardar con descripción "   ", o con un título de 201 caracteres | Se rechaza con un error en línea; no se crea nada | US2-5, FR-004 |
| 7 | Editar una tarea de "Planificar" y marcarla como urgente | Se mueve a "Hacer ahora" sin recargar | US3-3 |
| 8 | Crear 3 tareas en un cuadrante y fijar la más reciente | La fijada queda la primera; al desfijarla vuelve a su posición | US3-4/5 |
| 9 | Filtrar por "Laboral" y después por "Todas" | Solo tareas laborales; después todas, con un clic | US4-1, SC-006 |
| 10 | Crear una tarea sin elegir ámbito | No se puede guardar | US4-2 |
| 11 | Completar una tarea → abrir Historial | Aparece con cuadrante, ámbito y fecha; no tiene opción de editar | US5-1/2/4 |
| 12 | Reabrir una tarea desde el Historial | Vuelve al tablero, en su cuadrante | US5-3 |
| 13 | Mover a la papelera una tarea activa y otra completada → Restaurar las dos | Cada una vuelve a su vista original (tablero o historial) | US5-5/6 |
| 14 | En la papelera, "Eliminar definitivamente" | Pide confirmación; tras confirmar, desaparece de todas las vistas | US5-7 |
| 15 | Purga a los 30 días: lo cubre un test de integración que fija `purge_at` en el pasado | La tarea no se lista y cualquier operación sobre ella da `404` | FR-014b, SC-008 |
| 16 | Cerrar sesión y volver a entrar | El estado es exactamente el mismo que al salir | FR-015 |

## Diseño (Stitch)

Antes de la validación visual, comprobar que cada pantalla de
[ui-screens.md](./contracts/ui-screens.md) tiene su diseño aprobado en `docs/design/screens/` y
que la implementación coincide con él (cuadrantes, estados vacíos, formulario, versión móvil).

## Resultado de la validación (T110) — 2026-09-29

Validado por el agente sobre la rama de la Fase 9, con emuladores, backend y frontend arrancados
como indica este documento (backend con `cp .env.example .env`).

| Comprobación | Resultado |
|---|---|
| Arranque: `/healthz` → `{"status":"ok"}` y frontend en :5173 | ✅ |
| Pasos 1–16, por HTTP real contra el backend arrancado con `.env` | ✅ 31 de 31 comprobaciones (cuentas aisladas, `404` idéntico a una tarea inexistente, `401` sin token, mismo `uid` al volver a entrar, los 4 cuadrantes, validaciones `422`, editar, fijar y desfijar, filtro de ámbito, completar, reabrir, papelera, restaurar cada una a su vista, borrado con `409` previo y `204`, estado idéntico al reentrar) |
| Pasos 1–16 por la interfaz | ✅ Cubiertos por los 25 e2e de Playwright (US1–US5 y accesibilidad) |
| Paso 15 (purga a los 30 días) | ✅ Cubierto por los tests de integración (`test_tasks_list_trash.py`, `test_tasks_restore.py`, `test_tasks_delete.py`): con `purge_at` en el pasado no se lista y toda operación da `404` |
| Tests automáticos | ✅ Backend 190, frontend 50 unitarios, 25 e2e; `ruff`, `mypy --strict`, `eslint`, `tsc -b` y `prettier` limpios |
| Rendimiento (`pytest -m perf`) | ✅ p95 de todos los endpoints por debajo de 300 ms; el peor, el tablero con ~500 tareas, ≈ 190 ms |

**Un fallo real que salió de esta validación**: el arranque documentado no funcionaba con la
autenticación. `FIREBASE_AUTH_EMULATOR_HOST` definido solo en `.env` no llegaba a `firebase_admin`
(verificado: con el código anterior, un token válido del emulador daba `401`). Corregido en la
Fase 9 (ver [security-review.md](./security-review.md), HIGH-001).

### Comprobación visual frente a `docs/design/screens/`

Hecha por el agente comparando capturas de la aplicación en marcha (escritorio 1280 px y móvil
390 px) con los exportes aprobados de S1, S3, S4, S5 y S6:

- **Coinciden**: rejilla 2×2 con el orden canónico y un color por cuadrante con etiqueta de texto;
  estado vacío por cuadrante; insignias de ámbito; filtro Todas / Laboral / Personal; formulario
  modal con contadores, interruptores, ámbito sin preselección y vista previa «Irá a: …»; filas
  del historial con cuadrante, ámbito, fecha y las acciones «Reabrir» y «Mover a la papelera»;
  papelera con el aviso de 30 días, «se eliminará en N días», «Restaurar» y «Eliminar
  definitivamente»; inicio de sesión con el botón de Google.
- **Corregido a raíz de la comparación**: en móvil la página desbordaba en horizontal (cabecera y
  tarjetas). Ahora se ajusta, con un test de *reflow* (`a11y.spec.ts`) que lo impide.
- **Diferencias deliberadas** (elementos de los diseños de Stitch que la spec no pide, no
  implementados): avatar con iniciales, fechas límite y «delegado a» en las tarjetas, botón «+» por
  cuadrante, migas de pan, buscador, ordenación, «Exportar CSV», «Vaciar papelera», pie de página y,
  en móvil, la barra inferior «Matriz / Hoy / Historial / Ajustes».

**No comprobado**: el flujo real de la ventana emergente de Google (los tests y esta validación usan
el inicio de sesión simulado del emulador), y la validación visual **no es un visto bueno del
propietario**: queda pendiente que la revise en la PR.
