import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSessionMock = vi.fn()
const useAccountMock = vi.fn()

vi.mock('../../../src/features/auth/useSession', () => ({
  useSession: () => useSessionMock(),
}))

vi.mock('../../../src/features/auth/useAccount', () => ({
  useAccount: (uid: string | undefined) => useAccountMock(uid),
}))

function LoginProbe(): JSX.Element {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return <div>Página de login (origen: {from ?? 'ninguno'})</div>
}

async function renderProtected(initialEntry = '/historial'): Promise<void> {
  const { ProtectedRoute } = await import('../../../src/app/ProtectedRoute')
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route
          path="/historial"
          element={
            <ProtectedRoute>
              <div>Contenido protegido</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/perfil"
          element={
            <ProtectedRoute>
              <div>Contenido del perfil</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const SIGNED_IN = { user: { uid: 'user-1', email: 'ana@example.com' }, loading: false }

describe('<ProtectedRoute>', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useAccountMock.mockReset()
    useAccountMock.mockReturnValue({ status: 'loading' })
  })

  it('redirige a /login cuando no hay sesión, conservando la ruta de origen', async () => {
    useSessionMock.mockReturnValue({ user: null, loading: false })

    await renderProtected('/historial')

    expect(screen.getByText('Página de login (origen: /historial)')).toBeInTheDocument()
    expect(useAccountMock).toHaveBeenCalledWith(undefined)
  })

  it('no muestra nada mientras se comprueba la sesión', async () => {
    useSessionMock.mockReturnValue({ user: null, loading: true })

    await renderProtected('/historial')

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.queryByText(/Página de login/)).not.toBeInTheDocument()
  })

  it('no muestra el contenido mientras se comprueba la cuenta', async () => {
    useSessionMock.mockReturnValue(SIGNED_IN)
    useAccountMock.mockReturnValue({ status: 'loading' })

    await renderProtected('/historial')

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })

  it('muestra el contenido cuando hay sesión y cuenta activa', async () => {
    useSessionMock.mockReturnValue(SIGNED_IN)
    useAccountMock.mockReturnValue({
      status: 'active',
      account: { uid: 'user-1', email: 'ana@example.com', role: 'user' },
    })

    await renderProtected('/historial')

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
    expect(useAccountMock).toHaveBeenCalledWith('user-1')
  })

  it('muestra la pantalla de invitación en lugar del contenido cuando no hay acceso', async () => {
    useSessionMock.mockReturnValue({ ...SIGNED_IN, signOut: vi.fn() })
    useAccountMock.mockReturnValue({ status: 'denied' })

    await renderProtected('/historial')

    expect(screen.getByRole('heading', { name: 'Necesitas una invitación' })).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })

  it('muestra un aviso con "Reintentar" si no se pudo comprobar la cuenta', async () => {
    const retry = vi.fn()
    useSessionMock.mockReturnValue(SIGNED_IN)
    useAccountMock.mockReturnValue({ status: 'error', retry })

    await renderProtected('/historial')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo comprobar tu acceso.')
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(retry).toHaveBeenCalledTimes(1)
  })

  describe('/perfil', () => {
    it('muestra el perfil solo con sesión y cuenta activa', async () => {
      useSessionMock.mockReturnValue(SIGNED_IN)
      useAccountMock.mockReturnValue({
        status: 'active',
        account: { uid: 'user-1', email: 'ana@example.com', role: 'user' },
      })

      await renderProtected('/perfil')

      expect(screen.getByText('Contenido del perfil')).toBeInTheDocument()
    })

    it('redirige al login sin sesión, conservando /perfil como origen', async () => {
      useSessionMock.mockReturnValue({ user: null, loading: false })

      await renderProtected('/perfil')

      expect(screen.getByText('Página de login (origen: /perfil)')).toBeInTheDocument()
      expect(screen.queryByText('Contenido del perfil')).not.toBeInTheDocument()
    })

    it('no muestra el perfil a una cuenta sin acceso', async () => {
      useSessionMock.mockReturnValue({ ...SIGNED_IN, signOut: vi.fn() })
      useAccountMock.mockReturnValue({ status: 'denied' })

      await renderProtected('/perfil')

      expect(screen.queryByText('Contenido del perfil')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Necesitas una invitación' })).toBeInTheDocument()
    })
  })
})
