import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMe = vi.fn()

vi.mock('../../../../src/api/access', () => ({ getMe: () => getMe() }))
vi.mock('../../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))
vi.mock('firebase/auth', () => ({ getIdToken: vi.fn() }))

const ACCOUNT = { uid: 'uid-1', email: 'ana@example.com', role: 'user' as const }

function createWrapper(): ({ children }: { children: ReactNode }) => JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

async function renderUseAccount(uid: string | undefined) {
  const { useAccount } = await import('../../../../src/features/auth/useAccount')
  return renderHook(() => useAccount(uid), { wrapper: createWrapper() })
}

async function accessDenied(): Promise<Error> {
  const { ApiClientError } = await import('../../../../src/lib/apiClient')
  return new ApiClientError({ code: 'access_denied', message: 'No tienes acceso.' })
}

describe('useAccount', () => {
  beforeEach(() => {
    getMe.mockReset()
  })

  it('devuelve la cuenta activa cuando /me responde 200', async () => {
    getMe.mockResolvedValue(ACCOUNT)

    const { result } = await renderUseAccount('uid-1')

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toEqual({ status: 'active', account: ACCOUNT }))
  })

  it('devuelve "denied" sin reintentar cuando /me responde access_denied', async () => {
    getMe.mockRejectedValue(await accessDenied())

    const { result } = await renderUseAccount('uid-1')

    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(getMe).toHaveBeenCalledTimes(1)
  })

  it('devuelve "error" tras reintentar una vez cualquier otro fallo, y permite reintentar', async () => {
    getMe.mockRejectedValue(new Error('network down'))

    const { result } = await renderUseAccount('uid-1')

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(getMe).toHaveBeenCalledTimes(2)

    getMe.mockResolvedValue(ACCOUNT)
    await act(async () => {
      if (result.current.status === 'error') result.current.retry()
    })
    await waitFor(() => expect(result.current.status).toBe('active'))
  })

  it('no consulta /me mientras no hay usuario', async () => {
    const { result } = await renderUseAccount(undefined)

    expect(result.current.status).toBe('loading')
    expect(getMe).not.toHaveBeenCalled()
  })
})
