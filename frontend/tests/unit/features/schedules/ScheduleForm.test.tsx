import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schedule } from '../../../../src/api/types'

const createMutateAsync = vi.fn()
const updateMutateAsync = vi.fn()

vi.mock('../../../../src/api/schedules', () => ({
  useCreateSchedule: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateSchedule: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}))

// Tuesday 3 November 2026.
const TODAY = '2026-11-03'

const SCHEDULE: Schedule = {
  id: 's1',
  title: 'Regar las plantas',
  description: 'Las del balcón',
  urgent: false,
  important: true,
  quadrant: 'schedule',
  scope: 'personal',
  recurrence: { kind: 'weekly', weekdays: [1, 3] },
  status: 'active',
  next_occurrence: '2026-11-04',
  last_generated_for: null,
  created_at: '2026-11-01T09:00:00Z',
}

async function renderForm(schedule?: Schedule): Promise<{ onClose: ReturnType<typeof vi.fn> }> {
  const { ScheduleForm } = await import('../../../../src/features/schedules/ScheduleForm')
  const onClose = vi.fn()
  render(<ScheduleForm schedule={schedule} today={TODAY} onClose={onClose} />)
  return { onClose }
}

async function fillCommonFields(): Promise<void> {
  await userEvent.type(screen.getByLabelText(/Título/), '  Informe semanal  ')
  await userEvent.type(screen.getByLabelText(/Descripción/), 'Enviar el resumen')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar como importante' }))
  await userEvent.click(screen.getByRole('radio', { name: 'Laboral' }))
}

function repetition(): HTMLElement {
  return screen.getByRole('radiogroup', { name: 'Repetición' })
}

function preview(): HTMLElement {
  return screen.getByText(/^Próxima aparición:/)
}

describe('<ScheduleForm> (crear)', () => {
  beforeEach(() => {
    createMutateAsync.mockReset()
    createMutateAsync.mockResolvedValue({})
    updateMutateAsync.mockReset()
    updateMutateAsync.mockResolvedValue({})
  })

  it('reutiliza los campos de una tarea y muestra a qué cuadrante irá', async () => {
    await renderForm()

    expect(screen.getByRole('dialog', { name: 'Nueva programación' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Título/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Descripción/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Marcar como urgente' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Personal' })).toBeInTheDocument()
    expect(screen.getByText('Irá a: Eliminar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar como urgente' }))
    expect(screen.getByText('Irá a: Delegar')).toBeInTheDocument()
  })

  it('con todo vacío muestra los errores en línea de S4 y no envía nada', async () => {
    await renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('El título no puede estar vacío.')).toBeInTheDocument()
    expect(screen.getByText('La descripción no puede estar vacía.')).toBeInTheDocument()
    expect(screen.getByText('Elige un ámbito.')).toBeInTheDocument()
    expect(createMutateAsync).not.toHaveBeenCalled()
  })

  it('ofrece las cuatro repeticiones y empieza por «Cada día», con su vista previa', async () => {
    await renderForm()

    const options = within(repetition()).getAllByRole('radio')
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
      'Una vez',
      'Cada día',
      'Días de la semana',
      'Un día del mes',
    ])
    expect(within(repetition()).getByRole('radio', { name: 'Cada día' })).toBeChecked()
    expect(preview()).toHaveTextContent('Próxima aparición: hoy')
  })

  it('«Cada día» se envía tal cual, con los textos recortados', async () => {
    const { onClose } = await renderForm()
    await fillCommonFields()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(createMutateAsync).toHaveBeenCalledWith({
      title: 'Informe semanal',
      description: 'Enviar el resumen',
      urgent: false,
      important: true,
      scope: 'work',
      recurrence: { kind: 'daily' },
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  describe('días de la semana', () => {
    it('siete casillas con el nombre completo; la vista previa sigue a la elección', async () => {
      await renderForm()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Días de la semana' }))

      const days = screen.getByRole('group', { name: 'Días de la semana' })
      expect(within(days).getAllByRole('button')).toHaveLength(7)
      await userEvent.click(within(days).getByRole('button', { name: 'Lunes' }))
      expect(within(days).getByRole('button', { name: 'Lunes' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(preview()).toHaveTextContent('Próxima aparición: lunes 9 nov')
      await userEvent.click(within(days).getByRole('button', { name: 'Miércoles' }))
      expect(preview()).toHaveTextContent('Próxima aparición: mañana')
    })

    it('sin ningún día pide elegir al menos uno y no envía', async () => {
      await renderForm()
      await fillCommonFields()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Días de la semana' }))

      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(screen.getByText('Elige al menos un día de la semana.')).toBeInTheDocument()
      expect(createMutateAsync).not.toHaveBeenCalled()
    })

    it('envía los días elegidos en orden', async () => {
      await renderForm()
      await fillCommonFields()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Días de la semana' }))
      const days = screen.getByRole('group', { name: 'Días de la semana' })
      await userEvent.click(within(days).getByRole('button', { name: 'Miércoles' }))
      await userEvent.click(within(days).getByRole('button', { name: 'Lunes' }))

      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(createMutateAsync.mock.calls[0]?.[0].recurrence).toEqual({
        kind: 'weekly',
        weekdays: [1, 3],
      })
    })
  })

  describe('un día del mes', () => {
    it('el día 31 avisa de que en un mes corto cae el último, y la vista previa lo calcula', async () => {
      await renderForm()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Un día del mes' }))

      const day = screen.getByLabelText('Día del mes')
      await userEvent.clear(day)
      await userEvent.type(day, '31')

      expect(screen.getByText('En los meses más cortos, el último día.')).toBeInTheDocument()
      expect(preview()).toHaveTextContent('Próxima aparición: lunes 30 nov')
    })

    it.each(['0', '32'])('el día %s se rechaza', async (value) => {
      await renderForm()
      await fillCommonFields()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Un día del mes' }))
      const day = screen.getByLabelText('Día del mes')
      await userEvent.clear(day)
      await userEvent.type(day, value)

      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(screen.getByText('Elige un día entre 1 y 31.')).toBeInTheDocument()
      expect(createMutateAsync).not.toHaveBeenCalled()
    })

    it('envía el día elegido', async () => {
      await renderForm()
      await fillCommonFields()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Un día del mes' }))
      const day = screen.getByLabelText('Día del mes')
      await userEvent.clear(day)
      await userEvent.type(day, '15')

      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(createMutateAsync.mock.calls[0]?.[0].recurrence).toEqual({
        kind: 'monthly',
        month_day: 15,
      })
    })
  })

  describe('una vez', () => {
    it('el selector de fecha no admite días pasados', async () => {
      await renderForm()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Una vez' }))

      expect(screen.getByLabelText('Fecha')).toHaveAttribute('min', TODAY)
    })

    it('sin fecha pide una', async () => {
      await renderForm()
      await fillCommonFields()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Una vez' }))

      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(screen.getByText('Elige una fecha.')).toBeInTheDocument()
      expect(createMutateAsync).not.toHaveBeenCalled()
    })

    it('una fecha pasada se rechaza en el cliente', async () => {
      await renderForm()
      await fillCommonFields()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Una vez' }))
      await userEvent.type(screen.getByLabelText('Fecha'), '2026-11-02')

      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(screen.getByText('La fecha no puede ser anterior a hoy.')).toBeInTheDocument()
      expect(createMutateAsync).not.toHaveBeenCalled()
    })

    it('una fecha de mañana se envía y la vista previa la nombra', async () => {
      await renderForm()
      await fillCommonFields()
      await userEvent.click(within(repetition()).getByRole('radio', { name: 'Una vez' }))
      await userEvent.type(screen.getByLabelText('Fecha'), '2026-11-04')

      expect(preview()).toHaveTextContent('Próxima aparición: mañana')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(createMutateAsync.mock.calls[0]?.[0].recurrence).toEqual({
        kind: 'once',
        date: '2026-11-04',
      })
    })
  })

  it('si el servidor lo rechaza (también una fecha pasada), el formulario sigue abierto con lo escrito', async () => {
    createMutateAsync.mockRejectedValue(new Error('rechazado'))
    const { onClose } = await renderForm()
    await fillCommonFields()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Título/)).toHaveValue('  Informe semanal  ')
  })

  it('Cancelar cierra sin enviar', async () => {
    const { onClose } = await renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(createMutateAsync).not.toHaveBeenCalled()
  })
})

describe('<ScheduleForm> (editar)', () => {
  beforeEach(() => {
    updateMutateAsync.mockReset()
    updateMutateAsync.mockResolvedValue({})
    createMutateAsync.mockReset()
  })

  it('parte de los datos y la repetición guardados', async () => {
    await renderForm(SCHEDULE)

    expect(screen.getByRole('dialog', { name: 'Editar programación' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Título/)).toHaveValue('Regar las plantas')
    expect(within(repetition()).getByRole('radio', { name: 'Días de la semana' })).toBeChecked()
    const days = screen.getByRole('group', { name: 'Días de la semana' })
    expect(within(days).getByRole('button', { name: 'Lunes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(days).getByRole('button', { name: 'Martes' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('envía solo lo que ha cambiado, sin tocar la repetición si no se cambió', async () => {
    const { onClose } = await renderForm(SCHEDULE)
    const title = screen.getByLabelText(/Título/)
    await userEvent.clear(title)
    await userEvent.type(title, 'Regar el huerto')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateMutateAsync).toHaveBeenCalledWith({ id: 's1', data: { title: 'Regar el huerto' } })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('si cambia la repetición, la envía', async () => {
    await renderForm(SCHEDULE)
    await userEvent.click(within(repetition()).getByRole('radio', { name: 'Cada día' }))

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 's1',
      data: { recurrence: { kind: 'daily' } },
    })
  })

  it('sin cambios, cierra sin llamar al servidor', async () => {
    const { onClose } = await renderForm(SCHEDULE)

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateMutateAsync).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
