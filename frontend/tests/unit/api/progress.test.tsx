import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileUpdate, Progress, Task } from '../../../src/api/types'

vi.mock('../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}))

const PROGRESS: Progress = {
  today: '2026-10-31',
  goal: 3,
  completed_count: 1,
  goal_met: false,
  is_active_day: true,
  mission: { task_ids: [], completed_ids: [], cleared: false },
  show_review: false,
  streak: 2,
  streak_at_stake: true,
  arcade: { score: 120, level: 1, level_name: 'Novato', next_level_at: 500, points_today: 120 },
  last_day: null,
  announcements: [],
  notices: [],
}

const TASK: Task = {
  id: 'task-1',
  title: 'Tarea',
  description: 'Detalle',
  urgent: true,
  important: true,
  quadrant: 'do_now',
  scope: 'work',
  pinned: false,
  status: 'completed',
  in_trash: false,
  created_at: '2026-10-31T08:00:00Z',
  updated_at: '2026-10-31T09:00:00Z',
  completed_at: '2026-10-31T09:00:00Z',
  trashed_at: null,
  purge_at: null,
}

const PROGRESS_URL = 'http://localhost:8000/api/v1/me/progress'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
}

function createWrapper(
  queryClient: QueryClient,
): ({ children }: { children: ReactNode }) => JSX.Element {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('progress hooks', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
  })

  describe('useProgress', () => {
    it('pide GET /me/progress y lo guarda con la clave ["progress"]', async () => {
      const queryClient = newQueryClient()
      const { useProgress } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROGRESS)))

      const { result } = renderHook(() => useProgress(), { wrapper: createWrapper(queryClient) })

      await waitFor(() => expect(result.current.data).toEqual(PROGRESS))
      expect(vi.mocked(fetch).mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
        [PROGRESS_URL, undefined],
      ])
      expect(queryClient.getQueryData(['progress'])).toEqual(PROGRESS)
    })

    it('nunca da el marcador por fresco: cada pantalla que lo monta lo vuelve a pedir', async () => {
      const queryClient = newQueryClient()
      const { useProgress } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROGRESS)))
      const first = renderHook(() => useProgress(), { wrapper: createWrapper(queryClient) })
      await waitFor(() => expect(first.result.current.data).toEqual(PROGRESS))
      first.unmount()

      renderHook(() => useProgress(), { wrapper: createWrapper(queryClient) })

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    })

    it('lo vuelve a pedir al volver a la pestaña', async () => {
      const queryClient = newQueryClient()
      const { useProgress } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROGRESS)))
      const { result } = renderHook(() => useProgress(), { wrapper: createWrapper(queryClient) })
      await waitFor(() => expect(result.current.data).toEqual(PROGRESS))
      expect(fetch).toHaveBeenCalledTimes(1)

      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    })

    it('un fallo de red conserva el último marcador y marca el error', async () => {
      const queryClient = newQueryClient()
      const { useProgress } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(jsonResponse(PROGRESS)))
      const { result } = renderHook(() => useProgress(), { wrapper: createWrapper(queryClient) })
      await waitFor(() => expect(result.current.data).toEqual(PROGRESS))
      // Read before the reload: TanStack Query only re-renders for the properties already read.
      expect(result.current.isError).toBe(false)

      vi.mocked(fetch).mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
      await act(async () => {
        await result.current.refetch()
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.data).toEqual(PROGRESS)
    })

    it('reintenta una sola vez si la primera carga falla', async () => {
      const queryClient = newQueryClient()
      const { useProgress } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({}, 500)))

      const { result } = renderHook(() => useProgress(), { wrapper: createWrapper(queryClient) })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('useMarkReviewSeen', () => {
    it('hace POST /me/progress/review y guarda la respuesta en la caché', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['progress'], { ...PROGRESS, show_review: true })
      const { useMarkReviewSeen } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROGRESS)))

      const { result } = renderHook(() => useMarkReviewSeen(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync()
      })

      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
      expect(url).toBe(`${PROGRESS_URL}/review`)
      expect(init?.method).toBe('POST')
      expect(queryClient.getQueryData(['progress'])).toEqual(PROGRESS)
    })
  })

  describe('useSetMission', () => {
    it('hace PUT /me/progress/today/mission con las tareas y guarda la respuesta', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['progress'], PROGRESS)
      const saved: Progress = {
        ...PROGRESS,
        mission: { task_ids: ['a', 'b'], completed_ids: [], cleared: false },
      }
      const { useSetMission } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(saved)))

      const { result } = renderHook(() => useSetMission(), { wrapper: createWrapper(queryClient) })
      await act(async () => {
        await result.current.mutateAsync(['a', 'b'])
      })

      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
      expect(url).toBe(`${PROGRESS_URL}/today/mission`)
      expect(init?.method).toBe('PUT')
      expect(JSON.parse(String(init?.body))).toEqual({ task_ids: ['a', 'b'] })
      expect(queryClient.getQueryData(['progress'])).toEqual(saved)
    })

    it('un 422 deja la misión de la caché como estaba', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['progress'], PROGRESS)
      const { useSetMission } = await import('../../../src/api/progress')
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 'mission_invalid_task', message: 'x' }, 422)),
      )

      const { result } = renderHook(() => useSetMission(), { wrapper: createWrapper(queryClient) })
      await act(async () => {
        await result.current.mutateAsync(['a']).catch(() => undefined)
      })

      expect(queryClient.getQueryData(['progress'])).toEqual(PROGRESS)
    })

    it('el mensaje de error es propio y nunca el texto del servidor', async () => {
      const { missionErrorMessage } = await import('../../../src/api/progress')
      const { ApiClientError } = await import('../../../src/lib/apiClient')

      expect(
        missionErrorMessage(
          new ApiClientError({ code: 'mission_invalid_task', message: 'SECRETO' }),
        ),
      ).toBe('Alguna de esas tareas ya no está activa. Revisa la misión y vuelve a intentarlo.')
      expect(missionErrorMessage(new TypeError('Failed to fetch'))).toBe(
        'No se pudo guardar la misión. Inténtalo de nuevo.',
      )
    })
  })

  describe('invalidación tras cambiar una tarea', () => {
    function seeded(): QueryClient {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['progress'], PROGRESS)
      queryClient.setQueryData(['tasks', 'board', 'all', 'oldest'], {
        items: [],
        next_cursor: null,
      })
      return queryClient
    }

    it.each([
      ['useCompleteTask', 'complete'],
      ['useReopenTask', 'reopen'],
      ['useTrashTask', 'trash'],
      ['useRestoreTask', 'restore'],
    ] as const)('%s invalida el progreso y las tareas', async (hook, action) => {
      const queryClient = seeded()
      const tasks = await import('../../../src/api/tasks')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(TASK)))

      const { result } = renderHook(() => tasks[hook](), { wrapper: createWrapper(queryClient) })
      await act(async () => {
        await result.current.mutateAsync('task-1')
      })

      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
        `http://localhost:8000/api/v1/tasks/task-1/${action}`,
      )
      expect(queryClient.getQueryState(['progress'])?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(['tasks', 'board', 'all', 'oldest'])?.isInvalidated).toBe(
        true,
      )
    })

    it('un cambio que el servidor rechaza no invalida el progreso', async () => {
      const queryClient = seeded()
      const { useCompleteTask } = await import('../../../src/api/tasks')
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 'invalid_transition', message: 'x' }, 409)),
      )

      const { result } = renderHook(() => useCompleteTask(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync('task-1').catch(() => undefined)
      })

      expect(queryClient.getQueryState(['progress'])?.isInvalidated).toBe(false)
    })
  })

  describe('invalidación tras cambiar el perfil', () => {
    const PROGRESS_CHANGES: ProfileUpdate[] = [
      { daily_goal: 5 },
      { active_weekdays: [1, 2, 3] },
      { timezone: 'Atlantic/Canary' },
      { morning_review: false },
    ]

    it.each(PROGRESS_CHANGES)(
      'un cambio de ajustes de progreso (%o) invalida el progreso',
      async (change) => {
        const queryClient = newQueryClient()
        queryClient.setQueryData(['progress'], PROGRESS)
        const { useUpdateProfile } = await import('../../../src/api/profile')
        vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({})))

        const { result } = renderHook(() => useUpdateProfile(), {
          wrapper: createWrapper(queryClient),
        })
        await act(async () => {
          await result.current.mutateAsync(change)
        })

        expect(queryClient.getQueryState(['progress'])?.isInvalidated).toBe(true)
      },
    )

    it('un cambio de tema no toca el progreso', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['progress'], PROGRESS)
      const { useUpdateProfile } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({})))

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync({ theme: 'dark' })
      })

      expect(queryClient.getQueryState(['progress'])?.isInvalidated).toBe(false)
    })
  })
})
