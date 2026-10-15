import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithGoogle = vi.fn()

vi.mock('../../../../src/features/auth/useSession', () => ({
  useSession: () => ({ user: null, loading: false, signInWithGoogle, signOut: vi.fn() }),
}))

async function renderLoginPage(initialEntry = '/login'): Promise<void> {
  const { LoginPage } = await import('../../../../src/features/auth/LoginPage')
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('<LoginPage>', () => {
  beforeEach(() => {
    signInWithGoogle.mockReset()
  })

  it('muestra el botón "Iniciar sesión con Google"', async () => {
    await renderLoginPage()

    expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeInTheDocument()
  })

  it('muestra el estado de carga mientras se abre la ventana de Google', async () => {
    let resolveSignIn: () => void = () => {}
    signInWithGoogle.mockReturnValue(new Promise<void>((resolve) => (resolveSignIn = resolve)))
    await renderLoginPage()

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    const loadingButton = screen.getByRole('button', { name: 'Cargando' })
    expect(loadingButton).toBeDisabled()
    expect(loadingButton).toHaveAttribute('aria-busy', 'true')

    resolveSignIn()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeEnabled(),
    )
  })

  it('vuelve al estado inicial sin error si el usuario cierra la ventana', async () => {
    signInWithGoogle.mockRejectedValue({ code: 'auth/popup-closed-by-user' })
    await renderLoginPage()

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeInTheDocument()
  })

  it('muestra un error genérico con "Reintentar" ante cualquier otro fallo', async () => {
    signInWithGoogle.mockRejectedValue({ code: 'auth/internal-error' })
    await renderLoginPage()

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesión.')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('muestra el aviso "Tu sesión ha caducado" con ?reason=expired', async () => {
    await renderLoginPage('/login?reason=expired')

    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión ha caducado')
  })
})
