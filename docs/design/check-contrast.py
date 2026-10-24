#!/usr/bin/env python3
"""WCAG 2.1 contrast check for the design tokens of docs/design/DESIGN.md.

Standard library only. Prints one table per theme and exits with status 1 if any
required pair is below its minimum:

  text   4.5:1  normal text
  large  3.0:1  large text (>= 18.66px bold), icons and focus rings
  exempt -      decorative or disabled (shown for information, never fails)

Usage: python3 docs/design/check-contrast.py
"""

from __future__ import annotations

import sys

MIN_RATIO = {"text": 4.5, "large": 3.0, "exempt": 0.0}

# Light theme: the values that ship today (frontend/tailwind.config.ts). Checked as a
# regression guard: this feature must not change them.
LIGHT = {
    "text": "#0F172A",
    "text-muted": "#475569",
    "surface": "#FFFFFF",
    "surface-alt": "#F8FAFC",
    "border": "#CBD5E1",
    "primary": "#1D4ED8",
    "primary-hover": "#1E40AF",
    "on-primary": "#FFFFFF",
    "error": "#B91C1C",
    "error-surface": "#FEF2F2",
    "success": "#15803D",
    "disabled-bg": "#E2E8F0",
    "disabled-text": "#94A3B8",
    "scope-work": "#7C3AED",
    "scope-personal": "#0F766E",
    "do-now-accent": "#B91C1C",
    "do-now-surface": "#FEF2F2",
    "schedule-accent": "#1D4ED8",
    "schedule-surface": "#EFF6FF",
    "delegate-accent": "#B45309",
    "delegate-surface": "#FFFBEB",
    "eliminate-accent": "#475569",
    "eliminate-surface": "#F8FAFC",
    "on-accent": "#FFFFFF",
}

# Dark theme proposed by this feature (FR-028a). Same semantic names as the light one,
# plus `on-primary` and `on-accent`: a light blue or amber button needs dark text, while
# in the light theme the same tokens are white and nothing changes.
DARK = {
    "text": "#F1F5F9",
    "text-muted": "#CBD5E1",
    "surface": "#1E293B",
    "surface-alt": "#0F172A",
    "border": "#475569",
    "primary": "#60A5FA",
    "primary-hover": "#93C5FD",
    "on-primary": "#0F172A",
    "error": "#F87171",
    "error-surface": "#3B1D1D",
    "success": "#4ADE80",
    "disabled-bg": "#334155",
    "disabled-text": "#64748B",
    "scope-work": "#A78BFA",
    "scope-personal": "#2DD4BF",
    "do-now-accent": "#F87171",
    "do-now-surface": "#2E1A1D",
    "schedule-accent": "#60A5FA",
    "schedule-surface": "#172237",
    "delegate-accent": "#FBBF24",
    "delegate-surface": "#2B2315",
    "eliminate-accent": "#94A3B8",
    "eliminate-surface": "#1C2536",
    "on-accent": "#0F172A",
}

# (foreground, background, kind, where it is used)
PAIRS = [
    ("text", "surface", "text", "Texto principal sobre tarjetas y modales"),
    ("text", "surface-alt", "text", "Texto principal sobre el fondo de página"),
    ("text-muted", "surface", "text", "Texto secundario sobre tarjetas"),
    ("text-muted", "surface-alt", "text", "Texto secundario sobre el fondo de página"),
    ("primary", "surface", "text", "Enlaces, navegación activa y botones de texto"),
    ("primary", "surface-alt", "text", "Enlaces sobre el fondo de página"),
    ("primary", "surface", "large", "Anillo de foco sobre tarjetas"),
    ("on-primary", "primary", "text", "Texto del botón principal"),
    ("on-primary", "primary-hover", "text", "Texto del botón principal al pasar el ratón"),
    ("error", "surface", "text", "Texto de error"),
    ("error", "error-surface", "text", "Texto de error sobre aviso de error"),
    ("success", "surface", "text", "Confirmaciones"),
    ("scope-work", "surface", "text", "Insignia «Laboral»"),
    ("scope-personal", "surface", "text", "Insignia «Personal»"),
    ("do-now-accent", "do-now-surface", "text", "Etiqueta y borde «Hacer ahora»"),
    ("schedule-accent", "schedule-surface", "text", "Etiqueta y borde «Planificar»"),
    ("delegate-accent", "delegate-surface", "text", "Etiqueta y borde «Delegar»"),
    ("eliminate-accent", "eliminate-surface", "text", "Etiqueta y borde «Eliminar»"),
    ("text", "do-now-surface", "text", "Texto de tarea en «Hacer ahora»"),
    ("text", "schedule-surface", "text", "Texto de tarea en «Planificar»"),
    ("text", "delegate-surface", "text", "Texto de tarea en «Delegar»"),
    ("text", "eliminate-surface", "text", "Texto de tarea en «Eliminar»"),
    ("text-muted", "do-now-surface", "text", "Metadatos en «Hacer ahora»"),
    ("text-muted", "schedule-surface", "text", "Metadatos en «Planificar»"),
    ("text-muted", "delegate-surface", "text", "Metadatos en «Delegar»"),
    ("text-muted", "eliminate-surface", "text", "Metadatos en «Eliminar»"),
    ("on-accent", "do-now-accent", "text", "Texto sobre acento «Hacer ahora»"),
    ("on-accent", "schedule-accent", "text", "Texto sobre acento «Planificar»"),
    ("on-accent", "delegate-accent", "text", "Texto sobre acento «Delegar»"),
    ("on-accent", "eliminate-accent", "text", "Texto sobre acento «Eliminar»"),
    ("disabled-text", "disabled-bg", "exempt", "Control deshabilitado (exento de AA)"),
    ("border", "surface", "exempt", "Borde decorativo de tarjetas e inputs (paridad con claro)"),
]


def _channel(value: int) -> float:
    srgb = value / 255
    return srgb / 12.92 if srgb <= 0.03928 else ((srgb + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    red, green, blue = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * _channel(red) + 0.7152 * _channel(green) + 0.0722 * _channel(blue)


def ratio(foreground: str, background: str) -> float:
    light, dark = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (light + 0.05) / (dark + 0.05)


def check(name: str, palette: dict[str, str]) -> int:
    print(f"\n## Tema {name}\n")
    print("| Texto | Fondo | Ratio | Mínimo | Resultado | Uso |")
    print("|---|---|---|---|---|---|")
    failures = 0
    for foreground, background, kind, usage in PAIRS:
        value = ratio(palette[foreground], palette[background])
        minimum = MIN_RATIO[kind]
        ok = value >= minimum
        failures += 0 if ok else 1
        result = "exento" if kind == "exempt" else ("OK" if ok else "FALLA")
        print(
            f"| `{foreground}` {palette[foreground]} | `{background}` {palette[background]} "
            f"| {value:.2f}:1 | {minimum:g}:1 | {result} | {usage} |"
        )
    return failures


def main() -> int:
    failures = check("claro (valores actuales)", LIGHT) + check("oscuro (propuesta)", DARK)
    print(f"\nPares por debajo de AA: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
