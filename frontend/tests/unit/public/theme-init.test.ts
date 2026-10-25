import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `npm test` runs from the frontend directory.
const SOURCE = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf-8')
const STORAGE_KEY = 'mytasks.appearance'

function runThemeInit(): void {
  new Function(SOURCE)()
}

function stubSystemTheme(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && prefersDark,
    })),
  )
}

const root = document.documentElement

describe('theme-init.js', () => {
  beforeEach(() => {
    window.localStorage.clear()
    root.removeAttribute('data-theme')
    root.removeAttribute('data-density')
    stubSystemTheme(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('aplica los atributos de una caché válida', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', density: 'compact' }))

    runThemeInit()

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-density')).toBe('compact')
  })

  it('resuelve "system" con la preferencia del sistema', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: 'system', density: 'compact' }),
    )
    stubSystemTheme(true)

    runThemeInit()

    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  it('usa los valores por defecto sin caché', () => {
    runThemeInit()

    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.getAttribute('data-density')).toBe('comfortable')
  })

  it('usa los valores por defecto con una caché corrupta', () => {
    window.localStorage.setItem(STORAGE_KEY, '{no es json')

    runThemeInit()

    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.getAttribute('data-density')).toBe('comfortable')
  })

  it('usa los valores por defecto con valores desconocidos', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'neon', density: 'huge' }))

    runThemeInit()

    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.getAttribute('data-density')).toBe('comfortable')
  })

  it('funciona sin localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(runThemeInit).not.toThrow()
    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.getAttribute('data-density')).toBe('comfortable')
  })

  it('funciona sin matchMedia', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: 'system', density: 'compact' }),
    )
    vi.stubGlobal('matchMedia', undefined)

    expect(runThemeInit).not.toThrow()
    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.getAttribute('data-density')).toBe('compact')
  })

  it('es autocontenido: sin imports ni peticiones de red', () => {
    expect(SOURCE).not.toMatch(/\bimport\b|\brequire\(|\bfetch\(|XMLHttpRequest/)
  })
})
