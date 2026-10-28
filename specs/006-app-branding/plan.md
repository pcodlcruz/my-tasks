# Implementation Plan: Logo y nuevo nombre visible de la aplicación

**Branch**: `feature/006-app-branding` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-app-branding/spec.md`

## Summary

Cambiar el nombre visible de la web a «InsertTasks», mostrar el logo del propietario en la cabecera, en el inicio de sesión y en el acceso
denegado, usarlo como icono de la pestaña y sustituir el subtítulo del inicio de sesión por «Inserta tus tareas y prioriza lo que importa».
Es un cambio **solo de frontend**: una constante con el nombre y el mensaje, un componente pequeño que pinta el logo, el fichero del logo
como recurso con hash y los cinco textos que hoy dicen «MyTasks». No toca backend, datos, autenticación, infraestructura ni pipeline (research
R8). Dependencia externa: la imagen del logo la entrega el propietario; sin ella no se puede cerrar la parte visual (research, Riesgo).

## Technical Context

**Language/Version**: TypeScript estricto (React 18+), el del frontend actual

**Primary Dependencies**: ninguna nueva (React, React Router, Tailwind y Vite, ya presentes)

**Storage**: N/A (no hay datos; ver `data-model.md`)

**Testing**: Vitest (unitarios de `LoginPage`, `AppHeader`, `AccessDeniedPage`, `BoardPage`, y un test de `brand.ts` contra `index.html`) y
Playwright (un e2e corto del nombre, el logo y el título); el contraste lo cubre el e2e de accesibilidad existente

**Target Platform**: navegadores actuales, servidos por nginx de `mytasks-web` detrás de Firebase Hosting

**Project Type**: aplicación web (frontend + backend); solo cambia el frontend

**Performance Goals**: sin saltos de maquetación al cargar el logo (SC-004); logo ligero (~50 KB como tope, research R4)

**Constraints**: logo legible en tema claro y oscuro (SC-002, SC-003); sin cambios en la CSP (`img-src 'self'` ya vale); el logo no se inserta
nunca como HTML; cambio visual aprobado por el propietario en staging (SC-005)

**Scale/Scope**: 5 ficheros de interfaz con texto, 1 componente, 1 constante, 1 imagen (más 1 icono), 3–4 ficheros de test

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Simplicidad | ✅ Sin dependencias ni servicios nuevos. Un componente (tres usos) y una constante (cinco usos) con su justificación en `research.md` R2; la variante para tema oscuro y el favicon PNG solo se añaden si la imagen lo exige (R5, R6). |
| II. Tests por niveles | ✅ Unitarios de lo que cambia, un e2e del flujo visible (inicio de sesión → tablero) y el contraste con el e2e de accesibilidad. No hay endpoint ni dominio nuevo, así que no hay tests de backend. |
| III. Seguridad | ✅ No cambia autenticación, autorización ni datos: **sin revisión de `mytasks-security-auditor`**. El logo es una imagen del mismo origen, mostrada con `<img>` (nunca HTML); la CSP no cambia. |
| IV. Paridad de entornos | ✅ El mismo código en staging y producción; la aprobación visual del propietario se hace en staging antes de producción. |
| V. Identidad de agente / MCP | ✅ No se opera sobre Google Cloud en esta feature. |
| VI. Despliegue por pipeline | ✅ Va por `develop` → `release/*` → `main` con el despliegue existente. |
| VII. Revisión humana | ✅ PR de diseño y PR de fase; la fusión la hace el propietario. |
| VIII. Agentes y skills | ✅ Implementación con `mytasks-frontend-developer`. Sin Stitch: no hay pantallas nuevas (R9). |
| IX. Idioma | ✅ Documentación en español; código y commits en inglés; los textos visibles, en español. |

**Resultado**: sin violaciones. Se vuelve a evaluar tras el diseño de la Fase 1: sin cambios (no se añadió ninguna pieza fuera de lo anterior).

## Project Structure

### Documentation (this feature)

```text
specs/006-app-branding/
├── plan.md              # Este fichero (/speckit-plan)
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   └── branding-ui.md   # Fase 1: textos y lugares exactos
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
frontend/
├── index.html                                   # título «InsertTasks»; <link rel="icon"> si el formato cambia
├── public/
│   └── favicon.svg                              # sustituido por el logo (o favicon.png, ver research R6)
├── nginx/
│   ├── default.conf                             # solo si el icono es PNG: location con caché de un día
│   └── tests/test-runtime-config.sh             # solo si el icono es PNG
├── src/
│   ├── assets/brand/logo.<ext>                  # el logo del propietario (recurso con hash)
│   ├── lib/brand.ts                             # APP_NAME y APP_TAGLINE (nuevo)
│   ├── index.css                                # solo si hace falta variante para tema oscuro (R5)
│   ├── features/shared/BrandLogo.tsx            # logo con tamaño fijo, decorativo (nuevo)
│   ├── app/AppHeader.tsx                        # logo + nombre
│   ├── features/auth/LoginPage.tsx              # logo + nombre + mensaje de propósito
│   ├── features/auth/AccessDeniedPage.tsx       # logo + nombre
│   └── features/board/BoardPage.tsx             # «¡Bienvenido a InsertTasks!»
└── tests/
    ├── unit/lib/brand.test.ts                   # APP_NAME coincide con el título de index.html (nuevo)
    ├── unit/features/auth/LoginPage.test.tsx    # ampliado
    ├── unit/features/auth/AccessDeniedPage.test.tsx
    ├── unit/app/AppHeader.test.tsx
    ├── unit/features/board/                     # texto de bienvenida
    └── e2e/branding.spec.ts                     # nombre, logo y título en login y tablero (nuevo)
```

**Structure Decision**: aplicación web existente; el cambio vive entero en `frontend/`. No se crea ninguna carpeta de nivel superior ni se
toca `backend/`, `infra/` ni `.github/`.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
