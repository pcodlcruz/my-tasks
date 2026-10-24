import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom has no canvas and no image decoding: both are replaced by recorders so the test can
// check what is drawn (the crop rectangle) and what is exported (a square image Blob).
const drawImage = vi.fn()
const toBlob = vi.fn()
const close = vi.fn()

interface Bitmap {
  width: number
  height: number
  close: () => void
}

function stubBrowser(bitmap: Bitmap = { width: 800, height: 600, close }): void {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        drawImage,
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        imageSmoothingQuality: 'high',
      }) as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
  ) {
    toBlob({ width: this.width, height: this.height, type })
    callback(new Blob(['pixels'], { type: type ?? 'image/png' }))
  })
}

const FILE = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })

const onConfirm = vi.fn()
const onCancel = vi.fn()

async function renderCropper(busy = false): Promise<void> {
  const { AvatarCropper } = await import('../../../../src/features/profile/AvatarCropper')
  render(<AvatarCropper file={FILE} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />)
  await screen.findByRole('application', { name: /encuadre/i })
  // The first drawing comes right after the canvas appears.
  await waitFor(() => expect(drawImage).toHaveBeenCalled())
}

// The rectangle of the source image last drawn on the preview: [sx, sy, sw, sh].
function lastCrop(): number[] {
  const [, sx, sy, sw, sh] = drawImage.mock.lastCall ?? []
  return [sx, sy, sw, sh] as number[]
}

function viewport(): HTMLElement {
  return screen.getByRole('application', { name: /encuadre/i })
}

describe('<AvatarCropper>', () => {
  beforeEach(() => {
    drawImage.mockReset()
    toBlob.mockReset()
    close.mockReset()
    onConfirm.mockReset()
    onCancel.mockReset()
    stubBrowser()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('al abrir encuadra el cuadrado más grande y centrado de la imagen', async () => {
    await renderCropper()

    // 800×600: a 600×600 square, centered horizontally.
    expect(lastCrop()).toEqual([100, 0, 600, 600])
  })

  it('con una imagen vertical, el cuadrado es el más ancho y está centrado en vertical', async () => {
    stubBrowser({ width: 300, height: 900, close })

    await renderCropper()

    expect(lastCrop()).toEqual([0, 300, 300, 300])
  })

  it('muestra una vista previa redonda del resultado', async () => {
    await renderCropper()

    const preview = screen.getByTestId('crop-preview')
    expect(preview.className).toContain('rounded-full')
    expect(preview.className).toContain('overflow-hidden')
    expect(screen.getByText('Vista previa')).toBeInTheDocument()
  })

  it('el zoom acerca el encuadre hacia el centro', async () => {
    await renderCropper()

    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })

    // Half the side: 300×300 around the center of the image (400, 300).
    expect(lastCrop()).toEqual([250, 150, 300, 300])
  })

  it('el zoom tiene un mínimo de 1 y un máximo de 3', async () => {
    await renderCropper()

    const zoom = screen.getByRole('slider', { name: 'Zoom' })

    expect(zoom).toHaveAttribute('min', '1')
    expect(zoom).toHaveAttribute('max', '3')
  })

  it('arrastrar con el ratón mueve la imagen y no se sale de los bordes', async () => {
    await renderCropper()
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })
    const before = lastCrop()

    fireEvent.pointerDown(viewport(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 140, clientY: 100 })
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 140, clientY: 100 })

    const after = lastCrop()
    expect(after[0]).toBeLessThan(before[0] as number) // dragging right shows more of the left
    expect(after[1]).toBe(before[1])
    expect(after[2]).toBe(before[2])

    fireEvent.pointerDown(viewport(), { pointerId: 1, clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 100000, clientY: 100000 })
    fireEvent.pointerUp(viewport(), { pointerId: 1 })
    expect(lastCrop()[0]).toBeGreaterThanOrEqual(0)
    expect(lastCrop()[1]).toBeGreaterThanOrEqual(0)
  })

  it('arrastrar con el dedo (puntero táctil) también mueve la imagen', async () => {
    await renderCropper()
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })
    const before = lastCrop()

    fireEvent.pointerDown(viewport(), {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    })
    fireEvent.pointerMove(viewport(), {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 50,
      clientY: 20,
    })
    fireEvent.pointerUp(viewport(), { pointerId: 7, pointerType: 'touch' })

    expect(lastCrop()[1]).toBeGreaterThan(before[1] as number) // dragging up shows lower part
  })

  it('mover el puntero sin pulsar no mueve la imagen', async () => {
    await renderCropper()
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })
    const before = lastCrop()

    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 300, clientY: 300 })

    expect(lastCrop()).toEqual(before)
  })

  it('con el teclado, las flechas mueven la imagen', async () => {
    await renderCropper()
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })
    viewport().focus()
    const start = lastCrop()

    await userEvent.keyboard('{ArrowRight}')
    const right = lastCrop()
    await userEvent.keyboard('{ArrowDown}')
    const down = lastCrop()

    expect(right[0]).toBeLessThan(start[0] as number)
    expect(down[1]).toBeLessThan(right[1] as number)
  })

  it('con el teclado, + y − cambian el zoom', async () => {
    await renderCropper()
    viewport().focus()

    await userEvent.keyboard('+')
    expect(lastCrop()[2]).toBeLessThan(600)
    const zoomed = lastCrop()[2] as number

    await userEvent.keyboard('-')
    expect(lastCrop()[2]).toBeGreaterThan(zoomed)
  })

  it('explica cómo manejarlo con el teclado', async () => {
    await renderCropper()

    expect(viewport()).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/flechas/i)).toBeInTheDocument()
  })

  it('«Guardar avatar» entrega un Blob de imagen y cuadrado, de hasta 512 px', async () => {
    await renderCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    const blob = onConfirm.mock.calls[0]?.[0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toMatch(/^image\//)
    expect(toBlob).toHaveBeenCalledTimes(1)
    const exported = toBlob.mock.calls[0]?.[0] as { width: number; height: number }
    expect(exported.width).toBe(exported.height)
    expect(exported.width).toBeLessThanOrEqual(512)
  })

  it('exporta la zona encuadrada, no la imagen entera', async () => {
    await renderCropper()
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })
    const shown = lastCrop()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())

    expect(lastCrop()).toEqual(shown)
  })

  it('con una imagen pequeña no exporta más píxeles de los que tiene', async () => {
    stubBrowser({ width: 200, height: 200, close })
    await renderCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar avatar' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())

    expect((toBlob.mock.calls[0]?.[0] as { width: number }).width).toBe(200)
  })

  it('«Cancelar» no sube ni exporta nada', async () => {
    await renderCropper()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(toBlob).not.toHaveBeenCalled()
  })

  it('mientras sube, los botones se desactivan y se anuncia «Subiendo…»', async () => {
    await renderCropper(true)

    expect(screen.getByRole('button', { name: /Subiendo/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Zoom' })).toBeDisabled()
  })

  it('si no se puede leer la imagen, avisa y no deja guardar', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')))
    const { AvatarCropper } = await import('../../../../src/features/profile/AvatarCropper')

    render(<AvatarCropper file={FILE} busy={false} onConfirm={onConfirm} onCancel={onCancel} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer la imagen.')
    expect(screen.queryByRole('button', { name: 'Guardar avatar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('libera la imagen decodificada al desmontarse', async () => {
    const { AvatarCropper } = await import('../../../../src/features/profile/AvatarCropper')
    const { unmount } = render(
      <AvatarCropper file={FILE} busy={false} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    await screen.findByRole('application', { name: /encuadre/i })

    unmount()

    expect(close).toHaveBeenCalled()
  })
})
