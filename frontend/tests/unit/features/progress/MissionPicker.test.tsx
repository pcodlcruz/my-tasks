import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../../src/api/types'
import { MissionPicker, type MissionSection } from '../../../../src/features/progress/MissionPicker'

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Tarea ${id}`,
    description: 'Detalle',
    urgent: true,
    important: true,
    quadrant: 'do_now',
    scope: 'work',
    pinned: false,
    status: 'active',
    in_trash: false,
    created_at: '2026-10-31T08:00:00Z',
    updated_at: '2026-10-31T08:00:00Z',
    completed_at: null,
    trashed_at: null,
    purge_at: null,
    schedule_id: null,
    scheduled_for: null,
    ...overrides,
  }
}

function renderPicker(
  sections: MissionSection[],
  selected: string[] = [],
): { onToggle: ReturnType<typeof vi.fn> } {
  const onToggle = vi.fn()
  render(<MissionPicker sections={sections} selected={selected} onToggle={onToggle} />)
  return { onToggle }
}

const DO_NOW: MissionSection = {
  id: 'do-now',
  title: 'Hacer ahora',
  tasks: [task('a'), task('b'), task('c')],
  emptyText: 'No tienes tareas en «Hacer ahora».',
}

const SCHEDULED: MissionSection = {
  id: 'scheduled',
  title: 'Programadas de hoy',
  tasks: [],
  emptyText: 'Hoy no hay tareas programadas.',
}

describe('<MissionPicker>', () => {
  it('muestra cada lista con su título y el texto de vacío si no tiene tareas', () => {
    renderPicker([DO_NOW, SCHEDULED])

    const doNow = screen.getByRole('group', { name: 'Hacer ahora' })
    expect(within(doNow).getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Programadas de hoy' })).toHaveTextContent(
      'Hoy no hay tareas programadas.',
    )
  })

  it('cuenta las elegidas sobre 5', () => {
    renderPicker([DO_NOW], ['a', 'b'])

    expect(screen.getByText('Misión del día: 2 de 5 elegidas')).toBeInTheDocument()
  })

  it('cada tarea es un botón pulsable con su título en el nombre', async () => {
    const { onToggle } = renderPicker([DO_NOW], ['a'])

    const chosen = screen.getByRole('button', { name: 'Añadir a la misión: Tarea a' })
    expect(chosen).toHaveAttribute('aria-pressed', 'true')
    expect(chosen).toHaveTextContent('En misión')
    const other = screen.getByRole('button', { name: 'Añadir a la misión: Tarea b' })
    expect(other).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(other)
    expect(onToggle).toHaveBeenCalledWith('b')
  })

  it('con 5 elegidas no deja añadir otra, dice por qué, y sí deja quitar', () => {
    const many: MissionSection = {
      ...DO_NOW,
      tasks: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => task(id)),
    }
    renderPicker([many], ['a', 'b', 'c', 'd', 'e'])

    const sixth = screen.getByRole('button', { name: 'Añadir a la misión: Tarea f' })
    expect(sixth).toBeDisabled()
    expect(sixth).toHaveAccessibleDescription('La misión ya tiene 5 tareas.')
    expect(screen.getByRole('button', { name: 'Añadir a la misión: Tarea a' })).toBeEnabled()
  })

  it('las completadas cuentan en las 5 aunque no se listen', () => {
    renderPicker([DO_NOW], ['x', 'y', 'z', 'w', 'v'])

    expect(screen.getByText('Misión del día: 5 de 5 elegidas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir a la misión: Tarea a' })).toBeDisabled()
  })

  it('solo ofrece tareas activas, nunca completadas ni en la papelera', () => {
    renderPicker([
      {
        ...DO_NOW,
        tasks: [task('a'), task('b', { status: 'completed' }), task('c', { in_trash: true })],
      },
    ])

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Añadir a la misión: Tarea a' })).toBeInTheDocument()
  })
})
