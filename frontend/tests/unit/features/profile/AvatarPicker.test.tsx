import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const onSelect = vi.fn()
const onClose = vi.fn()
const onUpload = vi.fn()

async function renderPicker(currentPreset: string | null = 'avatar-02'): Promise<void> {
  const { AvatarPicker } = await import('../../../../src/features/profile/AvatarPicker')
  render(
    <AvatarPicker
      currentPreset={currentPreset}
      onSelect={onSelect}
      onUpload={onUpload}
      onClose={onClose}
    />,
  )
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
    onUpload.mockReset()
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
            <AvatarPicker
              currentPreset={null}
              onSelect={vi.fn()}
              onUpload={vi.fn()}
              onClose={() => setOpen(false)}
            />
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

// jsdom has no canvas nor image decoding: stand-ins are enough, the cropper has its own tests.
function stubCropperBrowser(): void {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        imageSmoothingQuality: 'high',
      }) as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    callback(new Blob(['pixels'], { type: type ?? 'image/png' }))
  })
}

function picture(name = 'foto.png', type = 'image/png', bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

async function openUploadTab(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: 'Subir imagen' }))
}

function chooseFile(file: File): void {
  // `change` directly: userEvent.upload would drop files that do not match `accept`, and the
  // point here is what the component does when one gets through anyway (drag and drop, paste).
  fireEvent.change(screen.getByLabelText('Elegir archivo', { selector: 'input' }), {
    target: { files: [file] },
  })
}

describe('<AvatarPicker> · pestañas', () => {
  beforeEach(() => {
    onSelect.mockReset()
    onClose.mockReset()
    onUpload.mockReset()
  })

  it('tiene las pestañas «Catálogo» (activa) y «Subir imagen»', async () => {
    await renderPicker()

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Catálogo', 'Subir imagen'])
    expect(screen.getByRole('tab', { name: 'Catálogo' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Subir imagen' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('radiogroup', { name: 'Avatares del catálogo' })).toBeVisible()
  })

  it('se cambia de pestaña con el ratón y con las flechas del teclado', async () => {
    await renderPicker()
    const catalog = screen.getByRole('tab', { name: 'Catálogo' })

    catalog.focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Subir imagen' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Subir imagen' })).toHaveFocus()
    expect(
      screen.queryByRole('radiogroup', { name: 'Avatares del catálogo' }),
    ).not.toBeInTheDocument()

    await userEvent.keyboard('{ArrowLeft}')

    expect(catalog).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('radiogroup', { name: 'Avatares del catálogo' })).toBeVisible()
  })

  it('«Subir imagen» muestra «Elegir archivo» y los formatos admitidos', async () => {
    await renderPicker()

    await openUploadTab()

    expect(screen.getByRole('tabpanel', { name: 'Subir imagen' })).toBeVisible()
    expect(screen.getByText('JPEG, PNG o WebP, hasta 2 MB')).toBeInTheDocument()
    const input = screen.getByLabelText('Elegir archivo', { selector: 'input' })
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(screen.queryByRole('button', { name: 'Guardar avatar' })).not.toBeInTheDocument()
  })

  it('en el catálogo, «Guardar avatar» conserva su comportamiento', async () => {
    await renderPicker('avatar-02')

    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Avatares del catálogo' })).getByRole('radio', {
        name: 'Rana',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('avatar-05')
    expect(onUpload).not.toHaveBeenCalled()
  })
})

describe('<AvatarPicker> · subir imagen', () => {
  beforeEach(() => {
    onSelect.mockReset()
    onClose.mockReset()
    onUpload.mockReset()
    stubCropperBrowser()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function openCropper(file = picture()): Promise<void> {
    await renderPicker()
    await openUploadTab()
    chooseFile(file)
    await screen.findByRole('application', { name: /encuadre/i })
  }

  it('rechaza en el cliente un tipo que no es JPEG, PNG ni WebP, sin enviar nada', async () => {
    await renderPicker()
    await openUploadTab()

    chooseFile(picture('nota.txt', 'text/plain'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El archivo debe ser una imagen JPEG, PNG o WebP.',
    )
    expect(screen.queryByRole('application')).not.toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it.each([
    ['un GIF', 'animacion.gif', 'image/gif'],
    ['un SVG', 'dibujo.svg', 'image/svg+xml'],
    ['un PDF', 'documento.pdf', 'application/pdf'],
  ])('rechaza %s', async (_, name, type) => {
    await renderPicker()
    await openUploadTab()

    chooseFile(picture(name, type))

    expect(await screen.findByRole('alert')).toHaveTextContent('JPEG, PNG o WebP')
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('rechaza en el cliente un archivo de más de 2 MB, sin enviar nada', async () => {
    await renderPicker()
    await openUploadTab()

    chooseFile(picture('grande.png', 'image/png', 2 * 1024 * 1024 + 1))

    expect(await screen.findByRole('alert')).toHaveTextContent('La imagen supera los 2 MB.')
    expect(screen.queryByRole('application')).not.toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('un archivo de exactamente 2 MB se acepta', async () => {
    await openCropper(picture('justo.png', 'image/png', 2 * 1024 * 1024))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tras elegir un archivo válido pasa al recortador', async () => {
    await openCropper()

    expect(screen.getByRole('slider', { name: 'Zoom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar avatar' })).toBeEnabled()
  })

  it('«Guardar avatar» envía la imagen recortada y cierra el selector al terminar', async () => {
    onUpload.mockResolvedValue(undefined)
    await openCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1))
    expect(onUpload.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('mientras sube muestra «Subiendo…» y no deja cerrar ni volver a enviar', async () => {
    let finish: () => void = () => undefined
    onUpload.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    await openCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))

    const uploading = await screen.findByRole('button', { name: /Subiendo/ })
    expect(uploading).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(onUpload).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['avatar_too_large', 'La imagen supera los 2 MB.'],
    ['avatar_unsupported', 'La imagen no es válida. Usa un archivo JPEG, PNG o WebP.'],
    ['avatar_rate_limited', 'Has subido demasiadas imágenes. Espera unos minutos.'],
  ])('el error %s del servidor se explica y el selector sigue abierto', async (code, message) => {
    const { ApiClientError } = await import('../../../../src/lib/apiClient')
    onUpload.mockRejectedValue(new ApiClientError({ code, message: 'texto del servidor' }))
    await openCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).not.toHaveTextContent('texto del servidor')
    expect(onClose).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Guardar avatar' })).toBeEnabled()
  })

  it('un fallo de red se explica y permite volver a intentarlo', async () => {
    onUpload
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(undefined)
    await openCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo subir la imagen. Inténtalo de nuevo.',
    )
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('el error se quita al elegir otro archivo', async () => {
    await renderPicker()
    await openUploadTab()
    chooseFile(picture('nota.txt', 'text/plain'))
    await screen.findByRole('alert')

    chooseFile(picture())

    await screen.findByRole('application', { name: /encuadre/i })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('«Cancelar» en el recortador vuelve a elegir archivo sin subir nada', async () => {
    await openCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('application')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Elegir archivo', { selector: 'input' })).toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('al volver al catálogo se conserva la elección que había', async () => {
    await renderPicker('avatar-02')
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Avatares del catálogo' })).getByRole('radio', {
        name: 'Oso',
      }),
    )

    await openUploadTab()
    await userEvent.click(screen.getByRole('tab', { name: 'Catálogo' }))

    expect(
      within(screen.getByRole('radiogroup', { name: 'Avatares del catálogo' })).getByRole('radio', {
        name: 'Oso',
      }),
    ).toBeChecked()
  })
})
