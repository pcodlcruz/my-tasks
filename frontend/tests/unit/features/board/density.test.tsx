import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../../src/api/types'

vi.mock('../../../../src/api/tasks', () => ({
  useTogglePin: () => ({ togglePin: vi.fn(), isPending: false }),
  useCompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useTrashTask: () => ({ mutate: vi.fn(), isPending: false }),
}))

const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8')

const SPACING_VARIABLES = ['card-padding', 'card-gap', 'card-inner-gap', 'quadrant-padding']

const TASK: Task = {
  id: 't1',
  title: 'Tarea de prueba',
  description: 'Detalle',
  urgent: true,
  important: true,
  quadrant: 'do_now',
  scope: 'work',
  pinned: false,
  status: 'active',
  in_trash: false,
  created_at: '2026-10-24T10:00:00Z',
  updated_at: '2026-10-24T10:00:00Z',
  completed_at: null,
  trashed_at: null,
  purge_at: null,
}

function variablesOf(selector: string): Record<string, number> {
  const start = CSS.indexOf(selector)
  expect(start, `Falta ${selector} en index.css`).toBeGreaterThanOrEqual(0)
  const body = CSS.slice(CSS.indexOf('{', start) + 1, CSS.indexOf('}', start))
  const result: Record<string, number> = {}
  for (const match of body.matchAll(/--([a-z-]+)\s*:\s*([\d.]+)rem\s*;/g)) {
    result[match[1] as string] = Number(match[2])
  }
  return result
}

describe('densidad compacta', () => {
  it('las variables compactas de espaciado son menores que las de la densidad cómoda', () => {
    const comfortable = variablesOf(':root {')
    const compact = variablesOf(":root[data-density='compact']")

    for (const name of SPACING_VARIABLES) {
      expect(comfortable[name], `--${name} cómoda`).toBeGreaterThan(0)
      expect(compact[name], `--${name} compacta`).toBeLessThan(comfortable[name] as number)
    }
  })

  it('la densidad cómoda conserva el espaciado original (1 rem de relleno, 0,75 rem entre tarjetas)', () => {
    const comfortable = variablesOf(':root {')

    expect(comfortable['card-padding']).toBe(1)
    expect(comfortable['quadrant-padding']).toBe(1)
    expect(comfortable['card-gap']).toBe(0.75)
  })

  it('las tarjetas toman su relleno y separación de las variables de densidad', async () => {
    const { TaskCard } = await import('../../../../src/features/board/TaskCard')

    render(<TaskCard task={TASK} onEdit={vi.fn()} />)

    const card = screen.getByRole('article')
    expect(card.className).toContain('p-[var(--card-padding)]')
    expect(card.innerHTML).toContain('var(--card-inner-gap)')
  })

  it('los cuadrantes toman su relleno de la variable de densidad', async () => {
    const { Quadrant } = await import('../../../../src/features/board/Quadrant')

    render(
      <Quadrant quadrant="do_now" count={1}>
        <p>contenido</p>
      </Quadrant>,
    )

    expect(screen.getByText('contenido').parentElement?.className).toContain(
      'p-[var(--quadrant-padding)]',
    )
  })
})
