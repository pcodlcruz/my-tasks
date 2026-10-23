# Implementation Plan: Perfil de usuario y preferencias

**Branch**: `feature/004-user-profile-settings` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-user-profile-settings/spec.md`

## Summary

La aplicación no guarda hoy nada de la persona más allá de su cuenta (`users/{uid}`, feature 003).
Esta feature añade la sección **Perfil** (`/perfil`) con preferencias de visualización por cuenta:
tema claro/oscuro/sistema, densidad, tablero (ámbito) por defecto, orden de las tareas, periodo del
historial, nombre para mostrar y avatar (catálogo o imagen propia). Se apoya en un documento de
preferencias por persona en Firestore y en cuatro endpoints nuevos bajo `/api/v1/me/`.

Decisiones clave (detalle y alternativas en [research.md](research.md)):

- **Las preferencias viven en Firestore** (`users/{uid}/settings/profile`), accesibles solo desde
  el backend, sin tocar el documento de cuenta de la 003.
- **El avatar subido también vive en Firestore** (`users/{uid}/settings/avatar`), ya reprocesado
  por el servidor a un WebP de 256×256 sin metadatos. **No hay *bucket*, ni IAM, ni cambios en
  `infra/`**: la spec suponía almacenamiento nuevo, el diseño lo evita (R2).
- **El servidor no se fía del archivo**: lo decodifica con Pillow (única dependencia nueva), lo
  identifica por su contenido, limita tamaño y píxeles, y lo reescribe (R3). El avatar se sirve
  solo por una ruta autenticada que usa el `uid` del token (R5).
- **Modo oscuro por variables CSS**: los colores de Tailwind pasan a variables definidas para
  `:root` y `:root[data-theme='dark']`; no se reescribe ningún componente (R7). Un script externo
  mínimo aplica el tema **antes del primer fotograma** (R8).
- **Dos parámetros opcionales** en el listado de tareas: `order` (tablero) y `within_days`
  (historial). El filtro de ámbito del tablero se fija una vez por sesión desde el perfil y nunca
  se escribe de vuelta (R9).
- **Diseño primero en Stitch** (Fase 1): versiones nuevas de las pantallas afectadas, sin tocar las
  aprobadas, con punto de control humano antes de cualquier código de interfaz (R12).

**Glosario**: «tablero por defecto» (texto de la interfaz y de la spec) es el filtro de **ámbito**
del tablero (`default_scope` en la API y el modelo de datos); no se crean tableros distintos.

## Technical Context

**Language/Version**: Python 3.13 (backend, como en `pyproject.toml`), TypeScript estricto con
React 18+ (frontend).

**Primary Dependencies**: FastAPI, Pydantic y `google-cloud-firestore` (ya presentes); TanStack
Query, Zustand y el router existente en frontend. **Una dependencia nueva: `pillow`** (backend),
fijada por versión en el lockfile. Sin librerías de recorte de imagen: se usa `<canvas>`.

**Storage**: Firestore (modo nativo). Dos documentos nuevos por persona en la subcolección
`users/{uid}/settings/` (`profile` y `avatar`). Sin migración: sin documento, valores por defecto.
`localStorage` guarda solo una caché de `{theme, density}` para pintar sin destello.

**Testing**: pytest (unitarios de dominio e imagen, integración por endpoint contra los
emuladores), Vitest (hooks, tema, recortador, páginas), Playwright (flujos e2e y axe en ambos
temas con los emuladores).

**Target Platform**: Cloud Run (API y web) en staging y producción; emuladores en local. Sin
cambios de despliegue ni de variables.

**Project Type**: aplicación web (frontend + backend), como las features anteriores.

**Performance Goals**: el cambio de tema se ve en < 1 s sin recargar (SC-001); una lectura de
Firestore por carga de la aplicación para el perfil y una por versión de avatar (el navegador
conserva la imagen); los umbrales de `test_performance.py` de la 001 deben seguir cumpliéndose.

**Constraints**: aislamiento por `uid` del token (nunca del cliente); validación en servidor de
todo valor (FR-023); límite de 10 subidas/hora/persona; imagen de entrada ≤ 2 MB; imagen
guardada ≤ 200 KB; la CSP no se relaja salvo `img-src … blob:`; contraste AA en ambos temas.

**Scale/Scope**: una persona administradora y un puñado de invitadas; 2 documentos pequeños por
persona; 1 pantalla nueva (`/perfil`), 12 avatares, 5 preferencias de visualización y 4 endpoints
nuevos.

## Constitution Check

*GATE: debe pasar antes de la Fase 0. Reevaluado tras el diseño de la Fase 1: sigue cumpliéndose.*

| Principio | Evaluación |
|---|---|
| **I. Simplicidad** | ✅ con una dependencia nueva justificada (ver *Complexity Tracking*). Se evita el almacenamiento en la nube (R2), una librería de recorte, *multipart* (R4), URLs firmadas (R5) y un sistema genérico de *rate limit* (R6). Fuera de alcance: tamaño de texto, animaciones, idioma, notificaciones (spec). |
| **II. Tests por niveles** | ✅ Unitarios (validación de perfil, catálogo, ventana de límite, procesado de imagen, tema, recortador); integración por cada endpoint nuevo y por los dos parámetros nuevos de `/tasks`, incluidos 401/403/422 y aislamiento entre cuentas; e2e de los flujos principales y axe en claro y oscuro. Ver [quickstart.md](quickstart.md). |
| **III. Seguridad de aplicación** | ✅ Autenticación y cuenta activa (`get_active_user`) en todos los endpoints; `uid` solo del token; validación en el límite (Pydantic con listas cerradas, `extra = forbid`); sin secretos nuevos; `pillow` fijado en el lockfile. **Revisión `mytasks-security-auditor` obligatoria** (modelo de datos nuevo y entrada de archivos), por fase, en un informe final (R13). |
| **IV. Paridad de entornos** | ✅ Sin cambios de infraestructura ni de variables: los tres entornos son idénticos por construcción. Se valida en staging antes de producción. |
| **V. Identidad de agente / MCP** | ✅ Ninguna operación en Google Cloud. El MCP de Stitch no es Google Cloud. Si en el futuro se eligiera Cloud Storage, requeriría confirmación explícita (descartado en R2). |
| **VI. Despliegue por pipeline** | ✅ Solo el pipeline despliega; el cambio de `img-src` va en el script de la imagen web, que el pipeline ya construye. |
| **VII. Revisión humana** | ✅ Una PR de diseño y una por fase; las fusiona el propietario. |
| **VIII. Agentes y skills** | ✅ `mytasks-backend-developer`, `mytasks-frontend-developer` y `mytasks-security-auditor`. **Excepción justificada**: ningún skill cubre el diseño en Stitch; se hace manualmente con el MCP de Stitch, como en la 001 (R12). |
| **IX. Idioma** | ✅ Documentación e interfaz en español; código y commits en inglés (Conventional Commits). |

**Resultado**: sin violaciones. No hay `NEEDS CLARIFICATION` pendientes.

## Project Structure

### Documentation (this feature)

```text
specs/004-user-profile-settings/
├── plan.md              # Este fichero
├── research.md          # Decisiones R1–R13
├── data-model.md        # Documentos settings/profile y settings/avatar
├── quickstart.md        # Escenarios de validación
├── contracts/
│   ├── profile.yaml     # Endpoints /me/profile, /me/avatar y parámetros de /tasks
│   └── ui-screens.md    # Pantallas y versiones a diseñar en Stitch
├── checklists/requirements.md
└── tasks.md             # Lo genera /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml / uv.lock                  # + pillow (versión fijada)
├── src/mytasks_api/
│   ├── domain/profile.py                     # NUEVO: valores permitidos, catálogo de avatares, validación del nombre, ventana de límite
│   ├── domain/avatar_image.py                # NUEVO: procesado de imagen con Pillow (puro, sin I/O de red)
│   ├── domain/task.py                        # sort_board(order)
│   ├── repositories/profile_repository.py    # NUEVO: perfil y avatar en Firestore (transacción para el límite)
│   ├── repositories/task_repository.py       # list_history(within_days)
│   ├── services/profile_service.py           # NUEVO
│   ├── services/task_service.py              # propaga order / within_days
│   ├── schemas/profile.py                    # NUEVO: ProfileOut, ProfileUpdateIn, AvatarOut
│   ├── routers/profile.py                    # NUEVO: /me/profile y /me/avatar
│   ├── routers/tasks.py                      # + order y within_days
│   ├── factory.py                            # registra el router y los errores 413/415/429
│   └── logging_config.py                     # campos permitidos de los eventos de perfil
└── tests/
    ├── unit/domain/                          # test_profile.py, test_avatar_image.py, test_sort_board.py
    ├── unit/repositories/                    # límite de subidas con reintentos de transacción
    ├── unit/services/test_profile_service.py
    └── integration/                          # test_profile.py, test_avatar.py, test_profile_isolation.py, test_tasks_params.py

frontend/
├── public/theme-init.js                      # NUEVO: aplica data-theme/data-density antes de pintar
├── index.html                                # <script src="/theme-init.js"> en <head>
├── tailwind.config.ts                        # colores → variables CSS
├── nginx/docker-entrypoint.d/40-runtime-config.sh   # img-src con blob: (+ su test en nginx/tests)
├── src/
│   ├── index.css                             # variables claro/oscuro/densidad, color-scheme
│   ├── assets/avatars/avatar-01.svg … 12.svg # NUEVO: catálogo aprobado en Stitch
│   ├── api/profile.ts, types.ts              # NUEVO: cliente y hooks (useProfile, useUpdateProfile, useResetProfile, useUploadAvatar, useRemoveAvatar, useAvatarUrl)
│   ├── api/tasks.ts                          # order y within_days
│   ├── app/AppHeader.tsx                     # avatar + nombre → /perfil
│   ├── app/App.tsx                           # ruta /perfil; aplica tema/densidad
│   ├── features/profile/                     # NUEVO: ProfilePage, AppearanceSection, BoardPreferences, IdentitySection, AvatarPicker, AvatarCropper, Avatar, avatars.ts, useAppearance.ts
│   ├── features/board/BoardPage.tsx          # espera al perfil y fija el ámbito por defecto una vez
│   ├── features/history/HistoryPage.tsx      # franja «Mostrando solo los últimos N días · Ver todo»
│   └── stores/uiStore.ts                     # ámbito inicial desde el perfil; «Ver todo» solo por visita
└── tests/
    ├── unit/                                 # tema, apariencia, recortador, páginas, hooks
    └── e2e/                                  # profile-appearance, profile-board, profile-avatar, a11y (ambos temas)

docs/design/
├── DESIGN.md                                 # + paleta oscura
└── screens/                                  # + versiones nuevas aprobadas y README con las vigentes

specs/001-eisenhower-task-manager/contracts/openapi.yaml   # integrar profile.yaml (fase de cierre)
```

**Structure Decision**: se mantiene la estructura web existente (backend en capas
`domain → repositories → services → routers` y frontend por `features/`). El perfil es un módulo
nuevo en cada capa; el único código existente que cambia es el listado de tareas (dos parámetros
opcionales), la cabecera, la configuración de Tailwind, la CSP del contenedor web y `index.html`.

## Fases de entrega

Una PR por fase, de menor a mayor riesgo, cada una desplegable por separado (Principio VII). Las
historias de la spec se reparten así; el detalle y las dependencias las fija `/speckit-tasks`.

| Fase | Contenido | Historia | Nota |
|---|---|---|---|
| 1 | **Diseño en Stitch** + paleta oscura en `DESIGN.md` + exportación a `docs/design/screens/` | — | Punto de control humano: el propietario aprueba antes de la Fase 3. Sin código. |
| 2 | **Backend del perfil**: dominio, repositorio, servicio, `GET/PATCH/DELETE /me/profile`, `order` y `within_days` | base de US1–US3 | Puede ir en paralelo a la Fase 1. Revisión de seguridad. |
| 3 | **Apariencia**: variables CSS, tema, densidad, `theme-init.js`, página `/perfil` con apariencia | US1 | Necesita 1 y 2. |
| 4 | **Tablero e historial**: ámbito por defecto, orden, periodo y franja | US2 | |
| 5 | **Identidad**: nombre, catálogo de avatares y cabecera | US3 | |
| 6 | **Subir imagen**: `PUT/GET/DELETE /me/avatar`, Pillow, límite, recortador y CSP `blob:` | US4 | La más sensible. Revisión de seguridad específica. |
| 7 | **Cierre**: contrato integrado en el de la 001, README y RUNBOOK, revisión final, *Definition of Done* | — | |

## Complexity Tracking

| Elemento | Por qué es necesario | Alternativa más simple descartada |
|---|---|---|
| Dependencia `pillow` | Validar y reprocesar imágenes de personas en el servidor es la única forma de cumplir FR-019 (por contenido), FR-021 y la eliminación de EXIF. | Confiar en el cliente o en la cabecera mágica: no detecta archivos corruptos, bombas ni *polyglots* y deja pasar metadatos con ubicación. |
| Colores de Tailwind como variables CSS | Es lo único que permite el tema oscuro sin reescribir cada componente. | Variantes `dark:` en cada clase: decenas de ficheros y más riesgo de omisiones. |
| `public/theme-init.js` externo | Cumple FR-007 sin relajar la CSP (`script-src 'self'`). | Script en línea con *hash*/*nonce*: nginx sirve HTML estático. |
| Límite de subidas en el propio documento de perfil | FR-025 con una transacción que el proyecto ya domina. | Sistema genérico de *rate limit* o Cloud Armor: infraestructura nueva. |
