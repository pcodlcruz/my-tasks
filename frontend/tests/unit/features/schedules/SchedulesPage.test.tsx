import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schedule } from '../../../../src/api/types'

const useSchedulesMock = vi.fn()
const pauseMutate = vi.fn()
const resumeMutate = vi.fn()
const deleteMutate = vi.fn()

vi.mock('../../../../src/api/schedules', () => ({
  useSchedules: () => useSchedulesMock(),
  usePauseSchedule: () => ({ mutate: pauseMutate, isPending: false }),
  useResumeSchedule: () => ({ mutate: resumeMutate, isPending: false }),
  useDeleteSchedule: () => ({ mutate: deleteMutate, isPending: false }),
  useCreateSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../../../src/api/progress', () => ({
  useProgress: () => ({ data: { today: '2026-11-03' } }),
}))

function schedule(id: string, overrides: Partial<Schedule> = {}): Schedule {
  return {
    id,
    title: `Programada ${id}`,
    description: 'Detalle',
    urgent: false,
    important: true,
    quadrant: 'schedule',
    scope: 'personal',
    recurrence: { kind: 'weekly', weekdays: [1, 3] },
    status: 'active',
    next_occurrence: '2026-11-04',
    last_generated_for: null,
    created_at: '2026-11-01T09:00:00Z',
    ...overrides,
  }
}

function listResult(items: Schedule[] | undefined, overrides: Record<string, unknown> = {}) {
  return { data: items, isPending: false, isError: false, refetch: vi.fn(), ...overrides }
}

async function renderPage(): Promise<void> {
  const { SchedulesPage } = await import('../../../../src/features/schedules/SchedulesPage')
  render(<SchedulesPage />)
}

function row(title: string): HTMLElement {
  const item = screen.getByRole('heading', { name: title }).closest('li')
  if (item === null) throw new Error(`No hay fila para ${title}`)
  return item
}

describe('<SchedulesPage>', () => {
  beforeEach(() => {
    useSchedulesMock.mockReset()
    pauseMutate.mockReset()
    resumeMutate.mockReset()
    deleteMutate.mockReset()
    useSchedulesMock.mockReturnValue(listResult([schedule('a')]))
  })

  it('titula la página y muestra cada programación con su repetición, cuadrante, ámbito y estado', async () => {
    useSchedulesMock.mockReturnValue(
      listResult([
        schedule('a'),
        schedule('b', {
          recurrence: { kind: 'monthly', month_day: 31 },
          status: 'paused',
          next_occurrence: null,
          urgent: true,
          quadrant: 'do_now',
          scope: 'work',
        }),
        schedule('c', {
          recurrence: { kind: 'once', date: '2026-11-05' },
          status: 'finished',
          next_occurrence: null,
        }),
      ]),
    )

    await renderPage()

    expect(
      screen.getByRole('heading', { name: 'Tareas programadas', level: 1 }),
    ).toBeInTheDocument()
    const first = row('Programada a')
    expect(first).toHaveTextContent('Lunes y miércoles')
    expect(first).toHaveTextContent('Planificar')
    expect(first).toHaveTextContent('Personal')
    expect(first).toHaveTextContent('Activa')
    expect(first).toHaveTextContent('Próxima aparición: mañana')
    const second = row('Programada b')
    expect(second).toHaveTextContent('Día 31 de cada mes (o el último)')
    expect(second).toHaveTextContent('Pausada')
    expect(second).toHaveTextContent('Sin próxima aparición')
    expect(second).toHaveTextContent('Hacer ahora')
    expect(row('Programada c')).toHaveTextContent('Una vez · 5 nov')
    expect(row('Programada c')).toHaveTextContent('Terminada')
  })

  it('mientras carga, un esqueleto accesible', async () => {
    useSchedulesMock.mockReturnValue(listResult(undefined, { isPending: true }))

    await renderPage()

    expect(screen.getByRole('status', { name: 'Cargando programaciones' })).toBeInTheDocument()
  })

  it('si falla la carga, avisa con «Reintentar»', async () => {
    const refetch = vi.fn()
    useSchedulesMock.mockReturnValue(listResult(undefined, { isError: true, refetch }))

    await renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las programaciones.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('sin ninguna, un estado vacío que invita a crear la primera', async () => {
    useSchedulesMock.mockReturnValue(listResult([]))

    await renderPage()

    expect(screen.getByText('Aún no tienes tareas programadas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Crear la primera programación' }))
    expect(screen.getByRole('dialog', { name: 'Nueva programación' })).toBeInTheDocument()
  })

  it('«Nueva programación» abre el formulario', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: '+ Nueva programación' }))

    expect(screen.getByRole('dialog', { name: 'Nueva programación' })).toBeInTheDocument()
  })

  it('«Editar» abre el formulario con sus datos', async () => {
    await renderPage()

    await userEvent.click(within(row('Programada a')).getByRole('button', { name: 'Editar' }))

    expect(screen.getByRole('dialog', { name: 'Editar programación' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Título/)).toHaveValue('Programada a')
  })

  it('pausa una activa y reanuda una pausada', async () => {
    useSchedulesMock.mockReturnValue(
      listResult([schedule('a'), schedule('b', { status: 'paused', next_occurrence: null })]),
    )
    await renderPage()

    await userEvent.click(within(row('Programada a')).getByRole('button', { name: 'Pausar' }))
    await userEvent.click(within(row('Programada b')).getByRole('button', { name: 'Reanudar' }))

    expect(pauseMutate).toHaveBeenCalledWith('a')
    expect(resumeMutate).toHaveBeenCalledWith('b')
  })

  it('una terminada no se puede editar, pausar ni reanudar, pero sí eliminar', async () => {
    useSchedulesMock.mockReturnValue(
      listResult([schedule('c', { status: 'finished', next_occurrence: null })]),
    )

    await renderPage()

    const finished = row('Programada c')
    expect(within(finished).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(finished).queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(within(finished).queryByRole('button', { name: 'Reanudar' })).not.toBeInTheDocument()
    expect(within(finished).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('eliminar pide confirmación y aclara que las tareas ya generadas se quedan', async () => {
    await renderPage()

    await userEvent.click(within(row('Programada a')).getByRole('button', { name: 'Eliminar' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Las tareas que ya ha generado se quedan en el tablero.')
    expect(deleteMutate).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    expect(deleteMutate).toHaveBeenCalledWith('a')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cancelar la confirmación no elimina nada', async () => {
    await renderPage()
    await userEvent.click(within(row('Programada a')).getByRole('button', { name: 'Eliminar' }))

    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
    )

    expect(deleteMutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('al llegar a 50 avisa y no deja crear más', async () => {
    useSchedulesMock.mockReturnValue(
      listResult(Array.from({ length: 50 }, (_, index) => schedule(`s${index}`))),
    )

    await renderPage()

    expect(screen.getByText(/Has llegado al límite de 50 programaciones/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Nueva programación' })).toBeDisabled()
  })

  it('con 49 todavía deja crear', async () => {
    useSchedulesMock.mockReturnValue(
      listResult(Array.from({ length: 49 }, (_, index) => schedule(`s${index}`))),
    )

    await renderPage()

    expect(screen.getByRole('button', { name: '+ Nueva programación' })).toBeEnabled()
    expect(screen.queryByText(/Has llegado al límite/)).not.toBeInTheDocument()
  })
})
