import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schedule, ScheduleCreate } from '../../../src/api/types'
import { useToastStore } from '../../../src/stores/toastStore'

vi.mock('../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}))

const SCHEDULE: Schedule = {
  id: 's1',
  title: 'Regar',
  description: 'Balcón',
  urgent: false,
  important: true,
  quadrant: 'schedule',
  scope: 'personal',
  recurrence: { kind: 'weekly', weekdays: [1, 3] },
  status: 'active',
  next_occurrence: '2026-11-04',
  last_generated_for: null,
  created_at: '2026-11-03T09:00:00Z',
}

const CREATE: ScheduleCreate = {
  title: 'Regar',
  description: 'Balcón',
  urgent: false,
  important: true,
  scope: 'personal',
  recurrence: { kind: 'weekly', weekdays: [1, 3] },
}

const URL = 'http://localhost:8000/api/v1/schedules'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function setup(): {
  queryClient: QueryClient
  wrapper: ({ children }: { children: ReactNode }) => JSX.Element
} {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  queryClient.setQueryData(['schedules'], { items: [SCHEDULE] })
  queryClient.setQueryData(['progress'], { today: '2026-11-03' })
  queryClient.setQueryData(['tasks', 'board', 'all', 'oldest'], { items: [], next_cursor: null })
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: ReactNode }): JSX.Element {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    },
  }
}

describe('schedule hooks', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
    useToastStore.setState({ toasts: [] })
  })

  it('useSchedules pide la lista y guarda los elementos', async () => {
    const queryClient = new QueryClient()
    const { useSchedules } = await import('../../../src/api/schedules')
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ items: [SCHEDULE] })))

    const { result } = renderHook(() => useSchedules(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })

    await waitFor(() => expect(result.current.data).toEqual([SCHEDULE]))
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(URL)
  })

  it.each([
    ['useCreateSchedule', CREATE, 'POST', URL],
    ['useUpdateSchedule', { id: 's1', data: { title: 'Otro' } }, 'PATCH', `${URL}/s1`],
    ['usePauseSchedule', 's1', 'POST', `${URL}/s1/pause`],
    ['useResumeSchedule', 's1', 'POST', `${URL}/s1/resume`],
    ['useDeleteSchedule', 's1', 'DELETE', `${URL}/s1`],
  ] as const)(
    '%s hace %s a %s e invalida las programaciones, el progreso y las tareas',
    async (hook, variables, method, url) => {
      const { queryClient, wrapper } = setup()
      const schedules = await import('../../../src/api/schedules')
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(
          method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse(SCHEDULE),
        ),
      )

      // In the app the progress is always observed (the celebrations are mounted on every
      // protected screen), which is what makes invalidating it ask the server again.
      const progress = await import('../../../src/api/progress')
      renderHook(() => progress.useProgress(), { wrapper })

      const { result } = renderHook(() => schedules[hook](), { wrapper })
      await act(async () => {
        await (result.current.mutateAsync as (value: unknown) => Promise<unknown>)(variables)
      })

      const change = vi
        .mocked(fetch)
        .mock.calls.find(([target, init]) => String(target) === url && init?.method === method)
      expect(change).toBeDefined()
      // The progress catch-up is what generates today's task, so it is asked for again, and then
      // the board (which would otherwise show the old tasks).
      await waitFor(() => {
        expect(queryClient.getQueryState(['schedules'])?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(['tasks', 'board', 'all', 'oldest'])?.isInvalidated).toBe(
          true,
        )
      })
      const progressReads = vi
        .mocked(fetch)
        .mock.calls.filter(
          ([target]) => String(target) === 'http://localhost:8000/api/v1/me/progress',
        )
      expect(progressReads.length).toBeGreaterThanOrEqual(2)
    },
  )

  it('crear envía el cuerpo tal cual', async () => {
    const { wrapper } = setup()
    const { useCreateSchedule } = await import('../../../src/api/schedules')
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(SCHEDULE, 201)))

    const { result } = renderHook(() => useCreateSchedule(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(CREATE)
    })

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual(CREATE)
  })

  it('un error del servidor avisa con un mensaje propio y vuelve a pedir la lista', async () => {
    const { queryClient, wrapper } = setup()
    const { usePauseSchedule } = await import('../../../src/api/schedules')
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ code: 'schedule_finished', message: 'Ya ha terminado.' }, 409),
      ),
    )

    const { result } = renderHook(() => usePauseSchedule(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('s1').catch(() => undefined)
    })

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      'Ya ha terminado.',
    ])
    expect(queryClient.getQueryState(['schedules'])?.isInvalidated).toBe(true)
  })

  it('el límite de 50 se explica con el texto del servidor', async () => {
    const { wrapper } = setup()
    const { useCreateSchedule } = await import('../../../src/api/schedules')
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ code: 'schedule_limit', message: 'Has alcanzado el límite de 50.' }, 409),
      ),
    )

    const { result } = renderHook(() => useCreateSchedule(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(CREATE).catch(() => undefined)
    })

    expect(useToastStore.getState().toasts[0]?.message).toBe('Has alcanzado el límite de 50.')
  })

  it('cualquier otro fallo da un mensaje genérico y nunca el texto del servidor', async () => {
    const { wrapper } = setup()
    const { useCreateSchedule } = await import('../../../src/api/schedules')
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ code: 'error', message: 'SECRETO' }, 500)),
    )

    const { result } = renderHook(() => useCreateSchedule(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(CREATE).catch(() => undefined)
    })

    expect(useToastStore.getState().toasts[0]?.message).toBe(
      'No se pudo completar la acción. Inténtalo de nuevo.',
    )
  })
})
