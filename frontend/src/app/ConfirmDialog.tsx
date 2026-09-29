import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab' || dialogRef.current === null) {
        return
      }
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Foco inicial en la acción segura: la destructiva no se activa por accidente.
    cancelRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-modal"
      >
        <h2 id="confirm-dialog-title" className="text-heading font-heading text-text">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="mt-2 text-body text-text-muted">
          {message}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-alt"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-error px-4 py-2.5 text-sm font-semibold text-white hover:bg-error/90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
