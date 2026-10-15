import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useBoardTasksMock = vi.fn()

vi.mock('../../../../src/api/tasks', () => ({
  useBoardTasks: () => useBoardTasksMock(),
}))

async function renderBoardPage(): Promise<void> {
  const { BoardPage } = await import('../../../../src/features/board/BoardPage')
  render(<BoardPage />)
}

describe('<BoardPage>', () => {
  beforeEach(() => {
    useBoardTasksMock.mockReset()
  })

  it('muestra siempre los 4 cuadrantes y el estado vacío de cada uno sin tareas', async () => {
    useBoardTasksMock.mockReturnValue({
      data: { items: [], next_cursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    await renderBoardPage()

    for (const label of ['Hacer ahora', 'Planificar', 'Delegar', 'Eliminar']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    }
    expect(screen.getAllByText('No hay tareas en este cuadrante.')).toHaveLength(4)
  })

  it('muestra un mensaje de bienvenida cuando no hay ninguna tarea', async () => {
    useBoardTasksMock.mockReturnValue({
      data: { items: [], next_cursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    await renderBoardPage()

    expect(screen.getByText(/crea tu primera tarea/i)).toBeInTheDocument()
  })

  it('muestra un esqueleto de carga mientras se obtienen las tareas', async () => {
    useBoardTasksMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    })

    await renderBoardPage()

    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
  })

  it('muestra un error con "Reintentar" si falla la carga', async () => {
    const refetch = vi.fn()
    useBoardTasksMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    })

    await renderBoardPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i)
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(refetch).toHaveBeenCalledOnce()
  })
})
