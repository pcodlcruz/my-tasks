import { useEffect, useId, useRef, useState } from 'react'
import { useRestoreFocus } from '../../app/useRestoreFocus'
import { AVATAR_CATALOG } from './avatars'

interface AvatarPickerProps {
  currentPreset: string | null
  onSelect: (presetId: string) => void
  onClose: () => void
}

const FOCUSABLE = 'input:not(:disabled), button:not(:disabled)'

// Modal with the catalog of 12 avatars (the "Subir imagen" tab arrives with phase 6). Built on
// native radio buttons: arrow keys move the choice, and the chosen one is marked with a border
// and a check as well as a color.
export function AvatarPicker({ currentPreset, onSelect, onClose }: AvatarPickerProps): JSX.Element {
  useRestoreFocus()
  const [selected, setSelected] = useState<string | null>(currentPreset)
  const titleId = useId()
  const descriptionId = useId()
  const groupName = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const initial =
      dialog.querySelector<HTMLElement>('input:checked') ?? dialog.querySelector('input')
    initial?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || dialog === null) return
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE)
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const canSave = selected !== null && selected !== currentPreset

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 shadow-modal sm:rounded-2xl"
      >
        <h2 id={titleId} className="text-heading font-heading text-text">
          Elegir avatar
        </h2>
        <p id={descriptionId} className="mt-1 text-caption text-text-muted">
          Elige una ilustración para tu perfil, el tablero y las tareas.
        </p>

        <div
          role="radiogroup"
          aria-label="Avatares del catálogo"
          className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4"
        >
          {AVATAR_CATALOG.map((avatar) => {
            const isSelected = avatar.id === selected
            return (
              <label
                key={avatar.id}
                className={`relative flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-2 text-caption ${
                  isSelected
                    ? 'border-primary bg-primary/10 font-semibold text-text'
                    : 'border-transparent text-text-muted hover:border-border hover:text-text'
                } focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary`}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={avatar.id}
                  checked={isSelected}
                  onChange={() => setSelected(avatar.id)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white ring-1 ring-border">
                  <img src={avatar.src} alt="" className="h-[85%] w-[85%]" />
                </span>
                <span>{avatar.name}</span>
                {isSelected && (
                  <span aria-hidden="true" className="absolute right-1 top-1 text-primary">
                    ✓
                  </span>
                )}
              </label>
            )
          })}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-alt"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => selected !== null && onSelect(selected)}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Guardar avatar
          </button>
        </div>
      </div>
    </div>
  )
}
