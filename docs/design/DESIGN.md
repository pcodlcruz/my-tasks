# Design System: Gestor Personal de Tareas

**Feature**: `001-eisenhower-task-manager` | **Fuente**: [contracts/ui-screens.md](../../specs/001-eisenhower-task-manager/contracts/ui-screens.md)

Fuente de verdad para el proyecto Stitch "MyTasks" (T012) y para los tokens de
`frontend/tailwind.config.ts` (T020). Objetivo de accesibilidad: **WCAG 2.1 AA**
(contraste ≥ 4.5:1 para texto normal, ≥ 3:1 para texto grande ≥ 18.66px/bold y para
componentes de interfaz). Ningún cuadrante se distingue solo por color: cada uno
lleva siempre su etiqueta de texto.

## Paleta por cuadrante

Cada cuadrante define un color de acento (icono, borde izquierdo de la tarjeta,
insignia) y un fondo de superficie (tinte muy claro) para que el texto oscuro por
defecto (`--color-text`) siga cumpliendo AA sobre la tarjeta.

| Cuadrante | Etiqueta | Acento (`accent`) | Sobre blanco | Superficie (`surface`) | Texto sobre acento (chips) |
|---|---|---|---|---|---|
| `do_now` | Hacer ahora | `#B91C1C` (rojo 700) | 4.53:1 | `#FEF2F2` (rojo 50) | `#FFFFFF` (5.9:1) |
| `schedule` | Planificar | `#1D4ED8` (azul 700) | 5.90:1 | `#EFF6FF` (azul 50) | `#FFFFFF` (6.3:1) |
| `delegate` | Delegar | `#B45309` (ámbar 700) | 4.61:1 | `#FFFBEB` (ámbar 50) | `#FFFFFF` (4.9:1) |
| `eliminate` | Eliminar | `#475569` (pizarra 600) | 5.74:1 | `#F8FAFC` (pizarra 50) | `#FFFFFF` (6.1:1) |

Ratios calculados frente a blanco (`#FFFFFF`) y verificados con el validador de
contraste de WebAIM; se reconfirman en Fase 9 (T105) con `@axe-core/playwright`
sobre la interfaz ya renderizada.

**Regla de uso**: el color de acento nunca es el único indicador — cada tarjeta y
cabecera de cuadrante siempre muestra la etiqueta de texto ("Hacer ahora",
"Planificar", "Delegar", "Eliminar") junto al color.

## Colores neutros y semánticos

| Token | Valor | Uso |
|---|---|---|
| `--color-text` | `#0F172A` (pizarra 900) | Texto principal, 16.1:1 sobre blanco |
| `--color-text-muted` | `#475569` (pizarra 600) | Texto secundario, 5.74:1 sobre blanco |
| `--color-surface` | `#FFFFFF` | Fondo de tarjetas y modales |
| `--color-surface-alt` | `#F8FAFC` (pizarra 50) | Fondo de página |
| `--color-border` | `#CBD5E1` (pizarra 300) | Bordes de tarjetas e inputs |
| `--color-primary` | `#1D4ED8` (azul 700) | Botón principal ("Nueva tarea"), enlaces, foco |
| `--color-primary-hover` | `#1E40AF` (azul 800) | Hover del botón principal |
| `--color-error` | `#B91C1C` (rojo 700) | Errores de validación, texto de error, 4.53:1 |
| `--color-error-surface` | `#FEF2F2` (rojo 50) | Fondo de banners de error |
| `--color-success` | `#15803D` (verde 700) | Confirmaciones (toasts de éxito), 4.51:1 |
| `--color-disabled-bg` | `#E2E8F0` (pizarra 200) | Fondo de controles deshabilitados |
| `--color-disabled-text` | `#94A3B8` (pizarra 400) | Texto de controles deshabilitados (no interactivo, exento de AA) |
| `--color-scope-work` | `#7C3AED` (violeta 600) | Insignia de ámbito "Laboral", 5.4:1 |
| `--color-scope-personal` | `#0F766E` (verde azulado 700) | Insignia de ámbito "Personal", 5.2:1 sobre el fondo de la insignia (`#F0FDFA`). Antes `#0D9488` (verde azulado 600): daba 3.59:1 sobre ese fondo y no cumplía AA (detectado con axe en T105) |

## Tipografía

- Familia: `"Inter", "Segoe UI", system-ui, sans-serif` (sistema, sin coste de carga
  adicional; Stitch la sustituye por su equivalente si hace falta).
- Escala (line-height entre paréntesis):
  | Estilo | Tamaño | Peso | Uso |
  |---|---|---|---|
  | `display` | 28px (36px) | 700 | Título de página ("Tablero", "Historial") |
  | `heading` | 20px (28px) | 600 | Título de cuadrante, título de modal |
  | `body` | 16px (24px) | 400 | Texto de tarjetas, formularios |
  | `body-strong` | 16px (24px) | 600 | Título de tarea en la tarjeta |
  | `caption` | 13px (18px) | 400 | Contadores, fechas, metadatos |

## Espaciado y radios

- Escala de espaciado (múltiplos de 4px): `4, 8, 12, 16, 24, 32, 48`.
- Radios: `--radius-sm: 6px` (inputs, chips), `--radius-md: 10px` (tarjetas),
  `--radius-lg: 16px` (modales).
- Sombra de tarjeta: `0 1px 2px rgba(15, 23, 42, 0.08)`; modal:
  `0 8px 24px rgba(15, 23, 42, 0.16)`.

## Estados

| Estado | Regla |
|---|---|
| Foco | Anillo de 2px `--color-primary` con 2px de separación (`outline-offset: 2px`); nunca se elimina el foco por defecto del navegador sin sustituirlo |
| Hover (botones/tarjetas interactivas) | Oscurecer el fondo o el acento un 8% (`--color-primary-hover` en el botón principal) |
| Deshabilitado | `--color-disabled-bg` + `--color-disabled-text`, `cursor: not-allowed`, sin sombra |
| Error (campo de formulario) | Borde `--color-error`, texto de ayuda en `--color-error`, icono de aviso; el mensaje se asocia al campo vía `aria-describedby` |
| Carga | Esqueleto (`skeleton`) con animación de pulso sutil sobre `--color-disabled-bg`; nunca solo un spinner sin texto accesible (`aria-label="Cargando"`) |

## Botón "Iniciar sesión con Google"

Sigue las [guías de marca oficiales de Google](https://developers.google.com/identity/branding-guidelines)
para el botón neutro (tema claro):

- Fondo `#FFFFFF`, borde `1px solid #747775`, radio `4px`, altura `40px`.
- Icono "G" multicolor oficial de Google a la izquierda (16px), separación de 12px
  respecto al texto.
- Texto "Iniciar sesión con Google", `Roboto` o `"Google Sans"` si Stitch la
  ofrece, 500, 14px, color `#1F1F1F`.
- Hover: sombra sutil `0 1px 2px rgba(60,64,67,0.3), 0 1px 3px rgba(60,64,67,0.15)`.
- Foco: anillo azul `#4285F4` de 2px.
- Deshabilitado (mientras carga el popup): opacidad 60%, sin hover.
- No se recolorea ni se sustituye el icono "G" oficial; no se usa el texto
  "Sign in with Google" (la interfaz está en español).

## Cuadrícula del tablero (S3)

- Escritorio (`≥ 768px`): rejilla 2×2, orden canónico Hacer ahora (arriba-izq.) ·
  Planificar (arriba-der.) · Delegar (abajo-izq.) · Eliminar (abajo-der.).
- Móvil (`< 768px`): columna única, orden Hacer ahora · Planificar · Delegar ·
  Eliminar (SC-004).
- Separación entre cuadrantes: `24px` (escritorio) / `16px` (móvil).
