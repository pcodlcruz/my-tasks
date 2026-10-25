import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSessionMock = vi.fn()
const useAccountMock = vi.fn()

vi.mock('../../../src/features/auth/useSession', () => ({
  useSession: () => useSessionMock(),
}))

vi.mock('../../../src/features/auth/useAccount', () => ({
  useAccount: (uid: string | undefined) => useAccountMock(uid),
}))

const USER = { uid: 'uid-1', email: 'ana@example.com', role: 'user' as const }
const ADMIN = { uid: 'uid-2', email: 'admin@example.com', role: 'admin' as const }

function signInAs(account: typeof USER | typeof ADMIN): void {
  useSessionMock.mockReturnValue({
    user: { uid: account.uid, email: account.email, displayName: null },
    loading: false,
    signOut: vi.fn(),
  })
  useAccountMock.mockReturnValue({ status: 'active', account })
}

async function renderAdminRoute(initialEntry = '/admin/access'): Promise<void> {
  const { AdminRoute } = await import('../../../src/app/AdminRoute')
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>Tablero</div>} />
        <Route element={<AdminRoute />}>
          <Route path="/admin/access" element={<div>Pantalla de accesos</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// The header also shows the avatar and name, which come from the profile: not under test here.
vi.mock('../../../src/api/profile', () => ({
  useProfile: () => ({ data: undefined, isPending: false, isError: false }),
  useAvatarUrl: () => undefined,
}))

async function renderHeader(): Promise<void> {
  const { AppHeader } = await import('../../../src/app/AppHeader')
  render(
    <MemoryRouter>
      <AppHeader />
    </MemoryRouter>,
  )
}

describe('<AdminRoute>', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useAccountMock.mockReset()
  })

  it('deja ver la pantalla de accesos a un administrador', async () => {
    signInAs(ADMIN)

    await renderAdminRoute()

    expect(screen.getByText('Pantalla de accesos')).toBeInTheDocument()
  })

  it('redirige a un user al tablero sin mostrar la pantalla', async () => {
    signInAs(USER)

    await renderAdminRoute()

    expect(screen.queryByText('Pantalla de accesos')).not.toBeInTheDocument()
    expect(screen.getByText('Tablero')).toBeInTheDocument()
  })

  it('redirige también mientras no se conoce la cuenta', async () => {
    useSessionMock.mockReturnValue({ user: { uid: 'uid-1' }, loading: false, signOut: vi.fn() })
    useAccountMock.mockReturnValue({ status: 'loading' })

    await renderAdminRoute()

    expect(screen.queryByText('Pantalla de accesos')).not.toBeInTheDocument()
  })
})

describe('<AppHeader> · enlace «Accesos»', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useAccountMock.mockReset()
  })

  it('un administrador ve el enlace «Accesos» hacia /admin/access', async () => {
    signInAs(ADMIN)

    await renderHeader()

    expect(screen.getByRole('link', { name: 'Accesos' })).toHaveAttribute('href', '/admin/access')
  })

  it('un user no ve el enlace «Accesos»', async () => {
    signInAs(USER)

    await renderHeader()

    expect(screen.queryByRole('link', { name: 'Accesos' })).not.toBeInTheDocument()
  })

  it.each([USER, ADMIN])('el resto del encabezado no cambia para el rol $role', async (account) => {
    signInAs(account)

    await renderHeader()

    expect(screen.getByRole('link', { name: 'Tablero' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Historial' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Papelera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
})
