import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSessionMock = vi.fn()
const useIsAdminMock = vi.fn()

vi.mock('../../../src/features/auth/useSession', () => ({
  useSession: () => useSessionMock(),
}))

vi.mock('../../../src/features/auth/useIsAdmin', () => ({
  useIsAdmin: () => useIsAdminMock(),
}))

async function renderHeader(path = '/'): Promise<void> {
  const { AppHeader } = await import('../../../src/app/AppHeader')
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>,
  )
}

describe('<AppHeader>', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useIsAdminMock.mockReset()
    useSessionMock.mockReturnValue({
      user: { uid: 'u1', displayName: 'Ana Cruz', email: 'ana@example.com' },
      signOut: vi.fn(),
    })
    useIsAdminMock.mockReturnValue(false)
  })

  it('muestra un enlace "Perfil" a /perfil', async () => {
    await renderHeader()

    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil')
  })

  it('no incluye "Perfil" entre las pestañas principales', async () => {
    await renderHeader()

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).queryByRole('link', { name: 'Perfil' })).not.toBeInTheDocument()
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tablero', 'Historial', 'Papelera'])
  })

  it('marca "Perfil" como activo solo en /perfil', async () => {
    await renderHeader('/perfil')

    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page')
  })

  it('no marca "Perfil" como activo en el resto de rutas', async () => {
    await renderHeader('/historial')

    expect(screen.getByRole('link', { name: 'Perfil' })).not.toHaveAttribute('aria-current')
  })

  it('mantiene "Cerrar sesión" y el nombre de la cuenta', async () => {
    await renderHeader()

    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Ana Cruz')).toBeInTheDocument()
  })
})
