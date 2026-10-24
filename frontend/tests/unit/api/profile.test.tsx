import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../../src/api/types'

vi.mock('../../../src/lib/firebase', () => ({
  auth: { currentUser: null, signOut: vi.fn() },
}))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn(),
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

const PROFILE_URL = 'http://localhost:8000/api/v1/me/profile'

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

describe('profile hooks', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
  })

  describe('useProfile', () => {
    it('pide el perfil una vez y lo guarda con la clave ["profile"]', async () => {
      const queryClient = newQueryClient()
      const { useProfile } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROFILE)))

      const { result } = renderHook(() => useProfile(), { wrapper: createWrapper(queryClient) })

      await waitFor(() => expect(result.current.data).toEqual(PROFILE))
      expect(vi.mocked(fetch).mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
        [PROFILE_URL, undefined],
      ])
      expect(queryClient.getQueryData(['profile'])).toEqual(PROFILE)
    })

    it('reintenta una sola vez ante un fallo y luego da error', async () => {
      const queryClient = newQueryClient()
      const { useProfile } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({}, 500)))

      const { result } = renderHook(() => useProfile(), { wrapper: createWrapper(queryClient) })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('recarga el perfil al volver a la pestaña', async () => {
      const queryClient = newQueryClient()
      const { useProfile } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROFILE)))
      const { result } = renderHook(() => useProfile(), { wrapper: createWrapper(queryClient) })
      await waitFor(() => expect(result.current.data).toEqual(PROFILE))
      expect(fetch).toHaveBeenCalledTimes(1)

      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    })
  })

  describe('useUpdateProfile', () => {
    it('envía solo los campos cambiados con PATCH y guarda la respuesta', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], PROFILE)
      const { useUpdateProfile } = await import('../../../src/api/profile')
      const saved: Profile = { ...PROFILE, theme: 'dark' }
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(saved)))

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync({ theme: 'dark' })
      })

      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
      expect(url).toBe(PROFILE_URL)
      expect(init?.method).toBe('PATCH')
      expect(JSON.parse(String(init?.body))).toEqual({ theme: 'dark' })
      expect(queryClient.getQueryData(['profile'])).toEqual(saved)
    })

    it('actualiza la caché al instante, antes de que responda el servidor', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], PROFILE)
      const { useUpdateProfile } = await import('../../../src/api/profile')
      let respond: (response: Response) => void = () => undefined
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve
          }),
      )

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      })
      act(() => {
        result.current.mutate({ theme: 'dark', density: 'compact' })
      })

      await waitFor(() =>
        expect(queryClient.getQueryData(['profile'])).toEqual({
          ...PROFILE,
          theme: 'dark',
          density: 'compact',
        }),
      )
      await act(async () => {
        respond(jsonResponse({ ...PROFILE, theme: 'dark', density: 'compact' }))
      })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('vuelve atrás al valor guardado si el servidor falla', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], PROFILE)
      const { useUpdateProfile } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({}, 500)))

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync({ theme: 'dark' }).catch(() => undefined)
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(queryClient.getQueryData(['profile'])).toEqual(PROFILE)
    })

    it('no toca la caché de forma optimista con un cambio de avatar', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], PROFILE)
      const { useUpdateProfile } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined))

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(queryClient),
      })
      act(() => {
        result.current.mutate({ avatar: { kind: 'preset', preset: 'avatar-03' } })
      })
      await waitFor(() => expect(result.current.isPending).toBe(true))

      expect(queryClient.getQueryData(['profile'])).toEqual(PROFILE)
    })
  })

  describe('useResetProfile', () => {
    it('llama a DELETE y guarda el perfil devuelto', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], { ...PROFILE, theme: 'dark' })
      const { useResetProfile } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROFILE)))

      const { result } = renderHook(() => useResetProfile(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync()
      })

      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
      expect(url).toBe(PROFILE_URL)
      expect(init?.method).toBe('DELETE')
      expect(queryClient.getQueryData(['profile'])).toEqual(PROFILE)
    })
  })
})
