import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSessionMock = vi.fn()

vi.mock('../../../src/features/auth/useSession', () => ({
  useSession: () => useSessionMock(),
}))

async function renderReset(client: QueryClient): Promise<{ rerender: () => void }> {
  const { SessionCacheReset } = await import('../../../src/app/SessionCacheReset')
  // A new element each time, so React re-renders and the session mock is read again.
  const tree = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionCacheReset />
    </QueryClientProvider>
  )
  const view = render(tree())
  return { rerender: () => view.rerender(tree()) }
}

describe('<SessionCacheReset>', () => {
  let client: QueryClient
  let clear: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    useSessionMock.mockReset()
    client = new QueryClient()
    clear = vi.spyOn(client, 'clear')
  })

  it('no vacía la caché mientras se comprueba la sesión ni en la primera carga', async () => {
    useSessionMock.mockReturnValue({ user: null, loading: true })
    const { rerender } = await renderReset(client)

    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    rerender()

    expect(clear).not.toHaveBeenCalled()
  })

  it('vacía la caché al cerrar sesión', async () => {
    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    const { rerender } = await renderReset(client)

    useSessionMock.mockReturnValue({ user: null, loading: false })
    rerender()

    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('vacía la caché cuando entra otra persona sin pasar por el cierre de sesión', async () => {
    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    const { rerender } = await renderReset(client)

    useSessionMock.mockReturnValue({ user: { uid: 'user-2' }, loading: false })
    rerender()

    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('no vacía la caché si el usuario sigue siendo el mismo', async () => {
    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    const { rerender } = await renderReset(client)

    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    rerender()

    expect(clear).not.toHaveBeenCalled()
  })
})
