# Implementation Plan: Indicadores compactos en la tarjeta de tarea

**Branch**: `feature/008-task-card-indicators` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-task-card-indicators/spec.md`

## Summary

Las marcas «Programada» y «Misión del día» de la tarjeta del tablero se convierten en **iconos
junto al título** (calendario y ★ dorada), con texto accesible y un tooltip que funciona con
ratón y en pantalla táctil. «Pendiente desde el …» baja al pie. El botón «Añadir/Quitar de la
misión» pasa a ser un **botón de estrella** (☆/★) que conserva sus nombres accesibles.

El solapamiento tiene una causa concreta (research R1): la cabecera de la tarjeta usa el punto de
corte `sm:` del viewport, pero en escritorio vive en una columna de la matriz 2×2, con elementos
que no encogen. Se corrige con un flujo que salta de línea (`flex-wrap`, título `min-w-0 flex-1`).

Es un cambio **solo de frontend**: no toca backend, datos, autenticación ni infraestructura.
Antes del código, el diseño se aprueba en Stitch (S3 v4, FR-009).

## Technical Context

**Language/Version**: TypeScript estricto (React 18.3), el del frontend actual

**Primary Dependencies**: ninguna nueva (React, Tailwind 3.4, TanStack Query, Zustand, ya presentes)

**Storage**: N/A (sin cambios de datos; ver [data-model.md](./data-model.md))

**Testing**:
- Vitest: `TaskCard.test.tsx` actualizado y test del componente nuevo `CardIndicator`.
- Playwright: un e2e nuevo de no solapamiento en `a11y.spec.ts`. Los e2e de misión y de
  programadas siguen valiendo (research R8).

**Target Platform**: navegadores actuales de escritorio y móvil (desde 320 px), tema claro y oscuro, densidad normal y compacta

**Project Type**: aplicación web (frontend + backend); solo cambia el frontend

**Performance Goals**: sin coste perceptible: el tooltip es estado local por indicador, sin listeners globales cuando está cerrado

**Constraints**:
- Ningún solapamiento ni desplazamiento horizontal (FR-002).
- WCAG 2.2 AA: 1.4.1, 1.4.11, 1.4.13 y 2.5.8.
- Los nombres accesibles actuales del botón de misión se conservan.

**Scale/Scope**: 1 componente modificado (`TaskCard`), 1 componente nuevo (`CardIndicator`), 2 ficheros de test (+1 nuevo), 4 pantallas de Stitch (+ variantes)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Simplicidad | ✅ Sin dependencias nuevas. Se descartan las *container queries* (plugin) y una librería de tooltips (R1, R3). Un componente nuevo, `CardIndicator`, con dos usos y el tooltip dentro: justificado en R2/R3 frente a duplicar el marcado dos veces. |
| II. Tests por niveles | ✅ Unitarios (Vitest) de la tarjeta y del indicador, y un e2e del flujo visible (no solapamiento + axe en claro y oscuro). No hay endpoint ni dominio nuevo, así que no hay tests de backend. |
| III. Seguridad | ✅ No cambia autenticación, autorización ni modelo de datos: **sin revisión de `mytasks-security-auditor`** (R9). No se inserta HTML. |
| IV. Paridad de entornos | ✅ El mismo código en staging y producción; pasa por staging antes de producción. |
| V. Identidad de agente / MCP | ✅ No se opera sobre Google Cloud. Stitch se usa por su MCP como herramienta de diseño. La exportación con `export-stitch.py` la ejecuta el propietario, como en la 007 (R7). |
| VI. Despliegue por pipeline | ✅ Va por `develop` → `release/*` → `main` con el despliegue existente. |
| VII. Revisión humana | ✅ PR de diseño y PR por fase; la fusión la hace el propietario. Punto de control humano: aprobación de S3 v4 en Stitch antes del código (FR-009). |
| VIII. Agentes y skills | ✅ Implementación con `mytasks-frontend-developer`. El diseño, con el MCP de Stitch (sin skill propio, como en la 004 y la 007). |
| IX. Idioma | ✅ Documentación en español; código y commits en inglés; textos visibles y accesibles en español. |

**Resultado**: sin violaciones.

**Re-evaluación tras la Fase 1** (`data-model.md`, `contracts/task-card-ui.md`,
`quickstart.md`): sin cambios.
- El diseño no añade piezas fuera de las anteriores.
- La única desviación de la spec es de redacción: FR-007 pedía «anunciar su estado
  (pulsado/no pulsado)», y se cumple con la etiqueta cambiante en lugar de con `aria-pressed`,
  según la guía de ARIA (R4). La spec se enmienda en ese sentido.

## Project Structure

### Documentation (this feature)

```text
specs/008-task-card-indicators/
├── plan.md                 # Este fichero (/speckit-plan)
├── research.md             # Fase 0
├── data-model.md           # Fase 1 (sin cambios de datos)
├── quickstart.md           # Fase 1
├── contracts/
│   └── task-card-ui.md     # Fase 1: qué muestra y anuncia la tarjeta
├── checklists/
│   └── requirements.md
└── tasks.md                # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
frontend/
├── src/features/board/
│   ├── TaskCard.tsx            # cabecera con flex-wrap; indicadores junto al título;
│   │                           # «Pendiente desde» en el pie; botón de estrella
│   └── CardIndicator.tsx       # NUEVO: icono + texto sr-only + tooltip (ratón y táctil)
└── tests/
    ├── unit/features/board/
    │   ├── TaskCard.test.tsx   # actualizado al contrato
    │   └── CardIndicator.test.tsx  # NUEVO: tooltip (puntero, toque, Escape, toque fuera)
    └── e2e/
        └── a11y.spec.ts        # + test de no solapamiento (320 / 768 / 1024 / 1280 px × normal / compacta)

docs/design/
├── screens/README.md           # filas de S3 v4 (ids de Stitch y estado de aprobación)
└── screens/s3-board-v4*/       # exportadas por el propietario (export-stitch.py)
```

**Structure Decision**:
- Se mantiene la estructura actual de la aplicación web. Solo cambian `frontend/` y
  `docs/design/`; `backend/` e `infra/` no cambian.
- `CardIndicator` vive en `features/board/` porque solo lo usa la tarjeta. Si otra pantalla lo
  necesitara más adelante, se movería a `features/shared/`. Hoy no hace falta: S8 y S10 muestran
  el texto completo.

### Fases previstas (orientativas para `/speckit-tasks`)

1. **Diseño en Stitch**: S3 v4 con las variantes V1/V2 (R6, R7) y punto de control del
   propietario. Exportación a `docs/design/screens/` y actualización del contrato si gana V2.
2. **Implementación (US1 + US2 + US3)**: `CardIndicator`, cambios en `TaskCard` y sus tests, y el
   e2e de no solapamiento. Las tres historias tocan el mismo componente, así que una sola fase
   evita conflictos entre PRs.
3. **Cierre y release**: `definition-of-done.md`, nota en el README si procede, release a `main`
   y validación del propietario en producción (SC-003).

## Complexity Tracking

Sin violaciones que justificar.
