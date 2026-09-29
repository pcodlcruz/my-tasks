import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../../src/stores/toastStore'

vi.mock('../../../src/lib/firebase', () => ({
  auth: { currentUser: null, signOut: vi.fn() },
}))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn(),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function createWrapper(
  queryClient: QueryClient,
): ({ children }: { children: ReactNode }) => JSX.Element {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const TASK = {
  id: 't1',
  title: 'Tarea',
  description: 'Detalle',
  urgent: true,
  important: true,
  quadrant: 'do_now',
  scope: 'work',
  pinned: false,
  status: 'completed',
  in_trash: false,
  created_at: '2026-09-29T10:00:00Z',
  updated_at: '2026-09-29T10:00:00Z',
  completed_at: '2026-09-29T10:00:00Z',
  trashed_at: null,
  purge_at: null,
}

describe('task lifecycle hooks', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
    useToastStore.setState({ toasts: [] })
  })

  it('calls the endpoint of each transition and shows a confirmation toast', async () => {
    const queryClient = new QueryClient()
    const { useCompleteTask, useReopenTask } = await import('../../../src/api/tasks')
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(TASK)))

    const complete = renderHook(() => useCompleteTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await complete.result.current.mutateAsync('t1')
    })
    const reopen = renderHook(() => useReopenTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await reopen.result.current.mutateAsync('t1')
    })

    const calls = vi.mocked(fetch).mock.calls.map(([url, init]) => [url, init?.method])
    expect(calls).toEqual([
      ['http://localhost:8000/api/v1/tasks/t1/complete', 'POST'],
      ['http://localhost:8000/api/v1/tasks/t1/reopen', 'POST'],
    ])
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      'Tarea completada',
      'Tarea reabierta',
    ])
  })

  it('offers "Deshacer" after trashing a task and restores it when used', async () => {
    const queryClient = new QueryClient()
    const { useTrashTask } = await import('../../../src/api/tasks')
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(TASK)))

    const { result } = renderHook(() => useTrashTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await result.current.mutateAsync('t1')
    })
    const toast = useToastStore.getState().toasts[0]
    expect(toast?.message).toBe('Tarea movida a la papelera')
    expect(toast?.actionLabel).toBe('Deshacer')
    await act(async () => {
      toast?.onAction?.()
      await Promise.resolve()
    })

    const [url, init] = vi.mocked(fetch).mock.calls[1] ?? []
    expect(url).toBe('http://localhost:8000/api/v1/tasks/t1/restore')
    expect(init?.method).toBe('POST')
  })

  it('shows "La tarea cambió en otra ventana" and refreshes the data on a 409', async () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { useCompleteTask } = await import('../../../src/api/tasks')
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { code: 'invalid_transition', message: 'La tarea no admite esa operación.' },
        409,
      ),
    )

    const { result } = renderHook(() => useCompleteTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await result.current.mutateAsync('t1').catch(() => undefined)
    })

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      'La tarea cambió en otra ventana',
    ])
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks'] })
  })

  it('shows the same notice when the task no longer exists (404)', async () => {
    const queryClient = new QueryClient()
    const { useRestoreTask } = await import('../../../src/api/tasks')
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ code: 'not_found', message: 'La tarea no existe.' }, 404),
    )

    const { result } = renderHook(() => useRestoreTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await result.current.mutateAsync('t1').catch(() => undefined)
    })

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      'La tarea cambió en otra ventana',
    ])
  })

  it('shows the server message when the active task limit is reached', async () => {
    const queryClient = new QueryClient()
    const { useCreateTask } = await import('../../../src/api/tasks')
    const message = 'Has alcanzado el límite de 500 tareas activas.'
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ code: 'task_limit_reached', message }, 409),
    )

    const { result } = renderHook(() => useCreateTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await result.current
        .mutateAsync({
          title: 'Una más',
          description: 'Detalle',
          urgent: true,
          important: true,
          scope: 'work',
        })
        .catch(() => undefined)
    })

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([message])
  })

  it('shows the server message when the session verifier is unavailable', async () => {
    const queryClient = new QueryClient()
    const { useCompleteTask } = await import('../../../src/api/tasks')
    const message = 'No se pudo verificar la sesión. Inténtalo de nuevo en unos segundos.'
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 'auth_unavailable', message }, 503))

    const { result } = renderHook(() => useCompleteTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await result.current.mutateAsync('t1').catch(() => undefined)
    })

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([message])
  })

  it('shows a generic message for any other failure', async () => {
    const queryClient = new QueryClient()
    const { useCompleteTask } = await import('../../../src/api/tasks')
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ code: 'error', message: 'Internal Server Error' }, 500),
    )

    const { result } = renderHook(() => useCompleteTask(), { wrapper: createWrapper(queryClient) })
    await act(async () => {
      await result.current.mutateAsync('t1').catch(() => undefined)
    })

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      'No se pudo completar la acción. Inténtalo de nuevo.',
    ])
  })
})
