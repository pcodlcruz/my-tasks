import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../../src/api/types'

const useTrashMock = vi.fn()
const restoreMutate = vi.fn()
const deleteMutate = vi.fn()

vi.mock('../../../../src/api/tasks', () => ({
  useTrash: () => useTrashMock(),
  useRestoreTask: () => ({ mutate: restoreMutate, isPending: false }),
  useDeleteTask: () => ({ mutate: deleteMutate, isPending: false }),
}))

const NOW = new Date(2026, 8, 29, 12, 0)
const DAY_MS = 24 * 60 * 60 * 1000

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Revisar logs del servidor',
    description: 'Detalle',
    urgent: true,
    important: true,
    quadrant: 'do_now',
    scope: 'work',
    pinned: false,
    status: 'active',
    in_trash: true,
    created_at: new Date(2026, 8, 1, 8, 0).toISOString(),
    updated_at: NOW.toISOString(),
    completed_at: null,
    trashed_at: new Date(NOW.getTime() - 18 * DAY_MS).toISOString(),
    purge_at: new Date(NOW.getTime() + 12 * DAY_MS).toISOString(),
    ...overrides,
  }
}

function trashResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

async function renderTrashPage(): Promise<void> {
  const { TrashPage } = await import('../../../../src/features/trash/TrashPage')
  render(<TrashPage />)
}

describe('<TrashPage>', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    useTrashMock.mockReset()
    restoreMutate.mockReset()
    deleteMutate.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra título, estado, ámbito, cuadrante y los días que faltan para eliminarla', async () => {
    useTrashMock.mockReturnValue(trashResult())

    await renderTrashPage()

    const row = screen.getByRole('article')
    expect(within(row).getByText('Revisar logs del servidor')).toBeInTheDocument()
    expect(within(row).getByText('Activa')).toBeInTheDocument()
    expect(within(row).getByText('Laboral')).toBeInTheDocument()
    expect(within(row).getByText('Hacer ahora')).toBeInTheDocument()
    expect(within(row).getByText('Se eliminará en 12 días')).toBeInTheDocument()
  })

  it('distingue las tareas que estaban completadas y usa el singular con 1 día', async () => {
    useTrashMock.mockReturnValue(
      trashResult({
        data: {
          pages: [
            {
              items: [
                makeTask({
                  status: 'completed',
                  completed_at: NOW.toISOString(),
                  purge_at: new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString(),
                }),
              ],
              next_cursor: null,
            },
          ],
          pageParams: [undefined],
        },
      }),
    )

    await renderTrashPage()

    expect(screen.getByText('Completada')).toBeInTheDocument()
    expect(screen.getByText('Se eliminará en 1 día')).toBeInTheDocument()
  })

  it('muestra el aviso fijo de eliminación automática a los 30 días', async () => {
    useTrashMock.mockReturnValue(trashResult())

    await renderTrashPage()

    expect(
      screen.getByText('Las tareas se eliminan automáticamente a los 30 días.'),
    ).toBeInTheDocument()
  })

  it('ofrece "Restaurar" en cada fila y llama a su acción con el id', async () => {
    useTrashMock.mockReturnValue(
      trashResult({
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

    await renderTrashPage()

    const buttons = screen.getAllByRole('button', { name: 'Restaurar' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1] as HTMLElement)
    expect(restoreMutate).toHaveBeenCalledWith('b')
  })

  it('pide confirmación antes de eliminar definitivamente y no borra si se cancela', async () => {
    useTrashMock.mockReturnValue(trashResult())
    const user = userEvent.setup()

    await renderTrashPage()
    await user.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(/no se puede deshacer/i)
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(deleteMutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('elimina definitivamente la tarea al confirmar', async () => {
    useTrashMock.mockReturnValue(trashResult())
    const user = userEvent.setup()

    await renderTrashPage()
    await user.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }))

    expect(deleteMutate).toHaveBeenCalledWith('task-1')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cierra el diálogo de confirmación con Escape sin borrar', async () => {
    useTrashMock.mockReturnValue(trashResult())
    const user = userEvent.setup()

    await renderTrashPage()
    await user.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteMutate).not.toHaveBeenCalled()
  })

  it('muestra "Cargar más" solo si hay más páginas y pide la siguiente al pulsarlo', async () => {
    const fetchNextPage = vi.fn()
    useTrashMock.mockReturnValue(trashResult({ hasNextPage: true, fetchNextPage }))
    const user = userEvent.setup()

    await renderTrashPage()

    await user.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(fetchNextPage).toHaveBeenCalledOnce()
  })

  it('muestra el estado vacío cuando la papelera está vacía', async () => {
    useTrashMock.mockReturnValue(
      trashResult({ data: { pages: [{ items: [], next_cursor: null }], pageParams: [undefined] } }),
    )

    await renderTrashPage()

    expect(screen.getByText('La papelera está vacía')).toBeInTheDocument()
  })

  it('muestra un esqueleto de carga mientras se obtiene la papelera', async () => {
    useTrashMock.mockReturnValue(trashResult({ data: undefined, isLoading: true }))

    await renderTrashPage()

    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
  })

  it('muestra un error con "Reintentar" si falla la carga', async () => {
    const refetch = vi.fn()
    useTrashMock.mockReturnValue(trashResult({ data: undefined, isError: true, refetch }))
    const user = userEvent.setup()

    await renderTrashPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i)
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
