import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EnergyBar } from '../../../../src/features/progress/EnergyBar'

function segments(container: HTMLElement, kind: 'filled' | 'empty' | 'extra'): number {
  return container.querySelectorAll(`[data-segment="${kind}"]`).length
}

describe('<EnergyBar>', () => {
  it.each([
    [0, 3, { filled: 0, empty: 3, extra: 0 }],
    [2, 3, { filled: 2, empty: 1, extra: 0 }],
    [3, 3, { filled: 3, empty: 0, extra: 0 }],
    [5, 3, { filled: 3, empty: 0, extra: 2 }],
  ])(
    '%i de %i: un segmento por tarea de la meta y los de más en otro tono',
    (completed, goal, expected) => {
      const { container } = render(<EnergyBar completed={completed} goal={goal} />)

      expect(segments(container, 'filled')).toBe(expected.filled)
      expect(segments(container, 'empty')).toBe(expected.empty)
      expect(segments(container, 'extra')).toBe(expected.extra)
    },
  )

  it('muestra como mucho 10 segmentos extra y el resto como «+N»', () => {
    const { container, getByText } = render(<EnergyBar completed={18} goal={3} />)

    expect(segments(container, 'extra')).toBe(10)
    expect(getByText('+5')).toBeInTheDocument()
  })

  it('es decorativa: el marcador da el texto equivalente', () => {
    const { container } = render(<EnergyBar completed={2} goal={3} />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('distingue lleno y vacío por el relleno, no solo por el tono', () => {
    const { container } = render(<EnergyBar completed={1} goal={2} />)

    expect(container.querySelector('[data-segment="filled"]')?.className).toMatch(/bg-energy-fill/)
    expect(container.querySelector('[data-segment="empty"]')?.className).toMatch(/bg-surface/)
    expect(container.querySelector('[data-segment="empty"]')?.className).toMatch(
      /border-energy-empty-border/,
    )
  })
})
