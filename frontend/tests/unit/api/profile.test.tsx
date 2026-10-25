import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../../src/api/types'

const authMock = vi.hoisted(() => ({ currentUser: null as object | null, signOut: vi.fn() }))

vi.mock('../../../src/lib/firebase', () => ({ auth: authMock }))

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

  describe('avatar', () => {
    const UPLOADED: Profile = { ...PROFILE, avatar: { kind: 'upload', preset: null, version: 3 } }
    let counter: number

    beforeEach(() => {
      counter = 0
      authMock.currentUser = {}
      // jsdom has no object URLs: only these two methods are added, `URL` itself stays.
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:avatar-${++counter}`),
        revokeObjectURL: vi.fn(),
      })
    })

    afterEach(() => {
      authMock.currentUser = null
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    })

    function imageResponse(): Response {
      return new Response(new Blob(['webp'], { type: 'image/webp' }), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      })
    }

    it('uploadAvatar envía el cuerpo binario con el tipo de la imagen y sin forzar JSON', async () => {
      const { uploadAvatar } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(UPLOADED)))
      const picture = new Blob(['png-bytes'], { type: 'image/png' })

      const profile = await uploadAvatar(picture)

      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
      expect(url).toBe('http://localhost:8000/api/v1/me/avatar')
      expect(init?.method).toBe('PUT')
      expect(init?.body).toBe(picture)
      const headers = new Headers(init?.headers)
      expect(headers.get('Content-Type')).toBe('image/png')
      expect(headers.get('Authorization')).toBe('Bearer test-token')
      expect(profile).toEqual(UPLOADED)
    })

    it('useUploadAvatar guarda el perfil devuelto en la caché', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], PROFILE)
      const { useUploadAvatar } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(UPLOADED)))

      const { result } = renderHook(() => useUploadAvatar(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync(new Blob(['x'], { type: 'image/png' }))
      })

      expect(queryClient.getQueryData(['profile'])).toEqual(UPLOADED)
    })

    it('useUploadAvatar no toca el perfil guardado si la subida falla', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], UPLOADED)
      const { useUploadAvatar } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 'avatar_unsupported', message: 'x' }, 415)),
      )

      const { result } = renderHook(() => useUploadAvatar(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync(new Blob(['x'])).catch(() => undefined)
      })

      expect(queryClient.getQueryData(['profile'])).toEqual(UPLOADED)
      await waitFor(() => expect(result.current.isError).toBe(true))
    })

    it('removeAvatar llama a DELETE y useRemoveAvatar guarda el perfil devuelto', async () => {
      const queryClient = newQueryClient()
      queryClient.setQueryData(['profile'], UPLOADED)
      const { useRemoveAvatar } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(PROFILE)))

      const { result } = renderHook(() => useRemoveAvatar(), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => {
        await result.current.mutateAsync()
      })

      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
      expect(url).toBe('http://localhost:8000/api/v1/me/avatar')
      expect(init?.method).toBe('DELETE')
      expect(queryClient.getQueryData(['profile'])).toEqual(PROFILE)
    })

    it('useAvatarUrl descarga la imagen con el token y la versión, y devuelve un blob: URL', async () => {
      const queryClient = newQueryClient()
      const { useAvatarUrl } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(imageResponse()))

      const { result } = renderHook(() => useAvatarUrl(UPLOADED.avatar), {
        wrapper: createWrapper(queryClient),
      })

      await waitFor(() => expect(result.current).toBe('blob:avatar-1'))
      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
      expect(url).toBe('http://localhost:8000/api/v1/me/avatar?v=3')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token')
      expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledTimes(1)
    })

    it('useAvatarUrl no descarga nada si el avatar no es una imagen subida', async () => {
      const queryClient = newQueryClient()
      const { useAvatarUrl } = await import('../../../src/api/profile')

      const initials = renderHook(() => useAvatarUrl(PROFILE.avatar), {
        wrapper: createWrapper(queryClient),
      })
      const missing = renderHook(() => useAvatarUrl(undefined), {
        wrapper: createWrapper(queryClient),
      })
      const preset = renderHook(
        () => useAvatarUrl({ kind: 'preset', preset: 'avatar-02', version: 1 }),
        { wrapper: createWrapper(queryClient) },
      )

      expect(initials.result.current).toBeUndefined()
      expect(missing.result.current).toBeUndefined()
      expect(preset.result.current).toBeUndefined()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('useAvatarUrl pide la imagen nueva y revoca la anterior al cambiar la versión', async () => {
      const queryClient = newQueryClient()
      const { useAvatarUrl } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(imageResponse()))
      const { result, rerender } = renderHook(
        ({ version }) => useAvatarUrl({ kind: 'upload', preset: null, version }),
        { wrapper: createWrapper(queryClient), initialProps: { version: 3 } },
      )
      await waitFor(() => expect(result.current).toBe('blob:avatar-1'))

      rerender({ version: 4 })

      await waitFor(() => expect(result.current).toBe('blob:avatar-2'))
      expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url).split('?')[1])).toEqual([
        'v=3',
        'v=4',
      ])
      await waitFor(() =>
        expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith('blob:avatar-1'),
      )
      expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalledWith('blob:avatar-2')
    })

    it('useAvatarUrl revoca el blob: URL al desmontarse', async () => {
      const queryClient = newQueryClient()
      const { useAvatarUrl } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(imageResponse()))
      const { result, unmount } = renderHook(() => useAvatarUrl(UPLOADED.avatar), {
        wrapper: createWrapper(queryClient),
      })
      await waitFor(() => expect(result.current).toBe('blob:avatar-1'))

      unmount()

      await waitFor(() =>
        expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith('blob:avatar-1'),
      )
    })

    it('dos componentes con la misma versión comparten una sola descarga', async () => {
      const queryClient = newQueryClient()
      const { useAvatarUrl } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() => Promise.resolve(imageResponse()))

      const first = renderHook(() => useAvatarUrl(UPLOADED.avatar), {
        wrapper: createWrapper(queryClient),
      })
      const second = renderHook(() => useAvatarUrl(UPLOADED.avatar), {
        wrapper: createWrapper(queryClient),
      })

      await waitFor(() => expect(first.result.current).toBe('blob:avatar-1'))
      await waitFor(() => expect(second.result.current).toBe('blob:avatar-1'))
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('useAvatarUrl devuelve undefined si la descarga falla (se muestran las iniciales)', async () => {
      const queryClient = newQueryClient()
      const { useAvatarUrl } = await import('../../../src/api/profile')
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 'avatar_not_found', message: 'x' }, 404)),
      )

      const { result } = renderHook(() => useAvatarUrl(UPLOADED.avatar), {
        wrapper: createWrapper(queryClient),
      })

      await waitFor(() => expect(fetch).toHaveBeenCalled())
      expect(result.current).toBeUndefined()
    })
  })

  describe('avatarErrorMessage', () => {
    it.each([
      ['avatar_too_large', 'La imagen supera los 2 MB.'],
      ['avatar_unsupported', 'La imagen no es válida. Usa un archivo JPEG, PNG o WebP.'],
      ['avatar_rate_limited', 'Has subido demasiadas imágenes. Espera unos minutos.'],
    ])('el código %s da un mensaje propio', async (code, message) => {
      const { avatarErrorMessage } = await import('../../../src/api/profile')
      const { ApiClientError } = await import('../../../src/lib/apiClient')

      expect(avatarErrorMessage(new ApiClientError({ code, message: 'texto del servidor' }))).toBe(
        message,
      )
    })

    it('cualquier otro fallo (red, 500) da un mensaje genérico y nunca el texto del servidor', async () => {
      const { avatarErrorMessage } = await import('../../../src/api/profile')
      const { ApiClientError } = await import('../../../src/lib/apiClient')

      const generic = 'No se pudo subir la imagen. Inténtalo de nuevo.'
      expect(avatarErrorMessage(new TypeError('Failed to fetch'))).toBe(generic)
      expect(avatarErrorMessage(new ApiClientError({ code: 'error', message: 'SECRETO' }))).toBe(
        generic,
      )
    })
  })
})
