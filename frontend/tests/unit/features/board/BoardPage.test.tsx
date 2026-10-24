import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../../../src/api/types'
import { useUiStore } from '../../../../src/stores/uiStore'

const useBoardTasksMock = vi.fn()
const useProfileMock = vi.fn()

vi.mock('../../../../src/api/tasks', () => ({
  useBoardTasks: (...args: unknown[]) => useBoardTasksMock(...args),
}))

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

function boardResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: { items: [], next_cursor: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

function profileResult(profile: Partial<Profile> = {}): Record<string, unknown> {
  return { data: { ...PROFILE, ...profile }, isPending: false, isError: false }
}

const PROFILE_PENDING = { data: undefined, isPending: true, isError: false }
const PROFILE_FAILED = { data: undefined, isPending: false, isError: true }

async function renderBoardPage(): Promise<ReturnType<typeof render>> {
  const { BoardPage } = await import('../../../../src/features/board/BoardPage')
  return render(<BoardPage />)
}

// The arguments of the last call to `useBoardTasks(scope, order, enabled)`.
function lastBoardRequest(): { scope: unknown; order: unknown; enabled: unknown } {
  const [scope, order, enabled] = useBoardTasksMock.mock.lastCall ?? []
  return { scope, order, enabled }
}

describe('<BoardPage>', () => {
  beforeEach(() => {
    useBoardTasksMock.mockReset()
    useProfileMock.mockReset()
    useBoardTasksMock.mockReturnValue(boardResult())
    useProfileMock.mockReturnValue(profileResult())
    useUiStore.getState().reset()
  })

  it('muestra siempre los 4 cuadrantes y el estado vacío de cada uno sin tareas', async () => {
    await renderBoardPage()

    for (const label of ['Hacer ahora', 'Planificar', 'Delegar', 'Eliminar']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    }
    expect(screen.getAllByText('No hay tareas en este cuadrante.')).toHaveLength(4)
  })

  it('muestra un mensaje de bienvenida cuando no hay ninguna tarea', async () => {
    await renderBoardPage()

    expect(screen.getByText(/crea tu primera tarea/i)).toBeInTheDocument()
  })

  it('muestra un esqueleto de carga mientras se obtienen las tareas', async () => {
    useBoardTasksMock.mockReturnValue(boardResult({ data: undefined, isLoading: true }))

    await renderBoardPage()

    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
  })

  it('muestra un error con "Reintentar" si falla la carga', async () => {
    const refetch = vi.fn()
    useBoardTasksMock.mockReturnValue(boardResult({ data: undefined, isError: true, refetch }))

    await renderBoardPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i)
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(refetch).toHaveBeenCalledOnce()
  })

  describe('perfil', () => {
    it('no pide las tareas hasta que el perfil se resuelve y mientras tanto muestra el esqueleto', async () => {
      useProfileMock.mockReturnValue(PROFILE_PENDING)
      useBoardTasksMock.mockReturnValue(boardResult({ data: undefined }))

      await renderBoardPage()

      expect(lastBoardRequest().enabled).toBe(false)
      expect(useBoardTasksMock.mock.calls.every(([, , enabled]) => enabled === false)).toBe(true)
      expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
      expect(screen.queryByText(/crea tu primera tarea/i)).not.toBeInTheDocument()
    })

    it('al llegar el perfil, pide las tareas con su ámbito ya fijado y sin una petición de más', async () => {
      useProfileMock.mockReturnValue(PROFILE_PENDING)
      const { rerender } = await renderBoardPage()
      const { BoardPage } = await import('../../../../src/features/board/BoardPage')

      useProfileMock.mockReturnValue(profileResult({ default_scope: 'work' }))
      rerender(<BoardPage />)

      expect(lastBoardRequest()).toEqual({ scope: 'work', order: 'oldest', enabled: true })
      expect(
        useBoardTasksMock.mock.calls
          .filter(([, , enabled]) => enabled === true)
          .map(([scope]) => scope),
      ).toEqual(['work'])
      expect(screen.getByRole('radio', { name: 'Laboral' })).toBeChecked()
    })

    it('con el ámbito por defecto "Todas" pide el tablero sin filtrar', async () => {
      await renderBoardPage()

      expect(lastBoardRequest()).toEqual({ scope: undefined, order: 'oldest', enabled: true })
      expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked()
    })

    it('fija el ámbito una sola vez: una recarga del perfil no lo cambia', async () => {
      useProfileMock.mockReturnValue(profileResult({ default_scope: 'work' }))
      const { rerender } = await renderBoardPage()
      const { BoardPage } = await import('../../../../src/features/board/BoardPage')

      useProfileMock.mockReturnValue(profileResult({ default_scope: 'personal' }))
      rerender(<BoardPage />)

      expect(lastBoardRequest().scope).toBe('work')
      expect(screen.getByRole('radio', { name: 'Laboral' })).toBeChecked()
    })

    it('un cambio manual del filtro vale para la visita y no guarda nada en el perfil', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      useProfileMock.mockReturnValue(profileResult({ default_scope: 'work' }))
      await renderBoardPage()

      await userEvent.click(screen.getByRole('radio', { name: 'Personal' }))

      expect(lastBoardRequest().scope).toBe('personal')
      expect(fetchMock).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })

    it('el cambio manual del filtro sobrevive a una recarga del perfil', async () => {
      useProfileMock.mockReturnValue(profileResult({ default_scope: 'work' }))
      const { rerender } = await renderBoardPage()
      const { BoardPage } = await import('../../../../src/features/board/BoardPage')
      await userEvent.click(screen.getByRole('radio', { name: 'Personal' }))

      useProfileMock.mockReturnValue(profileResult({ default_scope: 'work', theme: 'dark' }))
      rerender(<BoardPage />)

      expect(lastBoardRequest().scope).toBe('personal')
    })

    it('si el perfil falla (tras su único reintento) usa "Todas" y no deja el tablero esperando', async () => {
      useProfileMock.mockReturnValue(PROFILE_FAILED)

      await renderBoardPage()

      expect(lastBoardRequest()).toEqual({ scope: undefined, order: 'oldest', enabled: true })
      expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked()
      expect(screen.queryByRole('status', { name: /cargando/i })).not.toBeInTheDocument()
    })

    it('pasa el orden del perfil a la petición', async () => {
      useProfileMock.mockReturnValue(profileResult({ board_order: 'newest' }))

      await renderBoardPage()

      expect(lastBoardRequest().order).toBe('newest')
    })

    it('un tablero por defecto sin tareas en ese ámbito muestra el estado vacío habitual', async () => {
      useProfileMock.mockReturnValue(profileResult({ default_scope: 'personal' }))

      await renderBoardPage()

      expect(screen.getAllByText('No hay tareas en este cuadrante.')).toHaveLength(4)
      expect(screen.queryByText(/crea tu primera tarea/i)).not.toBeInTheDocument()
    })
  })
})
