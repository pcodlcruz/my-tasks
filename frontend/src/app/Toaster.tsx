import { useEffect } from 'react'
import { type Toast, useToastStore } from '../stores/toastStore'

const AUTO_DISMISS_MS = 6000

function ToastItem({ toast }: { toast: Toast }): JSX.Element {
  const dismiss = useToastStore((state) => state.dismiss)

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id, dismiss])

  return (
    <div className="flex items-center gap-3 rounded-lg bg-text px-4 py-3 text-caption text-white shadow-modal">
      <span>{toast.message}</span>
      {toast.actionLabel && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.()
            dismiss(toast.id)
          }}
          className="font-semibold underline hover:text-white/80"
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => dismiss(toast.id)}
        className="rounded p-0.5 hover:bg-white/10"
      >
        ✕
      </button>
    </div>
  )
}

// La región `aria-live` existe siempre (vacía) para que los lectores de
// pantalla anuncien los avisos cuando se añaden.
export function Toaster(): JSX.Element {
  const toasts = useToastStore((state) => state.toasts)

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
