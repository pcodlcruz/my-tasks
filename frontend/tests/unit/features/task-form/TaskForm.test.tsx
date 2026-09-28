import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mutateAsync = vi.fn()
const updateMutateAsync = vi.fn()

vi.mock('../../../../src/api/tasks', () => ({
  useCreateTask: () => ({ mutateAsync, isPending: false }),
  useUpdateTask: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}))

async function renderTaskForm(onClose: () => void = vi.fn()): Promise<void> {
  const { TaskForm } = await import('../../../../src/features/task-form/TaskForm')
  render(<TaskForm onClose={onClose} />)
}

describe('<TaskForm> (modo crear)', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    mutateAsync.mockResolvedValue({})
  })

  it('muestra los contadores de título y descripción y se actualizan al escribir', async () => {
    await renderTaskForm()

    expect(screen.getByText('0/200')).toBeInTheDocument()
    expect(screen.getByText('0/2000')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Título/), 'Comprar leche')

    expect(screen.getByText('13/200')).toBeInTheDocument()
  })

  it('muestra los interruptores de Urgente e Importante y el ámbito sin preselección', async () => {
    await renderTaskForm()

    const urgent = screen.getByRole('checkbox', { name: 'Marcar como urgente' })
    const important = screen.getByRole('checkbox', { name: 'Marcar como importante' })
    expect(urgent).not.toBeChecked()
    expect(important).not.toBeChecked()

    const scopeGroup = screen.getByRole('radiogroup', { name: /ámbito/i })
    for (const radio of within(scopeGroup).getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
  })

  it('actualiza la vista previa "Irá a: …" al cambiar urgente/importante', async () => {
    await renderTaskForm()

    expect(screen.getByText(/Irá a: Eliminar/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar como urgente' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar como importante' }))

    expect(screen.getByText(/Irá a: Hacer ahora/)).toBeInTheDocument()
  })

  it('no envía y muestra errores en línea si el formulario no es válido', async () => {
    await renderTaskForm()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El título no puede estar vacío.')).toBeInTheDocument()
    expect(screen.getByText('La descripción no puede estar vacía.')).toBeInTheDocument()
    expect(screen.getByText('Elige un ámbito.')).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('envía la tarea con los datos del formulario cuando es válido', async () => {
    const onClose = vi.fn()
    await renderTaskForm(onClose)

    await userEvent.type(screen.getByLabelText(/Título/), 'Comprar leche')
    await userEvent.type(screen.getByLabelText(/Descripción/), 'En el supermercado')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar como urgente' }))
    await userEvent.click(screen.getByRole('radio', { name: /Personal/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      title: 'Comprar leche',
      description: 'En el supermercado',
      urgent: true,
      important: false,
      scope: 'personal',
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
