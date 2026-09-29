import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../../src/api/types'

const useHistoryMock = vi.fn()
const reopenMutate = vi.fn()
const trashMutate = vi.fn()

vi.mock('../../../../src/api/tasks', () => ({
  useHistory: () => useHistoryMock(),
  useReopenTask: () => ({ mutate: reopenMutate, isPending: false }),
  useTrashTask: () => ({ mutate: trashMutate, isPending: false }),
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Enviar reporte financiero',
    description: 'Detalle',
    urgent: true,
    important: true,
    quadrant: 'do_now',
    scope: 'work',
    pinned: false,
    status: 'completed',
    in_trash: false,
    created_at: new Date(2026, 8, 20, 8, 0).toISOString(),
    updated_at: new Date(2026, 8, 29, 9, 30).toISOString(),
    completed_at: new Date(2026, 8, 29, 9, 30).toISOString(),
    trashed_at: null,
    purge_at: null,
    ...overrides,
  }
}

function historyResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: { pages: [{ items: [makeTask()], next_cursor: null }], pageParams: [undefined] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  }
}

async function renderHistoryPage(): Promise<void> {
  const { HistoryPage } = await import('../../../../src/features/history/HistoryPage')
  render(<HistoryPage />)
}

describe('<HistoryPage>', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 29, 12, 0))
    useHistoryMock.mockReset()
    reopenMutate.mockReset()
    trashMutate.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra título, cuadrante, ámbito y fecha de finalización de cada tarea', async () => {
    useHistoryMock.mockReturnValue(historyResult())

    await renderHistoryPage()

    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument()
    const row = screen.getByRole('article')
    expect(within(row).getByText('Enviar reporte financiero')).toBeInTheDocument()
    expect(within(row).getByText('Hacer ahora')).toBeInTheDocument()
    expect(within(row).getByText('Laboral')).toBeInTheDocument()
    expect(within(row).getByText('Completada hoy, 09:30')).toBeInTheDocument()
  })

  it('agrupa las tareas por día de finalización', async () => {
    useHistoryMock.mockReturnValue(
      historyResult({
        data: {
          pages: [
            {
              items: [
                makeTask({ id: 'a' }),
                makeTask({
                  id: 'b',
                  title: 'Tarea de ayer',
                  completed_at: new Date(2026, 8, 28, 18, 15).toISOString(),
                }),
              ],
              next_cursor: null,
            },
          ],
          pageParams: [undefined],
        },
      }),
    )

    await renderHistoryPage()

    expect(screen.getByRole('heading', { name: /^Hoy, 29 de septiembre/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Ayer, 28 de septiembre/ })).toBeInTheDocument()
  })

  it('no ofrece la acción de editar en el historial', async () => {
    useHistoryMock.mockReturnValue(historyResult())

    await renderHistoryPage()

    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  })

  it('muestra "Reabrir" y "Mover a la papelera" en cada fila y llaman a su acción', async () => {
    useHistoryMock.mockReturnValue(
      historyResult({
        data: {
          pages: [
            {
              items: [makeTask({ id: 'a' }), makeTask({ id: 'b', title: 'Otra' })],
              next_cursor: null,
            },
          ],
          pageParams: [undefined],
        },
      }),
    )
    const user = userEvent.setup()

    await renderHistoryPage()

    expect(screen.getAllByRole('button', { name: 'Reabrir' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Mover a la papelera' })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: 'Reabrir' })[1] as HTMLElement)
    await user.click(
      screen.getAllByRole('button', { name: 'Mover a la papelera' })[0] as HTMLElement,
    )
    expect(reopenMutate).toHaveBeenCalledWith('b')
    expect(trashMutate).toHaveBeenCalledWith('a')
  })

  it('muestra "Cargar más" solo si hay más páginas y pide la siguiente al pulsarlo', async () => {
    const fetchNextPage = vi.fn()
    useHistoryMock.mockReturnValue(historyResult({ hasNextPage: true, fetchNextPage }))
    const user = userEvent.setup()

    await renderHistoryPage()

    await user.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(fetchNextPage).toHaveBeenCalledOnce()
  })

  it('oculta "Cargar más" cuando no quedan más páginas', async () => {
    useHistoryMock.mockReturnValue(historyResult({ hasNextPage: false }))

    await renderHistoryPage()

    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })

  it('muestra el estado vacío cuando no hay tareas completadas', async () => {
    useHistoryMock.mockReturnValue(
      historyResult({
        data: { pages: [{ items: [], next_cursor: null }], pageParams: [undefined] },
      }),
    )

    await renderHistoryPage()

    expect(screen.getByText('Aún no has completado ninguna tarea')).toBeInTheDocument()
  })

  it('muestra un esqueleto de carga mientras se obtiene el historial', async () => {
    useHistoryMock.mockReturnValue(historyResult({ data: undefined, isLoading: true }))

    await renderHistoryPage()

    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
  })

  it('muestra un error con "Reintentar" si falla la carga', async () => {
    const refetch = vi.fn()
    useHistoryMock.mockReturnValue(historyResult({ data: undefined, isError: true, refetch }))
    const user = userEvent.setup()

    await renderHistoryPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i)
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
