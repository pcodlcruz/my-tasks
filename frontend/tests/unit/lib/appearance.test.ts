import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  readCachedAppearance,
  resolveTheme,
  writeCachedAppearance,
} from '../../../src/lib/appearance'

function stubSystemTheme(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('appearance', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-density')
    stubSystemTheme(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('resolveTheme', () => {
    it('devuelve el tema elegido cuando no es "system"', () => {
      expect(resolveTheme('light')).toBe('light')
      expect(resolveTheme('dark')).toBe('dark')
    })

    it('resuelve "system" con la preferencia del sistema', () => {
      stubSystemTheme(true)
      expect(resolveTheme('system')).toBe('dark')

      stubSystemTheme(false)
      expect(resolveTheme('system')).toBe('light')
    })

    it('cae en claro si no hay matchMedia', () => {
      vi.stubGlobal('matchMedia', undefined)

      expect(resolveTheme('system')).toBe('light')
    })
  })

  describe('applyAppearance', () => {
    it('fija data-theme y data-density en <html>', () => {
      applyAppearance({ theme: 'dark', density: 'compact' })

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.getAttribute('data-density')).toBe('compact')
    })

    it('aplica el tema del sistema resuelto cuando se elige "system"', () => {
      stubSystemTheme(true)

      applyAppearance({ theme: 'system', density: 'comfortable' })

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
    })
  })

  describe('caché local', () => {
    it('guarda y lee el tema y la densidad', () => {
      writeCachedAppearance({ theme: 'dark', density: 'compact' })

      expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(
        JSON.stringify({ theme: 'dark', density: 'compact' }),
      )
      expect(readCachedAppearance()).toEqual({ theme: 'dark', density: 'compact' })
    })

    it('devuelve los valores por defecto sin caché', () => {
      expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE)
      expect(DEFAULT_APPEARANCE).toEqual({ theme: 'system', density: 'comfortable' })
    })

    it('devuelve los valores por defecto con una caché corrupta o con valores desconocidos', () => {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, '{no es json')
      expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE)

      window.localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({ theme: 'neon', density: 'huge' }),
      )
      expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE)

      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'null')
      expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE)
    })

    it('aprovecha el campo válido cuando el otro no lo es', () => {
      window.localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({ theme: 'dark', density: 'huge' }),
      )

      expect(readCachedAppearance()).toEqual({ theme: 'dark', density: 'comfortable' })
    })

    it('no lanza y cae en "sistema" y "cómoda" si localStorage falla al leer', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })

      expect(readCachedAppearance()).toEqual({ theme: 'system', density: 'comfortable' })
    })

    it('no lanza si localStorage falla al escribir', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      expect(() => writeCachedAppearance({ theme: 'dark', density: 'compact' })).not.toThrow()
    })
  })
})
