import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '../../../src/stores/uiStore'

const useSessionMock = vi.fn()

vi.mock('../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))

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
    useUiStore.getState().reset()
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

  it('reinicia el estado de la interfaz al cambiar de persona, para que la nueva use su ámbito por defecto', async () => {
    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    const { rerender } = await renderReset(client)
    useUiStore.getState().initializeScope('work')
    expect(useUiStore.getState().scopeFilter).toBe('work')

    useSessionMock.mockReturnValue({ user: { uid: 'user-2' }, loading: false })
    rerender()

    expect(useUiStore.getState().scopeFilter).toBe('all')
    expect(useUiStore.getState().scopeInitialized).toBe(false)
  })

  it('no reinicia el estado de la interfaz si el usuario sigue siendo el mismo', async () => {
    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    const { rerender } = await renderReset(client)
    useUiStore.getState().initializeScope('work')

    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    rerender()

    expect(useUiStore.getState().scopeFilter).toBe('work')
  })

  describe('imagen del avatar', () => {
    beforeEach(() => {
      Object.assign(URL, { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
    })

    afterEach(() => {
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    })

    it('revoca los blob: URL del avatar al cambiar de persona', async () => {
      useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
      const { rerender } = await renderReset(client)
      client.setQueryData(['avatar', 3], 'blob:avatar-de-user-1')

      useSessionMock.mockReturnValue({ user: { uid: 'user-2' }, loading: false })
      rerender()

      expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledExactlyOnceWith(
        'blob:avatar-de-user-1',
      )
      expect(client.getQueryData(['avatar', 3])).toBeUndefined()
    })

    it('revoca los blob: URL del avatar al cerrar sesión', async () => {
      useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
      const { rerender } = await renderReset(client)
      client.setQueryData(['avatar', 1], 'blob:uno')
      client.setQueryData(['avatar', 2], 'blob:dos')

      useSessionMock.mockReturnValue({ user: null, loading: false })
      rerender()

      expect(
        vi
          .mocked(URL.revokeObjectURL)
          .mock.calls.map(([url]) => url)
          .sort(),
      ).toEqual(['blob:dos', 'blob:uno'])
    })

    it('no revoca nada mientras la persona sigue siendo la misma', async () => {
      useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
      const { rerender } = await renderReset(client)
      client.setQueryData(['avatar', 3], 'blob:avatar')

      useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
      rerender()

      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    })

    it('no toca los datos de otras consultas que no son del avatar', async () => {
      useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
      const { rerender } = await renderReset(client)
      client.setQueryData(['tasks', 'board'], { items: [] })

      useSessionMock.mockReturnValue({ user: { uid: 'user-2' }, loading: false })
      rerender()

      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    })
  })
})
