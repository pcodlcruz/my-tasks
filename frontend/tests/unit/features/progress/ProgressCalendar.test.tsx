import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ProgressDay } from '../../../../src/api/types'
import { calendarRange, weekdayIndex } from '../../../../src/features/progress/calendar'
import { ProgressCalendar } from '../../../../src/features/progress/ProgressCalendar'

// Saturday 31 October 2026.
const TODAY = '2026-10-31'

function day(date: string, overrides: Partial<ProgressDay> = {}): ProgressDay {
  return {
    date,
    active: true,
    goal: 3,
    completed_count: 0,
    goal_met: false,
    mission_cleared: false,
    points: null,
    closed: true,
    ...overrides,
  }
}

function cells(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-cell]'))
}

describe('calendar range', () => {
  it('abarca 12 semanas completas, de lunes a domingo, acabando en la semana de hoy', () => {
    const { start, end } = calendarRange(TODAY)

    expect(weekdayIndex(start)).toBe(0)
    expect(weekdayIndex(end)).toBe(6)
    expect(end).toBe('2026-11-01')
    expect(start).toBe('2026-08-10')
  })
})

describe('<ProgressCalendar>', () => {
  it('pinta 84 celdas, con la leyenda', () => {
    const { container } = render(
      <ProgressCalendar today={TODAY} days={[]} selected={null} onSelect={vi.fn()} />,
    )

    expect(cells(container)).toHaveLength(84)
    expect(screen.getByText('Meta cumplida')).toBeInTheDocument()
    expect(screen.getByText('Día de descanso')).toBeInTheDocument()
    expect(screen.getByText('Sin actividad')).toBeInTheDocument()
    expect(screen.getByText('Futuro')).toBeInTheDocument()
  })

  it('distingue meta cumplida, parcial, descanso y vacío por texto además del color', () => {
    render(
      <ProgressCalendar
        today={TODAY}
        selected={null}
        onSelect={vi.fn()}
        days={[
          day('2026-10-28', { completed_count: 3, goal_met: true }),
          day('2026-10-29', { completed_count: 1 }),
          day('2026-10-30', { active: false }),
        ]}
      />,
    )

    expect(
      screen.getByRole('button', { name: /28 de octubre.*meta cumplida, 3 tareas/i }),
    ).toHaveAttribute('data-state', 'goal')
    expect(
      screen.getByRole('button', { name: /29 de octubre.*meta sin cumplir, 1 tarea$/i }),
    ).toHaveAttribute('data-state', 'partial')
    expect(screen.getByRole('button', { name: /30 de octubre.*día de descanso/i })).toHaveAttribute(
      'data-state',
      'rest',
    )
    expect(screen.getByRole('button', { name: /27 de octubre.*sin actividad/i })).toHaveAttribute(
      'data-state',
      'empty',
    )
  })

  it('los días futuros no se pueden elegir', () => {
    const { container } = render(
      <ProgressCalendar today={TODAY} days={[]} selected={null} onSelect={vi.fn()} />,
    )

    const future = container.querySelector('[data-state="future"]')
    expect(future?.tagName).toBe('SPAN')
    expect(screen.queryByRole('button', { name: /1 de noviembre/i })).not.toBeInTheDocument()
  })

  it('elegir un día lo avisa y lo marca como pulsado', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <ProgressCalendar today={TODAY} days={[]} selected={null} onSelect={onSelect} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /28 de octubre/i }))
    rerender(<ProgressCalendar today={TODAY} days={[]} selected="2026-10-28" onSelect={onSelect} />)

    expect(onSelect).toHaveBeenCalledWith('2026-10-28')
    expect(screen.getByRole('button', { name: /28 de octubre/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('tiene una sola parada de tabulador y las flechas mueven entre días', async () => {
    const { container } = render(
      <ProgressCalendar today={TODAY} days={[]} selected="2026-10-28" onSelect={vi.fn()} />,
    )
    const stops = cells(container).filter((cell) => cell.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
    expect(stops[0]).toHaveAttribute('data-day', '2026-10-28')

    stops[0]?.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toHaveAttribute('data-day', '2026-10-29')
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toHaveAttribute('data-day', '2026-10-22')
    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toHaveAttribute('data-day', '2026-10-21')
  })

  it('las flechas no pasan de hoy', async () => {
    const { container } = render(
      <ProgressCalendar today={TODAY} days={[]} selected={TODAY} onSelect={vi.fn()} />,
    )
    container.querySelector<HTMLElement>(`[data-day="${TODAY}"]`)?.focus()

    await userEvent.keyboard('{ArrowDown}{ArrowRight}')

    expect(document.activeElement).toHaveAttribute('data-day', TODAY)
  })
})
