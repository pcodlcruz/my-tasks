import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProgressDayDetail, Task } from '../../../../src/api/types'
import { DayDetail } from '../../../../src/features/progress/DayDetail'

const TASK: Task = {
  id: 't1',
  title: 'Resolver la caída',
  description: 'Detalle',
  urgent: true,
  important: true,
  quadrant: 'do_now',
  scope: 'work',
  pinned: false,
  status: 'completed',
  in_trash: false,
  created_at: '2026-10-28T08:00:00Z',
  updated_at: '2026-10-28T10:45:00Z',
  completed_at: '2026-10-28T10:45:00Z',
  trashed_at: null,
  purge_at: null,
  schedule_id: null,
  scheduled_for: null,
}

function detail(overrides: Partial<ProgressDayDetail> = {}): ProgressDayDetail {
  return {
    date: '2026-10-28',
    active: true,
    goal: 3,
    completed_count: 1,
    goal_met: false,
    mission_cleared: false,
    points: 100,
    closed: true,
    tasks: [TASK],
    ...overrides,
  }
}

describe('<DayDetail>', () => {
  it('muestra la fecha, el rendimiento y las tareas con su cuadrante y ámbito', () => {
    render(<DayDetail day="2026-10-28" detail={detail()} />)

    expect(screen.getByRole('heading', { name: 'Miércoles, 28 de octubre' })).toBeInTheDocument()
    expect(screen.getByText(/1 de 3/)).toBeInTheDocument()
    expect(screen.getByText('Resolver la caída')).toBeInTheDocument()
    expect(screen.getByText('+100 PTS')).toBeInTheDocument()
  })

  it('anuncia la meta y la misión cumplidas, y oculta los puntos sin modo arcade', () => {
    render(
      <DayDetail
        day="2026-10-28"
        detail={detail({ goal_met: true, mission_cleared: true, points: null })}
      />,
    )

    expect(screen.getByText('Meta cumplida')).toBeInTheDocument()
    expect(screen.getByText('Misión cumplida')).toBeInTheDocument()
    expect(screen.queryByText(/PTS/)).not.toBeInTheDocument()
  })

  it('un día de descanso lo dice con texto', () => {
    render(<DayDetail day="2026-10-28" detail={detail({ active: false })} />)

    expect(screen.getByText('Día de descanso')).toBeInTheDocument()
  })

  it('si las tareas ya no existen, lo explica en vez de una lista vacía', () => {
    render(<DayDetail day="2026-10-28" detail={detail({ tasks: [], completed_count: 2 })} />)

    expect(screen.getByText(/ya no están disponibles/i)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('un día sin documento dice que no hubo actividad', () => {
    render(<DayDetail day="2026-10-27" detail={undefined} />)

    expect(screen.getByText('Sin actividad este día.')).toBeInTheDocument()
  })

  it('avisa mientras carga y si falla', () => {
    const { rerender } = render(<DayDetail day="2026-10-28" detail={undefined} loading />)
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i)

    rerender(<DayDetail day="2026-10-28" detail={undefined} failed />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i)
  })
})
