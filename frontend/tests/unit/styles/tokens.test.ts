import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import tailwindConfig from '../../../tailwind.config'

const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8')

// Snapshot of the light palette as it was in `tailwind.config.ts` (and as the literal
// Tailwind classes it replaced) BEFORE the colors became CSS variables. Whoever does not touch
// their profile must not see a single color change (FR-004, SC-009): never edit these values to
// make the test pass.
const ORIGINAL_LIGHT: Record<string, string> = {
  text: '#0F172A',
  'text-muted': '#475569',
  surface: '#FFFFFF',
  'surface-alt': '#F8FAFC',
  border: '#CBD5E1',
  primary: '#1D4ED8',
  'primary-hover': '#1E40AF',
  error: '#B91C1C',
  'error-surface': '#FEF2F2',
  success: '#15803D',
  'disabled-bg': '#E2E8F0',
  'disabled-text': '#94A3B8',
  'scope-work': '#7C3AED',
  'scope-personal': '#0F766E',
  'do-now-accent': '#B91C1C',
  'do-now-surface': '#FEF2F2',
  'schedule-accent': '#1D4ED8',
  'schedule-surface': '#EFF6FF',
  'delegate-accent': '#B45309',
  'delegate-surface': '#FFFBEB',
  'eliminate-accent': '#475569',
  'eliminate-surface': '#F8FAFC',
  // Tokens that replace literal Tailwind classes (red-200, blue-200, amber-200, slate-200,
  // purple-50/200, teal-50/200, white text on a colored button).
  'do-now-border': '#FECACA',
  'schedule-border': '#BFDBFE',
  'delegate-border': '#FDE68A',
  'eliminate-border': '#E2E8F0',
  'scope-work-surface': '#FAF5FF',
  'scope-work-border': '#E9D5FF',
  'scope-personal-surface': '#F0FDFA',
  'scope-personal-border': '#99F6E4',
  'on-primary': '#FFFFFF',
  'on-accent': '#FFFFFF',
  // The page canvas and base text ink before there were themes: the browser's own defaults.
  page: '#FFFFFF',
  ink: '#000000',
}

// The dark palette approved in phase 1 (docs/design/DESIGN.md, § Tema oscuro).
const APPROVED_DARK: Record<string, string> = {
  text: '#F1F5F9',
  'text-muted': '#CBD5E1',
  surface: '#1E293B',
  'surface-alt': '#0F172A',
  border: '#475569',
  primary: '#60A5FA',
  'primary-hover': '#93C5FD',
  'on-primary': '#0F172A',
  error: '#F87171',
  'error-surface': '#3B1D1D',
  success: '#4ADE80',
  'disabled-bg': '#334155',
  'disabled-text': '#64748B',
  'scope-work': '#A78BFA',
  'scope-personal': '#2DD4BF',
  'do-now-accent': '#F87171',
  'do-now-surface': '#2E1A1D',
  'schedule-accent': '#60A5FA',
  'schedule-surface': '#172237',
  'delegate-accent': '#FBBF24',
  'delegate-surface': '#2B2315',
  'eliminate-accent': '#94A3B8',
  'eliminate-surface': '#1C2536',
  'on-accent': '#0F172A',
}

function block(selector: string): string {
  const start = CSS.indexOf(selector)
  expect(start, `Falta el bloque ${selector} en index.css`).toBeGreaterThanOrEqual(0)
  const open = CSS.indexOf('{', start)
  const close = CSS.indexOf('}', open)
  return CSS.slice(open + 1, close)
}

function variables(selector: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of block(selector).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    result[match[1] as string] = (match[2] as string).trim()
  }
  return result
}

function toHex(triplet: string): string {
  const channels = triplet.split(/\s+/).map(Number)
  expect(channels, `"${triplet}" no es una terna "r g b"`).toHaveLength(3)
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function colorVariables(selector: string): Record<string, string> {
  const colors: Record<string, string> = {}
  for (const [name, value] of Object.entries(variables(selector))) {
    if (name.startsWith('color-')) colors[name.slice('color-'.length)] = toHex(value)
  }
  return colors
}

function flattenColors(node: unknown, path: string[] = []): Record<string, string> {
  if (typeof node === 'string') return { [path.join('.')]: node }
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    Object.assign(flat, flattenColors(value, key === 'DEFAULT' ? path : [...path, key]))
  }
  return flat
}

describe('tokens de color', () => {
  it('los valores claros de :root son idénticos a los originales (FR-004, SC-009)', () => {
    expect(colorVariables(':root {')).toEqual(ORIGINAL_LIGHT)
  })

  it("los valores oscuros de :root[data-theme='dark'] son los aprobados en la Fase 1", () => {
    const dark = colorVariables(":root[data-theme='dark']")

    for (const [name, hex] of Object.entries(APPROVED_DARK)) {
      expect(dark[name], `token oscuro ${name}`).toBe(hex)
    }
  })

  it('el tema oscuro define cada token que define el claro', () => {
    const light = Object.keys(colorVariables(':root {')).sort()
    const dark = Object.keys(colorVariables(":root[data-theme='dark']")).sort()

    expect(dark).toEqual(light)
  })

  it('todos los colores de Tailwind son variables CSS, ninguno un valor fijo', () => {
    const colors = flattenColors(tailwindConfig.theme?.extend?.colors)
    const names = Object.keys(variables(':root {'))

    expect(Object.keys(colors).length).toBeGreaterThan(20)
    for (const [token, value] of Object.entries(colors)) {
      const match = /^rgb\(var\(--(color-[a-z0-9-]+)\) \/ <alpha-value>\)$/.exec(value)
      expect(
        match,
        `El color ${token} debe ser rgb(var(--color-…) / <alpha-value>), no "${value}"`,
      ).not.toBeNull()
      expect(names, `Falta la variable --${match?.[1]} de ${token}`).toContain(match?.[1])
    }
  })

  it('declara color-scheme para que los controles nativos sigan el tema', () => {
    expect(block(':root {')).toMatch(/color-scheme:\s*light/)
    expect(block(":root[data-theme='dark']")).toMatch(/color-scheme:\s*dark/)
  })
})
