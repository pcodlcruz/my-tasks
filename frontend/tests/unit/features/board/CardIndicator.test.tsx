import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CardIndicator } from '../../../../src/features/board/CardIndicator'

function renderIndicator(): HTMLElement {
  render(
    <div>
      <p>
        <CardIndicator label="Programada">
          <svg data-icon="calendar" />
        </CardIndicator>
        Preparar la demo
      </p>
      <button type="button">Fuera</button>
    </div>,
  )
  const indicator = screen.getByText('Programada').parentElement
  if (indicator === null) throw new Error('No indicator')
  return indicator
}

function tooltip(): HTMLElement | null {
  return screen.queryByRole('tooltip', { hidden: true })
}

describe('<CardIndicator>', () => {
  it('da el texto accesible en «sr-only» y el icono es decorativo', () => {
    const indicator = renderIndicator()

    expect(screen.getByText('Programada')).toHaveClass('sr-only')
    expect(indicator.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(tooltip()).not.toBeInTheDocument()
  })

  it('no es una parada del tabulador ni un control', () => {
    const indicator = renderIndicator()

    expect(indicator).not.toHaveAttribute('tabindex')
    expect(indicator).not.toHaveAttribute('role')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('muestra el tooltip al pasar el puntero y lo quita al salir', async () => {
    const indicator = renderIndicator()

    await userEvent.hover(indicator)
    expect(tooltip()).toHaveTextContent('Programada')

    await userEvent.unhover(indicator)
    expect(tooltip()).not.toBeInTheDocument()
  })

  it('el tooltip no se va mientras el puntero está encima de él', async () => {
    const indicator = renderIndicator()

    await userEvent.hover(indicator)
    const bubble = tooltip()
    if (bubble === null) throw new Error('No tooltip')
    await userEvent.hover(bubble)

    expect(tooltip()).toBeInTheDocument()
  })

  it('al tocarlo se abre y al volver a tocarlo se cierra', () => {
    const indicator = renderIndicator()

    fireEvent.click(indicator)
    expect(tooltip()).toHaveTextContent('Programada')

    fireEvent.click(indicator)
    expect(tooltip()).not.toBeInTheDocument()
  })

  it('«Escape» lo cierra', async () => {
    const indicator = renderIndicator()
    fireEvent.click(indicator)

    await userEvent.keyboard('{Escape}')

    expect(tooltip()).not.toBeInTheDocument()
  })

  it('tocar fuera lo cierra', async () => {
    const indicator = renderIndicator()
    fireEvent.click(indicator)

    await userEvent.click(screen.getByRole('button', { name: 'Fuera' }))

    expect(tooltip()).not.toBeInTheDocument()
  })

  it('el tooltip lleva «aria-hidden» para que el texto no se lea dos veces', () => {
    const indicator = renderIndicator()
    fireEvent.click(indicator)

    expect(tooltip()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByText('Programada')).toHaveLength(2)
  })
})
