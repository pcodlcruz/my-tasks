import type { Density, Theme } from '../api/types'

export interface Appearance {
  theme: Theme
  density: Density
}

export const APPEARANCE_STORAGE_KEY = 'mytasks.appearance'

export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', density: 'comfortable' }

const THEMES: readonly Theme[] = ['light', 'dark', 'system']
const DENSITIES: readonly Density[] = ['comfortable', 'compact']

// Same algorithm as public/theme-init.js, which paints before the bundle loads.
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  if (typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement
  root.setAttribute('data-theme', resolveTheme(appearance.theme))
  root.setAttribute('data-density', appearance.density)
}

// The cache only holds two strings, so a corrupt or foreign value is simply ignored. Any
// storage failure (private window, blocked site data) falls back to the defaults.
export function readCachedAppearance(): Appearance {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_APPEARANCE
    const { theme, density } = parsed as Record<string, unknown>
    return {
      theme: THEMES.find((value) => value === theme) ?? DEFAULT_APPEARANCE.theme,
      density: DENSITIES.find((value) => value === density) ?? DEFAULT_APPEARANCE.density,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function writeCachedAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ theme: appearance.theme, density: appearance.density }),
    )
  } catch {
    // The cache is only a convenience to paint without a flash: losing it is harmless.
  }
}
