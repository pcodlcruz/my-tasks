import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Progress } from '../../../../src/api/types'
import { DayScoreboard } from '../../../../src/features/progress/DayScoreboard'

const PROGRESS: Progress = {
  today: '2026-10-31',
  goal: 3,
  completed_count: 0,
  goal_met: false,
  is_active_day: true,
  mission: { task_ids: [], completed_ids: [], cleared: false },
  show_review: false,
  streak: 0,
  streak_at_stake: false,
  arcade: { score: 0, level: 1, level_name: 'Novato', next_level_at: 500, points_today: 0 },
  last_day: null,
  announcements: [],
  notices: [],
}

function progress(overrides: Partial<Progress> = {}): Progress {
  return { ...PROGRESS, ...overrides }
}

interface RenderOptions {
  progress?: Progress
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  onOpenReview?: () => void
}

function renderScoreboard({
  progress: data,
  isLoading = false,
  isError = false,
  onRetry = vi.fn(),
  onOpenReview = vi.fn(),
}: RenderOptions = {}): ReturnType<typeof render> {
  return render(
    <DayScoreboard
      progress={data}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      onOpenReview={onOpenReview}
    />,
  )
}

// The figure is split in spans ("HOY <span>2</span>/3"): find the innermost element whose whole
// text is the given one.
function textMatcher(text: string): (content: string, element: Element | null) => boolean {
  return (_content, element) =>
    element?.textContent === text &&
    Array.from(element.children).every((child) => child.textContent !== text)
}

function scoreboard(): HTMLElement {
  return screen.getByRole('region', { name: 'Marcador del día' })
}

describe('<DayScoreboard>', () => {
  it.each([
    [0, 3, 'HOY 0/3', '0 de 3 tareas completadas hoy'],
    [2, 3, 'HOY 2/3', '2 de 3 tareas completadas hoy'],
    [3, 3, 'HOY 3/3', '3 de 3 tareas completadas hoy'],
    [5, 3, 'HOY 5/3', '5 de 3 tareas completadas hoy'],
    [0, 1, 'HOY 0/1', '0 de 1 tarea completada hoy'],
  ])('%i de %i: cifra pixel «%s» y texto accesible «%s»', (completed, goal, pixel, text) => {
    renderScoreboard({
      progress: progress({ completed_count: completed, goal, goal_met: completed >= goal }),
    })

    const figure = screen.getByText(textMatcher(pixel))
    expect(figure).toHaveAttribute('aria-hidden', 'true')
    expect(figure.className).toMatch(/font-pixel/)
    expect(scoreboard()).toHaveTextContent(text)
  })

  it('con la meta cumplida lo indica con una marca y texto, sin celebrarlo aquí', () => {
    renderScoreboard({ progress: progress({ completed_count: 3, goal_met: true }) })

    expect(scoreboard()).toHaveTextContent('✓ Meta cumplida')
    // The celebrations (S3-c) announce it, once; the scoreboard does not repeat it.
    expect(scoreboard()).not.toHaveTextContent('¡FASE SUPERADA!')
    expect(scoreboard().querySelector('[aria-live]')).toBeNull()
  })

  it('sin la meta cumplida no muestra la marca', () => {
    renderScoreboard({ progress: progress({ completed_count: 2 }) })

    expect(scoreboard()).not.toHaveTextContent('Meta cumplida')
  })

  it('por encima de la meta la cifra de más va en el tono extra', () => {
    renderScoreboard({ progress: progress({ completed_count: 5, goal_met: true }) })

    expect(screen.getByText(textMatcher('HOY 5/3')).innerHTML).toMatch(/text-energy-extra/)
  })

  it('muestra la racha con «en juego» si aún no se ha cumplido la meta', () => {
    renderScoreboard({ progress: progress({ streak: 4, streak_at_stake: true }) })

    expect(scoreboard()).toHaveTextContent('Racha 4 días')
    expect(screen.getByText('en juego')).toBeInTheDocument()
  })

  it('una racha de 1 día va en singular y sin «en juego» si ya está a salvo', () => {
    renderScoreboard({
      progress: progress({ streak: 1, streak_at_stake: false, completed_count: 3, goal_met: true }),
    })

    expect(scoreboard()).toHaveTextContent('Racha 1 día')
    expect(screen.queryByText('en juego')).not.toBeInTheDocument()
  })

  it('sin racha no la muestra', () => {
    renderScoreboard({ progress: progress() })

    expect(scoreboard()).not.toHaveTextContent(/racha/i)
  })

  it('en un día no activo avisa de que la racha no cambia', () => {
    renderScoreboard({ progress: progress({ is_active_day: false, streak: 2 }) })

    expect(scoreboard()).toHaveTextContent('Hoy no es día activo: la racha no cambia')
  })

  it('con el modo arcade desactivado no usa la fuente pixel: «Hoy 2 de 3»', () => {
    renderScoreboard({ progress: progress({ completed_count: 2, arcade: null }) })

    expect(screen.queryByText(textMatcher('HOY 2/3'))).not.toBeInTheDocument()
    const figure = screen.getByText('Hoy 2 de 3')
    expect(figure.className).not.toMatch(/font-pixel/)
    expect(scoreboard()).toHaveTextContent('2 de 3 tareas completadas hoy')
  })

  it('mientras carga muestra un esqueleto discreto', () => {
    renderScoreboard({ isLoading: true })

    expect(screen.getByRole('status', { name: 'Cargando progreso' })).toBeInTheDocument()
  })

  it('si falla la carga muestra un aviso discreto con «Reintentar» (FR-034)', async () => {
    const onRetry = vi.fn()
    renderScoreboard({ isError: true, onRetry })

    expect(scoreboard()).toHaveTextContent('No se pudo cargar tu progreso.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('si falla una recarga sigue mostrando el último marcador junto al aviso', () => {
    renderScoreboard({ progress: progress({ completed_count: 2 }), isError: true })

    expect(screen.getByText(textMatcher('HOY 2/3'))).toBeInTheDocument()
    expect(scoreboard()).toHaveTextContent('No se pudo actualizar tu progreso.')
  })

  describe('inicio de jornada y misión', () => {
    it('«PULSA START» reabre la pantalla de inicio de jornada', async () => {
      const onOpenReview = vi.fn()
      renderScoreboard({ progress: progress(), onOpenReview })

      await userEvent.click(screen.getByRole('button', { name: /PULSA START/ }))

      expect(onOpenReview).toHaveBeenCalledOnce()
    })

    it('sin misión no muestra su recuento', () => {
      renderScoreboard({ progress: progress() })

      expect(scoreboard()).not.toHaveTextContent(/misión/i)
    })

    it('con misión muestra cuántas lleva completadas, con estrella y texto', () => {
      renderScoreboard({
        progress: progress({
          mission: { task_ids: ['a', 'b', 'c'], completed_ids: ['a'], cleared: false },
        }),
      })

      expect(scoreboard()).toHaveTextContent('Misión 1/3')
      expect(scoreboard()).toHaveTextContent('★')
    })

    it('con la misión cumplida lo dice', () => {
      renderScoreboard({
        progress: progress({
          mission: { task_ids: ['a', 'b'], completed_ids: ['a', 'b'], cleared: true },
        }),
      })

      expect(scoreboard()).toHaveTextContent('Misión 2/2 cumplida')
    })
  })

  describe('modo arcade', () => {
    const ARCADE = {
      score: 3450,
      level: 3,
      level_name: 'Jugador',
      next_level_at: 6000,
      points_today: 800,
    }

    it('muestra la puntuación, el nivel con su nombre y lo que falta para el siguiente', () => {
      renderScoreboard({ progress: progress({ arcade: ARCADE }) })

      expect(scoreboard()).toHaveTextContent('NIVEL 3 · Jugador')
      expect(screen.getByText('3.450 PTS')).toHaveAttribute('aria-hidden', 'true')
      expect(scoreboard()).toHaveTextContent('3.450 puntos')
      expect(scoreboard()).toHaveTextContent('Faltan 2.550 para el nivel 4')
      expect(scoreboard()).toHaveTextContent('+800 hoy')
    })

    it('en el último nivel no habla de un siguiente', () => {
      renderScoreboard({
        progress: progress({
          arcade: { ...ARCADE, level: 10, level_name: 'Jefe final', next_level_at: null },
        }),
      })

      expect(scoreboard()).toHaveTextContent('NIVEL 10 · Jefe final')
      expect(scoreboard()).toHaveTextContent('Nivel máximo')
      expect(scoreboard()).not.toHaveTextContent('Faltan')
    })

    it('desactivado no muestra puntuación ni nivel, pero sí la meta, el progreso y la racha', () => {
      renderScoreboard({
        progress: progress({ arcade: null, completed_count: 2, streak: 3, streak_at_stake: true }),
      })

      expect(scoreboard()).not.toHaveTextContent(/PTS|puntos|NIVEL/)
      expect(scoreboard()).toHaveTextContent('2 de 3 tareas completadas hoy')
      expect(scoreboard()).toHaveTextContent('Racha 3 días')
    })
  })
})
