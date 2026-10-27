import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn()

vi.mock('../../../../src/features/auth/useSession', () => ({
  useSession: () => ({ user: { uid: 'user-1', email: 'ana@example.com' }, signOut }),
}))

async function renderPage(): Promise<void> {
  const { AccessDeniedPage } = await import('../../../../src/features/auth/AccessDeniedPage')
  render(<AccessDeniedPage />)
}

describe('<AccessDeniedPage>', () => {
  beforeEach(() => {
    signOut.mockReset()
  })

  it('explica que hace falta una invitación y con qué cuenta se ha entrado', async () => {
    await renderPage()

    expect(screen.getByRole('heading', { name: 'Necesitas una invitación' })).toBeInTheDocument()
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument()
  })

  it('nombra la aplicación como InsertTasks y no con el nombre anterior', async () => {
    await renderPage()

    expect(screen.getByText(/^InsertTasks es una aplicación privada/)).toBeInTheDocument()
    expect(screen.queryByText(/mytasks/i)).toBeNull()
  })

  it('no revela si la cuenta está invitada o fue revocada', async () => {
    await renderPage()

    expect(screen.queryByText(/revoc/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pendiente/i)).not.toBeInTheDocument()
  })

  it('permite cerrar sesión', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
