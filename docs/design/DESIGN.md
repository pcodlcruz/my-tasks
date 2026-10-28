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

## Tema oscuro (feature 004)

**Fuente**: [specs/004-user-profile-settings/contracts/ui-screens.md](../../specs/004-user-profile-settings/contracts/ui-screens.md).
Los valores claros de arriba **no cambian**. El tema oscuro es una segunda paleta con los
mismos nombres semánticos, más dos tokens nuevos (`on-primary` y `on-accent`) que en claro valen
`#FFFFFF` y por tanto no alteran nada.

**Por qué dos tokens nuevos**: en claro, el botón principal y los acentos de cuadrante son
oscuros y llevan texto blanco; en oscuro son claros (para destacar sobre el fondo) y necesitan
texto oscuro. Sin un token propio para ese texto, una clase `text-white` fija daría un contraste
de 2,5:1.

**Estrategia de contraste**: se sube la luminosidad de los acentos (un paso 400 de la misma
familia, en lugar del 600/700 del tema claro) y las superficies de cuadrante son tintes oscuros
del acento, de modo que el texto principal (`#F1F5F9`) y el secundario (`#CBD5E1`) cumplan AA
sobre cada una. Ningún cuadrante ni ámbito se distingue solo por color.

| Token | Claro | Oscuro | Notas |
|---|---|---|---|
| `text` | `#0F172A` | `#F1F5F9` | |
| `text-muted` | `#475569` | `#CBD5E1` | |
| `surface` | `#FFFFFF` | `#1E293B` | Tarjetas y modales |
| `surface-alt` | `#F8FAFC` | `#0F172A` | Fondo de página |
| `border` | `#CBD5E1` | `#475569` | Decorativo, con la misma relación que en claro |
| `primary` | `#1D4ED8` | `#60A5FA` | Enlaces, navegación activa, foco y fondo del botón principal |
| `primary-hover` | `#1E40AF` | `#93C5FD` | |
| `on-primary` (**nuevo**) | `#FFFFFF` | `#0F172A` | Texto sobre `primary` |
| `error` | `#B91C1C` | `#F87171` | |
| `error-surface` | `#FEF2F2` | `#3B1D1D` | |
| `success` | `#15803D` | `#4ADE80` | |
| `disabled-bg` | `#E2E8F0` | `#334155` | |
| `disabled-text` | `#94A3B8` | `#64748B` | Exento de AA |
| `scope-work` | `#7C3AED` | `#A78BFA` | |
| `scope-personal` | `#0F766E` | `#2DD4BF` | |
| `do-now` · acento / superficie | `#B91C1C` / `#FEF2F2` | `#F87171` / `#2E1A1D` | Hacer ahora |
| `schedule` · acento / superficie | `#1D4ED8` / `#EFF6FF` | `#60A5FA` / `#172237` | Planificar |
| `delegate` · acento / superficie | `#B45309` / `#FFFBEB` | `#FBBF24` / `#2B2315` | Delegar |
| `eliminate` · acento / superficie | `#475569` / `#F8FAFC` | `#94A3B8` / `#1C2536` | Eliminar |
| `on-accent` (**nuevo**) | `#FFFFFF` | `#0F172A` | Texto sobre un acento de cuadrante |

**Verificación**: `python3 docs/design/check-contrast.py` calcula el ratio de 32 pares por tema
(texto, acentos sobre sus superficies, textos sobre acentos, botón principal, foco) y falla si
alguno baja de AA (4,5:1 texto; 3:1 texto grande, iconos y foco). Resultado del 2026-10-23: **0
pares por debajo de AA** en el tema claro (guarda de regresión) y en el oscuro. Los mínimos son:
`text` 13,35:1 (el más bajo de texto sobre tarjeta), `primary` 5,75:1, `error` 5,29:1.

**Para la implementación (Fase 3)**: las clases de Tailwind que hoy usan colores literales y no
tokens (`bg-white`, `text-white`, `bg-text`, `border-blue-200`, `border-slate-200`,
`border-red-200`, `border-amber-200`, `border-purple-200`, `border-teal-200` y `bg-teal-50`)
**no cambiarían de color en oscuro**. Hay que sustituirlas por tokens (`on-primary`, `on-accent`,
`surface`, `border`…) al convertir la paleta a variables CSS.

### Tokens añadidos en la implementación (Fase 3, 2026-10-24)

Al pasar la paleta a variables CSS hubo que dar nombre a colores que el código escribía como
clases literales de Tailwind (`border-red-200`, `bg-purple-50`…). Los valores **claros** son los
literales de siempre (no cambia ningún píxel); los oscuros son decorativos (bordes y tintes), sin
requisito de contraste propio, y su texto sigue las parejas ya validadas.

| Token | Claro | Oscuro | Sustituye a |
|---|---|---|---|
| `do-now-border` | `#FECACA` | `#5C2B2E` | `border-red-200` |
| `schedule-border` | `#BFDBFE` | `#2B4A7A` | `border-blue-200` |
| `delegate-border` | `#FDE68A` | `#6B5420` | `border-amber-200` |
| `eliminate-border` | `#E2E8F0` | `#3B475C` | `border-slate-200` |
| `scope-work-surface` / `-border` | `#FAF5FF` / `#E9D5FF` | `#2E2650` / `#4C3D8F` | `bg-purple-50` / `border-purple-200` |
| `scope-personal-surface` / `-border` | `#F0FDFA` / `#99F6E4` | `#12302E` / `#1F6B63` | `bg-teal-50` / `border-teal-200` |
| `page` | `#FFFFFF` | `#0F172A` | Fondo del lienzo (era el del navegador) |
| `ink` | `#000000` | `#F1F5F9` | Tinta base del texto sin clase (era la del navegador) |

El tablero toma su relleno de variables de densidad (`--card-padding`, `--card-gap`,
`--card-inner-gap`, `--card-footer-gap`, `--quadrant-padding`; cómoda 1 / 0,75 / 0,75 / 0,5 / 1 rem,
compacta 0,5 / 0,375 / 0,375 / 0,25 / 0,5 rem) y, en compacta, la tarjeta se maqueta en una fila
(título y acciones, luego ámbito y «Completar»).

## Logo y nombre (feature 006)

**Fuente**: [specs/006-app-branding/](../../specs/006-app-branding/spec.md) y su contrato
[branding-ui.md](../../specs/006-app-branding/contracts/branding-ui.md). Los textos exactos viven en
`frontend/src/lib/brand.ts`; ningún otro fichero los repite.

- **Nombre**: `InsertTasks` (solo visual: los nombres técnicos no cambian). Mensaje del inicio de
  sesión: «Inserta tus tareas y prioriza lo que importa».
- **Logo**: la insignia completa del propietario (emblema de recreativa y rótulo «INSERTTASK ·
  GESTOR DE TAREAS PERSONALES»), en `frontend/src/assets/brand/logo.png` (PNG con transparencia,
  384×413 px). El rótulo dice «INSERTTASK», sin la «s» final, y está aceptado tal cual.
- **Dónde se usa**: solo en el inicio de sesión y en el acceso denegado, encima del encabezado y
  centrado. **No** va en la cabecera (a tamaño pequeño se ve borrosa: allí solo el texto
  «InsertTasks») ni como icono de la pestaña (se mantiene `favicon.svg`). Un diseño futuro que
  quiera el logo en otro sitio lo decide el propietario.
- **Tamaño**: uno solo, grande, con el componente `BrandLogo`: 128 px de ancho en móvil y 176 px
  desde `sm` (≥ 640 px). La imagen reserva su hueco con `width`/`height` para no mover el contenido
  al cargar. No hay variante pequeña.
- **Accesibilidad**: decorativo (`alt=""`); el nombre lo anuncia el texto, una sola vez.
- **Temas**: una sola imagen para claro y oscuro. La insignia lleva su propio fondo (emblema
  oscuro con borde), por lo que no se mide contra `surface` y no hay variante por tema.
- **Regla (FR-009)**: el logo se publica tal como lo entregó el propietario. No se recolorea, no se
  redibuja y no se recorta (un recorte del emblema se probó y no es legible por debajo de 48 px).
