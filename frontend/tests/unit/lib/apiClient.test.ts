import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn()
const authState: { currentUser: { uid: string } | null } = { currentUser: { uid: 'user-1' } }

vi.mock('../../../src/lib/firebase', () => ({
  auth: {
    get currentUser() {
      return authState.currentUser
    },
    signOut,
  },
}))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('fake-id-token'),
}))

const originalLocation = window.location

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    authState.currentUser = { uid: 'user-1' }
    signOut.mockClear()
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: vi.fn() },
    })
  })

  it('adds the Authorization header with the current user id token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    const { apiFetch } = await import('../../../src/lib/apiClient')
    await apiFetch('/api/v1/tasks/1')

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? []
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer fake-id-token')
  })

  it('throws an ApiClientError built from the response body on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'not_found', message: 'La tarea no existe.' }), {
        status: 404,
      }),
    )

    const { apiFetch, ApiClientError } = await import('../../../src/lib/apiClient')

    await expect(apiFetch('/api/v1/tasks/missing')).rejects.toMatchObject(
      new ApiClientError({ code: 'not_found', message: 'La tarea no existe.' }),
    )
  })

  it('signs out and redirects to /login?reason=expired on a 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'unauthenticated', message: 'No autenticado' }), {
        status: 401,
      }),
    )

    const { apiFetch } = await import('../../../src/lib/apiClient')

    await expect(apiFetch('/api/v1/tasks/1')).rejects.toThrow()
    expect(signOut).toHaveBeenCalledOnce()
    expect(window.location.assign).toHaveBeenCalledWith('/login?reason=expired')
  })
})
