import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AchievementStatus } from '../../../../src/api/types'
import { TrophyRoom } from '../../../../src/features/progress/TrophyRoom'

const ACHIEVEMENTS: AchievementStatus[] = [
  {
    id: 'first_coin',
    name: 'Primera moneda',
    condition: 'Completa tu primera tarea.',
    unlocked_at: '2026-10-03T09:00:00Z',
  },
  {
    id: 'tasks_500',
    name: '500 tareas',
    condition: 'Completa 500 tareas distintas.',
    unlocked_at: null,
  },
]

describe('<TrophyRoom>', () => {
  it('muestra el catálogo con los conseguidos y su fecha', () => {
    render(<TrophyRoom achievements={ACHIEVEMENTS} />)

    expect(screen.getByText('1 / 2 desbloqueados')).toBeInTheDocument()
    expect(screen.getByText('Primera moneda')).toBeInTheDocument()
    expect(screen.getByText('3 oct')).toBeInTheDocument()
  })

  it('un logro bloqueado lo dice con texto y enseña su condición', () => {
    render(<TrophyRoom achievements={ACHIEVEMENTS} />)

    expect(screen.getByText('Bloqueado')).toBeInTheDocument()
    expect(screen.getByText('Completa 500 tareas distintas.')).toBeInTheDocument()
  })
})
