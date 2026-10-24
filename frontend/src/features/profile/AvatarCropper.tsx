import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from 'react'

interface AvatarCropperProps {
  file: Blob
  // The upload is in progress: nothing can be changed or cancelled meanwhile.
  busy: boolean
  onConfirm: (picture: Blob) => void
  onCancel: () => void
}

// Side of the framing area in pixels, of the round preview, and of the biggest square sent.
const VIEWPORT_SIZE = 280
const PREVIEW_SIZE = 96
const MAX_EXPORT_SIZE = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1
// Pixels of the framing area an arrow key moves the picture.
const KEY_STEP = 10

interface Point {
  x: number
  y: number
}

interface Drag {
  pointerId: number
  startX: number
  startY: number
  startCenter: Point
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// The framed square is `side` pixels of the original; zoom 1 is the biggest one that fits.
function squareSide(bitmap: ImageBitmap, zoom: number): number {
  return Math.min(bitmap.width, bitmap.height) / zoom
}

// The square must stay inside the picture: its center cannot go closer than half a side to an edge.
function clampCenter(center: Point, bitmap: ImageBitmap, side: number): Point {
  const half = side / 2
  return {
    x: clamp(center.x, half, bitmap.width - half),
    y: clamp(center.y, half, bitmap.height - half),
  }
}

function draw(
  canvas: HTMLCanvasElement | null,
  bitmap: ImageBitmap,
  square: Point,
  side: number,
): void {
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    bitmap,
    square.x - side / 2,
    square.y - side / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  )
}

// Frames a square of the chosen picture: drag (mouse or finger) or arrow keys to move it, the
// slider or + and - to zoom. Plain <canvas>, no library. It hands back the framed square as an
// image of up to 512 px; the server then validates and reprocesses it anyway.
export function AvatarCropper({
  file,
  busy,
  onConfirm,
  onCancel,
}: AvatarCropperProps): JSX.Element {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  // `null` until the person moves it: then it is the center of the picture.
  const [movedCenter, setMovedCenter] = useState<Point | null>(null)
  const [exportFailed, setExportFailed] = useState(false)
  const viewportRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const helpId = useId()
  const zoomId = useId()

  useEffect(() => {
    let cancelled = false
    let loaded: ImageBitmap | null = null
    createImageBitmap(file)
      .then((image) => {
        if (cancelled) {
          image.close()
          return
        }
        loaded = image
        setBitmap(image)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      // The decoded picture is memory the browser does not free by itself.
      loaded?.close()
    }
  }, [file])

  const side = bitmap ? squareSide(bitmap, zoom) : 0
  const center = bitmap
    ? clampCenter(movedCenter ?? { x: bitmap.width / 2, y: bitmap.height / 2 }, bitmap, side)
    : null

  const centerX = center?.x
  const centerY = center?.y
  useEffect(() => {
    if (!bitmap || centerX === undefined || centerY === undefined) return
    draw(viewportRef.current, bitmap, { x: centerX, y: centerY }, side)
    draw(previewRef.current, bitmap, { x: centerX, y: centerY }, side)
  }, [bitmap, centerX, centerY, side])

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-xl border border-error/30 bg-error/10 p-3 text-caption text-error"
        >
          No se pudo leer la imagen.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (!bitmap || !center) {
    return (
      <p role="status" className="text-caption text-text-muted">
        Cargando imagen…
      </p>
    )
  }

  // Moving by `dx`, `dy` pixels of the framing area, the picture follows the pointer: the
  // framed square moves the other way over the original.
  function moveBy(dx: number, dy: number, from: Point): void {
    if (!bitmap) return
    const scale = side / VIEWPORT_SIZE
    setMovedCenter(clampCenter({ x: from.x - dx * scale, y: from.y - dy * scale }, bitmap, side))
  }

  function changeZoom(next: number): void {
    setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM))
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    if (busy || (event.pointerType === 'mouse' && event.button !== 0)) return
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenter: center as Point,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    moveBy(event.clientX - current.startX, event.clientY - current.startY, current.startCenter)
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>): void {
    if (drag.current && event.pointerId === drag.current.pointerId) drag.current = null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (busy) return
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      moveBy(move[0], move[1], center as Point)
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      changeZoom(zoom + ZOOM_STEP)
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      changeZoom(zoom - ZOOM_STEP)
    }
  }

  function confirm(): void {
    if (!bitmap || !center) return
    // Never more pixels than the picture really has there, and never more than 512.
    const size = Math.max(1, Math.min(MAX_EXPORT_SIZE, Math.floor(side)))
    const output = document.createElement('canvas')
    output.width = size
    output.height = size
    const context = output.getContext('2d')
    if (!context) {
      setExportFailed(true)
      return
    }
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      center.x - side / 2,
      center.y - side / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    )
    output.toBlob((picture) => {
      if (picture) onConfirm(picture)
      else setExportFailed(true)
    }, 'image/png')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <canvas
          ref={viewportRef}
          width={VIEWPORT_SIZE}
          height={VIEWPORT_SIZE}
          // A custom widget (no native control frames a picture): it takes the focus and answers
          // to pointer and keyboard, which is what the "application" role announces. The rules
          // below cannot tell a drawing surface from a plain canvas.
          // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role
          role="application"
          aria-label="Encuadre de la imagen"
          aria-describedby={helpId}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleKeyDown}
          className="max-w-full cursor-move touch-none rounded-lg border border-border bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <div className="flex flex-col items-center gap-2">
          <div
            data-testid="crop-preview"
            className="h-24 w-24 overflow-hidden rounded-full border border-border bg-white"
          >
            <canvas
              ref={previewRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              aria-hidden="true"
            />
          </div>
          <p className="text-caption text-text-muted">Vista previa</p>
        </div>
      </div>

      <p id={helpId} className="text-caption text-text-muted">
        Arrastra la imagen o usa las flechas del teclado para encuadrarla. Con + y − (o con el
        control de zoom) la acercas o la alejas.
      </p>

      <div className="flex items-center gap-3">
        <label htmlFor={zoomId} className="text-caption font-semibold text-text">
          Zoom
        </label>
        <input
          id={zoomId}
          type="range"
          aria-label="Zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          disabled={busy}
          onChange={(event) => changeZoom(Number(event.target.value))}
          className="min-w-0 flex-1"
        />
      </div>

      {exportFailed && (
        <p role="alert" className="text-caption font-semibold text-error">
          No se pudo preparar la imagen. Prueba con otra.
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY_BUTTON}>
          Cancelar
        </button>
        <button type="button" onClick={confirm} disabled={busy} className={PRIMARY_BUTTON}>
          {busy ? 'Subiendo…' : 'Guardar avatar'}
        </button>
      </div>
    </div>
  )
}

const SECONDARY_BUTTON =
  'rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60'

const PRIMARY_BUTTON =
  'rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60'
