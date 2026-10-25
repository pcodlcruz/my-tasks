import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Avatar as AvatarData } from '../../../../src/api/types'
import { Avatar } from '../../../../src/features/profile/Avatar'

const INITIALS: AvatarData = { kind: 'initials', preset: null, version: 0 }
const ZORRO: AvatarData = { kind: 'preset', preset: 'avatar-02', version: 1 }

describe('<Avatar>', () => {
  it('sin avatar elegido muestra las iniciales del nombre', () => {
    render(<Avatar avatar={INITIALS} name="Ana Cruz" seed="uid-1" />)

    expect(screen.getByRole('img', { name: /iniciales AC/i })).toHaveTextContent('AC')
  })

  it('las iniciales salen del correo si no hay nombre', () => {
    render(<Avatar avatar={INITIALS} name="" email="bob.smith@example.com" seed="uid-1" />)

    expect(screen.getByRole('img', { name: /iniciales BS/i })).toBeInTheDocument()
  })

  it('un avatar del catálogo se muestra con su nombre como texto alternativo', () => {
    render(<Avatar avatar={ZORRO} name="Ana Cruz" seed="uid-1" />)

    const image = screen.getByRole('img', { name: 'Zorro' })
    expect(image.tagName).toBe('IMG')
    expect(image.getAttribute('src')).toBeTruthy()
  })

  it('en modo decorativo no anuncia nada (el nombre ya va en el enlace que lo contiene)', () => {
    const { container } = render(<Avatar avatar={ZORRO} name="Ana Cruz" seed="uid-1" decorative />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('las iniciales decorativas tampoco se anuncian', () => {
    const { container } = render(<Avatar avatar={INITIALS} name="Ana Cruz" seed="u" decorative />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container).toHaveTextContent('AC')
  })

  it('mientras carga el perfil muestra las iniciales (nunca un hueco) y se marca como ocupado', () => {
    const { container } = render(
      <Avatar avatar={undefined} name="Ana Cruz" seed="uid-1" isLoading />,
    )

    expect(container).toHaveTextContent('AC')
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  })

  it('sin perfil (error) también muestra las iniciales', () => {
    const { container } = render(<Avatar avatar={undefined} name="Ana Cruz" seed="uid-1" />)

    expect(container).toHaveTextContent('AC')
    expect(container.firstElementChild).not.toHaveAttribute('aria-busy')
  })

  it('un identificador que no es del catálogo cae en las iniciales', () => {
    render(
      <Avatar avatar={{ kind: 'preset', preset: 'avatar-99', version: 1 }} name="Ana" seed="u" />,
    )

    expect(screen.getByRole('img', { name: /iniciales A/i })).toBeInTheDocument()
  })

  it('una imagen subida se muestra con su blob: URL', () => {
    render(
      <Avatar
        avatar={{ kind: 'upload', preset: null, version: 3 }}
        name="Ana"
        seed="u"
        imageUrl="blob:imagen"
      />,
    )

    const image = screen.getByRole('img', { name: 'Tu imagen de avatar' })
    expect(image.tagName).toBe('IMG')
    expect(image).toHaveAttribute('src', 'blob:imagen')
  })

  it('una imagen subida decorativa no se anuncia', () => {
    const { container } = render(
      <Avatar
        avatar={{ kind: 'upload', preset: null, version: 3 }}
        name="Ana"
        seed="u"
        imageUrl="blob:imagen"
        decorative
      />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('una imagen subida que aún no se ha descargado muestra las iniciales', () => {
    render(<Avatar avatar={{ kind: 'upload', preset: null, version: 3 }} name="Ana" seed="u" />)

    expect(screen.getByRole('img', { name: /iniciales A/i })).toBeInTheDocument()
  })

  it('la URL de una imagen solo se usa si el avatar es una imagen subida', () => {
    render(<Avatar avatar={INITIALS} name="Ana" seed="u" imageUrl="blob:imagen" />)

    expect(screen.getByRole('img', { name: /iniciales A/i })).toBeInTheDocument()
  })

  it('el color de las iniciales es el mismo para el mismo uid', () => {
    const { container: first } = render(<Avatar avatar={INITIALS} name="Ana" seed="uid-7" />)
    const { container: second } = render(<Avatar avatar={INITIALS} name="Bob" seed="uid-7" />)

    expect(first.firstElementChild?.className).toBe(second.firstElementChild?.className)
  })

  it('tiene dos tamaños: 32 px y 96 px', () => {
    const { container: small } = render(<Avatar avatar={INITIALS} name="A" seed="u" size="sm" />)
    const { container: large } = render(<Avatar avatar={INITIALS} name="A" seed="u" size="lg" />)

    expect(small.firstElementChild?.className).toContain('h-8 w-8')
    expect(large.firstElementChild?.className).toContain('h-24 w-24')
  })

  it('es redondo', () => {
    const { container } = render(<Avatar avatar={ZORRO} name="Ana" seed="u" />)

    expect(container.firstElementChild?.className).toContain('rounded-full')
  })
})
