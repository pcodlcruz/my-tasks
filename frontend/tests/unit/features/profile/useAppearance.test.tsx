import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../../../src/api/types'
import { APPEARANCE_STORAGE_KEY } from '../../../../src/lib/appearance'

const useProfileMock = vi.fn()

vi.mock('../../../../src/api/profile', () => ({
  useProfile: () => useProfileMock(),
}))

const PROFILE: Profile = {
  theme: 'system',
  density: 'comfortable',
  default_scope: 'all',
  board_order: 'oldest',
  history_days: null,
  display_name: null,
  avatar: { kind: 'initials', preset: null, version: 0 },
}

type Listener = (event: { matches: boolean }) => void

let systemIsDark = false
let listeners: Listener[] = []

function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query === '(prefers-color-scheme: dark)' && systemIsDark
      },
      media: query,
      addEventListener: (_: string, listener: Listener) => {
        listeners.push(listener)
      },
      removeEventListener: (_: string, listener: Listener) => {
        listeners = listeners.filter((current) => current !== listener)
      },
    })),
  )
}

function changeSystemTheme(isDark: boolean): void {
  systemIsDark = isDark
  act(() => {
    for (const listener of listeners) listener({ matches: isDark })
  })
}

async function renderUseAppearance(): Promise<ReturnType<typeof renderHook>> {
  const { useAppearance } = await import('../../../../src/features/profile/useAppearance')
  return renderHook(() => useAppearance())
}

const root = document.documentElement

describe('useAppearance', () => {
  beforeEach(() => {
    systemIsDark = false
    listeners = []
    window.localStorage.clear()
    root.removeAttribute('data-theme')
    root.removeAttribute('data-density')
    useProfileMock.mockReset()
    stubMatchMedia()
  })

  it('aplica el tema y la densidad del perfil al cargarlo', async () => {
    useProfileMock.mockReturnValue({ data: { ...PROFILE, theme: 'dark', density: 'compact' } })

    await renderUseAppearance()

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-density')).toBe('compact')
  })

  it('guarda en la caché la elección (no el tema resuelto)', async () => {
    useProfileMock.mockReturnValue({ data: { ...PROFILE, theme: 'system', density: 'compact' } })
    systemIsDark = true

    await renderUseAppearance()

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(
      JSON.stringify({ theme: 'system', density: 'compact' }),
    )
  })

  it('actualiza los atributos y la caché cuando cambia el perfil', async () => {
    useProfileMock.mockReturnValue({ data: PROFILE })
    const { rerender } = await renderUseAppearance()
    expect(root.getAttribute('data-theme')).toBe('light')

    useProfileMock.mockReturnValue({ data: { ...PROFILE, theme: 'dark' } })
    rerender()

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(
      JSON.stringify({ theme: 'dark', density: 'comfortable' }),
    )
  })

  it('con el tema "system", sigue en vivo el cambio del tema del sistema', async () => {
    useProfileMock.mockReturnValue({ data: PROFILE })
    await renderUseAppearance()
    expect(root.getAttribute('data-theme')).toBe('light')

    changeSystemTheme(true)
    expect(root.getAttribute('data-theme')).toBe('dark')

    changeSystemTheme(false)
    expect(root.getAttribute('data-theme')).toBe('light')
  })

  it('con un tema elegido, ignora el cambio del tema del sistema', async () => {
    useProfileMock.mockReturnValue({ data: { ...PROFILE, theme: 'light' } })
    await renderUseAppearance()

    changeSystemTheme(true)

    expect(root.getAttribute('data-theme')).toBe('light')
    expect(listeners).toHaveLength(0)
  })

  it('deja de escuchar el sistema al desmontarse', async () => {
    useProfileMock.mockReturnValue({ data: PROFILE })
    const { unmount } = await renderUseAppearance()
    expect(listeners).toHaveLength(1)

    unmount()

    expect(listeners).toHaveLength(0)
  })

  it('sin perfil (cargando o con error) no toca lo que dejó el script inicial', async () => {
    root.setAttribute('data-theme', 'dark')
    root.setAttribute('data-density', 'compact')
    useProfileMock.mockReturnValue({ data: undefined, isError: true })

    await renderUseAppearance()

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-density')).toBe('compact')
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull()
  })
})
