import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, ProfileUpdate } from '../../../../src/api/types'

const detectTimezoneMock = vi.hoisted(() => vi.fn<() => string | null>())

vi.mock('../../../../src/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/lib/timezone')>()),
  detectTimezone: () => detectTimezoneMock(),
}))

vi.mock('../../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}))

const PROFILE: Profile = {
  theme: 'system',
  density: 'comfortable',
  default_scope: 'all',
  board_order: 'oldest',
  history_days: null,
  display_name: null,
  avatar: { kind: 'initials', preset: null, version: 0 },
  daily_goal: 3,
  active_weekdays: [1, 2, 3, 4, 5, 6, 7],
  timezone: 'Europe/Madrid',
  morning_review: true,
  arcade_mode: true,
}

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

async function renderSettings(
  overrides: Partial<Profile> = {},
): Promise<{ onChange: ReturnType<typeof vi.fn<(update: ProfileUpdate) => void>> }> {
  const { ProgressSettings } = await import('../../../../src/features/profile/ProgressSettings')
  const onChange = vi.fn<(update: ProfileUpdate) => void>()
  render(<ProgressSettings profile={{ ...PROFILE, ...overrides }} onChange={onChange} />)
  return { onChange }
}

function section(): HTMLElement {
  return screen.getByRole('region', { name: 'Progreso y juego' })
}

function day(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: 'Días activos' })).getByRole('button', { name })
}

describe('<ProgressSettings>', () => {
  beforeEach(() => {
    detectTimezoneMock.mockReset()
    detectTimezoneMock.mockReturnValue('Europe/Madrid')
  })

  describe('meta diaria', () => {
    it('muestra la meta guardada y la sube o la baja de una en una', async () => {
      const { onChange } = await renderSettings()

      expect(section()).toHaveTextContent('3 tareas')
      await userEvent.click(screen.getByRole('button', { name: 'Aumentar meta diaria' }))
      await userEvent.click(screen.getByRole('button', { name: 'Disminuir meta diaria' }))

      expect(onChange.mock.calls).toEqual([[{ daily_goal: 4 }], [{ daily_goal: 2 }]])
    })

    it('no baja de 1 ni sube de 20', async () => {
      await renderSettings({ daily_goal: 1 })
      expect(screen.getByRole('button', { name: 'Disminuir meta diaria' })).toBeDisabled()
      expect(section()).toHaveTextContent('1 tarea')
    })

    it('a 20 no deja subir más', async () => {
      await renderSettings({ daily_goal: 20 })

      expect(screen.getByRole('button', { name: 'Aumentar meta diaria' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Disminuir meta diaria' })).toBeEnabled()
    })
  })

  describe('días activos', () => {
    it('muestra los 7 días como botones pulsables con su nombre completo', async () => {
      await renderSettings({ active_weekdays: [1, 2, 3, 4, 5] })

      WEEKDAYS.forEach((name, index) => {
        expect(day(name)).toHaveAttribute('aria-pressed', index < 5 ? 'true' : 'false')
      })
    })

    it('desmarcar un día lo quita y marcarlo lo añade, siempre en orden', async () => {
      const { onChange } = await renderSettings({ active_weekdays: [1, 2, 3, 4, 5] })

      await userEvent.click(day('Miércoles'))
      await userEvent.click(day('Domingo'))

      expect(onChange.mock.calls).toEqual([
        [{ active_weekdays: [1, 2, 4, 5] }],
        [{ active_weekdays: [1, 2, 3, 4, 5, 7] }],
      ])
    })

    it('no deja desmarcar el último día activo', async () => {
      const { onChange } = await renderSettings({ active_weekdays: [3] })

      expect(day('Miércoles')).toBeDisabled()
      await userEvent.click(day('Miércoles'))

      expect(onChange).not.toHaveBeenCalled()
      expect(section()).toHaveTextContent('Al menos un día.')
    })
  })

  describe('zona horaria', () => {
    it('muestra la zona guardada y la cambia al elegir otra', async () => {
      const { onChange } = await renderSettings()
      const select = screen.getByRole('combobox', { name: 'Zona horaria' })

      expect(select).toHaveValue('Europe/Madrid')
      await userEvent.selectOptions(select, 'Atlantic/Canary')

      expect(onChange).toHaveBeenCalledWith({ timezone: 'Atlantic/Canary' })
    })

    it('si la detectada es distinta, la ofrece con «Usar esta» y nunca la cambia sola', async () => {
      detectTimezoneMock.mockReturnValue('Atlantic/Canary')
      const { onChange } = await renderSettings()

      expect(section()).toHaveTextContent('Detectada en este dispositivo: Atlantic/Canary')
      expect(onChange).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: 'Usar esta' }))

      expect(onChange).toHaveBeenCalledWith({ timezone: 'Atlantic/Canary' })
    })

    it('si la detectada es la guardada, no ofrece nada', async () => {
      await renderSettings()

      expect(screen.queryByRole('button', { name: 'Usar esta' })).not.toBeInTheDocument()
    })

    it('si no se puede detectar, no ofrece nada', async () => {
      detectTimezoneMock.mockReturnValue(null)
      await renderSettings()

      expect(screen.queryByRole('button', { name: 'Usar esta' })).not.toBeInTheDocument()
    })

    it('una zona guardada que no está en la lista del navegador sigue apareciendo', async () => {
      await renderSettings({ timezone: 'Etc/GMT+5' })

      expect(screen.getByRole('combobox', { name: 'Zona horaria' })).toHaveValue('Etc/GMT+5')
    })
  })

  describe('inicio de jornada', () => {
    it('el interruptor refleja el perfil y lo cambia', async () => {
      const { onChange } = await renderSettings({ morning_review: true })
      const toggle = screen.getByRole('switch', { name: 'Mostrar el inicio de jornada' })

      expect(toggle).toHaveAttribute('aria-checked', 'true')
      await userEvent.click(toggle)

      expect(onChange).toHaveBeenCalledWith({ morning_review: false })
    })

    it('desactivado se muestra apagado', async () => {
      await renderSettings({ morning_review: false })

      expect(screen.getByRole('switch', { name: 'Mostrar el inicio de jornada' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
    })
  })

  it('aclara que restablecer los valores por defecto no cambia esta sección', async () => {
    await renderSettings()

    expect(section()).toHaveTextContent('«Restablecer valores por defecto» no cambia esta sección.')
  })
})

describe('useTimezoneSync', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status })
  }

  function wrapper(
    queryClient: QueryClient,
  ): ({ children }: { children: ReactNode }) => JSX.Element {
    return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
  }

  function patchBodies(): unknown[] {
    return vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body)))
  }

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
    detectTimezoneMock.mockReset()
    detectTimezoneMock.mockReturnValue('Atlantic/Canary')
  })

  it('la primera vez que el perfil no tiene zona, envía la detectada una sola vez', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['profile'], { ...PROFILE, timezone: null })
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ ...PROFILE, timezone: 'Atlantic/Canary' })),
    )
    const { useTimezoneSync } = await import('../../../../src/features/profile/useTimezoneSync')

    const { rerender } = renderHook(() => useTimezoneSync(), { wrapper: wrapper(queryClient) })
    rerender()

    await waitFor(() => expect(patchBodies()).toEqual([{ timezone: 'Atlantic/Canary' }]))
  })

  it('con una zona ya guardada no envía nada, aunque la detectada sea otra', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['profile'], PROFILE)
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROFILE)))
    const { useTimezoneSync } = await import('../../../../src/features/profile/useTimezoneSync')

    renderHook(() => useTimezoneSync(), { wrapper: wrapper(queryClient) })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(patchBodies()).toEqual([])
  })

  it('si no se puede detectar la zona, no envía nada', async () => {
    detectTimezoneMock.mockReturnValue(null)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['profile'], { ...PROFILE, timezone: null })
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROFILE)))
    const { useTimezoneSync } = await import('../../../../src/features/profile/useTimezoneSync')

    renderHook(() => useTimezoneSync(), { wrapper: wrapper(queryClient) })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(patchBodies()).toEqual([])
  })
})
