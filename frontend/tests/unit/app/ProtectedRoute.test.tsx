import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSessionMock = vi.fn()

vi.mock('../../../src/features/auth/useSession', () => ({
  useSession: () => useSessionMock(),
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
      </Routes>
    </MemoryRouter>,
  )
}

describe('<ProtectedRoute>', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
  })

  it('redirige a /login cuando no hay sesión, conservando la ruta de origen', async () => {
    useSessionMock.mockReturnValue({ user: null, loading: false })

    await renderProtected('/historial')

    expect(screen.getByText('Página de login (origen: /historial)')).toBeInTheDocument()
  })

  it('muestra el contenido cuando hay sesión', async () => {
    useSessionMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false })

    await renderProtected('/historial')

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })
})
