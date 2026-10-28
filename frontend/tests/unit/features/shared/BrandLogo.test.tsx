import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandLogo } from '../../../../src/features/shared/BrandLogo'

describe('<BrandLogo>', () => {
  it('pinta una imagen decorativa: sin texto alternativo y fuera del árbol de accesibilidad', () => {
    render(<BrandLogo />)

    const logo = screen.getByTestId('brand-logo')
    expect(logo.tagName).toBe('IMG')
    expect(logo).toHaveAttribute('alt', '')
    // An empty alt makes the image presentational: a screen reader does not announce it.
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('reserva su hueco antes de cargar con width y height fijos', () => {
    render(<BrandLogo />)

    const logo = screen.getByTestId('brand-logo')
    expect(Number(logo.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(logo.getAttribute('height'))).toBeGreaterThan(0)
  })

  it('apunta a un fichero de imagen', () => {
    render(<BrandLogo />)

    expect(screen.getByTestId('brand-logo').getAttribute('src')).toMatch(/logo.*\.png$/)
  })
})
