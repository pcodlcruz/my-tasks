import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessList } from '../../../src/api/types'

vi.mock('../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))
vi.mock('firebase/auth', () => ({ getIdToken: vi.fn() }))

const EMPTY: AccessList = { invitations: [], accounts: [] }
const WITH_INVITATION: AccessList = {
  invitations: [
    {
      email: 'ana@example.com',
      status: 'pending',
      created_at: '2026-10-24T10:00:00Z',
      accepted_at: null,
    },
  ],
  accounts: [],
}

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

describe('lista de accesos tras un cambio', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('si la primera carga aún no ha terminado, la respuesta desfasada se descarta y se vuelve a pedir', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const lists: Array<(response: Response) => void> = []
    vi.mocked(fetch).mockImplementation((_url, init) => {
      if (init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ outcome: 'invited', email: 'ana@example.com' }, 201))
      }
      return new Promise<Response>((resolve) => lists.push(resolve))
    })
    const { useAccessList, useInviteUser } = await import('../../../src/api/access')
    const list = renderHook(() => useAccessList(), { wrapper: createWrapper(queryClient) })
    const invite = renderHook(() => useInviteUser(), { wrapper: createWrapper(queryClient) })
    await waitFor(() => expect(lists).toHaveLength(1)) // the first load is on its way

    // The person invites before that load has come back (a slow connection or a busy server).
    await act(async () => {
      await invite.result.current.mutateAsync('ana@example.com')
    })
    // The first request answers now, with a list from before the invitation existed.
    await act(async () => {
      lists[0]?.(jsonResponse(EMPTY))
    })

    // The change must trigger a fresh request, whose answer is the one that counts.
    await waitFor(() => expect(lists.length).toBeGreaterThanOrEqual(2))
    await act(async () => {
      lists[lists.length - 1]?.(jsonResponse(WITH_INVITATION))
    })
    await waitFor(() => expect(list.result.current.data).toEqual(WITH_INVITATION))
  })

  it('con la lista ya cargada, un cambio la refresca como siempre', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let current: AccessList = EMPTY
    vi.mocked(fetch).mockImplementation((_url, init) => {
      if (init?.method === 'POST') {
        current = WITH_INVITATION
        return Promise.resolve(jsonResponse({ outcome: 'invited', email: 'ana@example.com' }, 201))
      }
      return Promise.resolve(jsonResponse(current))
    })
    const { useAccessList, useInviteUser } = await import('../../../src/api/access')
    const list = renderHook(() => useAccessList(), { wrapper: createWrapper(queryClient) })
    const invite = renderHook(() => useInviteUser(), { wrapper: createWrapper(queryClient) })
    await waitFor(() => expect(list.result.current.data).toEqual(EMPTY))

    await act(async () => {
      await invite.result.current.mutateAsync('ana@example.com')
    })

    await waitFor(() => expect(list.result.current.data).toEqual(WITH_INVITATION))
  })
})
