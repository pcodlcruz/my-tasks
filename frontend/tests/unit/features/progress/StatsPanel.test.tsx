import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Stats } from '../../../../src/api/types'
import { StatsPanel } from '../../../../src/features/progress/StatsPanel'

const STATS: Stats = {
  best_day_count: 7,
  best_day_date: '2026-10-14',
  current_streak: 4,
  best_streak: 9,
  tasks_scored: 86,
  started_at: '2026-10-01T08:00:00Z',
  arcade: { score: 3450, level: 3, level_name: 'Jugador', achievements: [] },
}

describe('<StatsPanel>', () => {
  it('muestra la racha, el mejor día, la mejor racha y el total', () => {
    render(<StatsPanel stats={STATS} />)

    expect(screen.getByText('4 días')).toBeInTheDocument()
    expect(screen.getByText('7 tareas')).toBeInTheDocument()
    expect(screen.getByText('14 oct')).toBeInTheDocument()
    expect(screen.getByText('9 días')).toBeInTheDocument()
    expect(screen.getByText('86 tareas')).toBeInTheDocument()
  })

  it('con el modo arcade muestra el nivel y la puntuación', () => {
    render(<StatsPanel stats={STATS} />)

    expect(screen.getByText(/Nivel 3 · Jugador/)).toBeInTheDocument()
    expect(screen.getByText(/3\.450 puntos/)).toBeInTheDocument()
  })

  it('sin modo arcade no hay nivel ni puntos', () => {
    render(<StatsPanel stats={{ ...STATS, arcade: null }} />)

    expect(screen.queryByText(/Nivel/)).not.toBeInTheDocument()
    expect(screen.queryByText(/puntos/)).not.toBeInTheDocument()
  })

  it('usa el singular y un texto si aún no hay mejor día', () => {
    render(
      <StatsPanel
        stats={{
          ...STATS,
          best_day_count: 1,
          best_day_date: null,
          current_streak: 1,
          arcade: null,
        }}
      />,
    )

    expect(screen.getByText('1 día')).toBeInTheDocument()
    expect(screen.getByText('1 tarea')).toBeInTheDocument()
    expect(screen.getByText('Aún sin días')).toBeInTheDocument()
  })
})
