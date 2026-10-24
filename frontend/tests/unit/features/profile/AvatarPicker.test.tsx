import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const onSelect = vi.fn()
const onClose = vi.fn()

async function renderPicker(currentPreset: string | null = 'avatar-02'): Promise<void> {
  const { AvatarPicker } = await import('../../../../src/features/profile/AvatarPicker')
  render(<AvatarPicker currentPreset={currentPreset} onSelect={onSelect} onClose={onClose} />)
}

function tile(name: string): HTMLElement {
  return within(screen.getByRole('radiogroup', { name: 'Avatares del catálogo' })).getByRole(
    'radio',
    { name },
  )
}

describe('<AvatarPicker>', () => {
  beforeEach(() => {
    onSelect.mockReset()
    onClose.mockReset()
  })

  it('es un diálogo modal con título y la rejilla de los 12 avatares', async () => {
    await renderPicker()

    const dialog = screen.getByRole('dialog', { name: 'Elegir avatar' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const group = within(dialog).getByRole('radiogroup', { name: 'Avatares del catálogo' })
    expect(within(group).getAllByRole('radio')).toHaveLength(12)
    for (const name of [
      'Búho',
      'Zorro',
      'Oso',
      'Gato',
      'Rana',
      'Pingüino',
      'Ballena',
      'Panda',
      'Conejo',
      'Tortuga',
      'Delfín',
      'Mariposa',
    ]) {
      expect(tile(name)).toBeInTheDocument()
    }
  })

  it('el avatar actual aparece seleccionado y con una marca visible más allá del color', async () => {
    await renderPicker('avatar-02')

    expect(tile('Zorro')).toBeChecked()
    expect(tile('Búho')).not.toBeChecked()
    const selected = tile('Zorro').closest('label') as HTMLElement
    expect(within(selected).getByText('✓')).toBeInTheDocument()
    expect(within(tile('Búho').closest('label') as HTMLElement).queryByText('✓')).toBeNull()
  })

  it('cada avatar lleva su nombre visible', async () => {
    await renderPicker()

    for (const name of ['Búho', 'Mariposa']) {
      expect(within(tile(name).closest('label') as HTMLElement).getByText(name)).toBeVisible()
    }
  })

  it('se puede recorrer con las flechas del teclado', async () => {
    await renderPicker('avatar-02')

    tile('Zorro').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tile('Oso')).toBeChecked()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(tile('Búho')).toBeChecked()
  })

  it('«Guardar avatar» entrega el elegido', async () => {
    await renderPicker('avatar-02')

    await userEvent.click(tile('Rana'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('avatar-05')
  })

  it('«Guardar avatar» está desactivado mientras no cambie la elección', async () => {
    await renderPicker('avatar-02')
    expect(screen.getByRole('button', { name: 'Guardar avatar' })).toBeDisabled()

    await userEvent.click(tile('Oso'))

    expect(screen.getByRole('button', { name: 'Guardar avatar' })).toBeEnabled()
  })

  it('sin avatar elegido no hay nada seleccionado y no se puede guardar', async () => {
    await renderPicker(null)

    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Guardar avatar' })).toBeDisabled()
  })

  it('«Cancelar» y Escape lo cierran sin elegir nada', async () => {
    await renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('al cerrarlo, el foco vuelve al botón que lo abrió', async () => {
    const { AvatarPicker } = await import('../../../../src/features/profile/AvatarPicker')
    function Host(): JSX.Element {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Elegir avatar
          </button>
          {open && (
            <AvatarPicker currentPreset={null} onSelect={vi.fn()} onClose={() => setOpen(false)} />
          )}
        </>
      )
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Elegir avatar' })
    opener.focus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('el foco entra en el diálogo al abrirlo y no se escapa con Tab', async () => {
    await renderPicker('avatar-02')

    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    for (let step = 0; step < 6; step += 1) await userEvent.tab()

    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })
})
