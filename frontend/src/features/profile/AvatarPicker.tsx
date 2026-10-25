import { type ChangeEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { avatarErrorMessage } from '../../api/profile'
import { useRestoreFocus } from '../../app/useRestoreFocus'
import { AvatarCropper } from './AvatarCropper'
import { AVATAR_CATALOG } from './avatars'

interface AvatarPickerProps {
  currentPreset: string | null
  onSelect: (presetId: string) => void
  // Uploads the framed picture. It rejects with the error of the upload, which the picker
  // explains; on success the picker closes itself.
  onUpload: (picture: Blob) => Promise<void>
  onClose: () => void
}

type Tab = 'catalog' | 'upload'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'catalog', label: 'Catálogo' },
  { id: 'upload', label: 'Subir imagen' },
]

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_BYTES = 2 * 1024 * 1024
const WRONG_TYPE_MESSAGE = 'El archivo debe ser una imagen JPEG, PNG o WebP.'
const TOO_LARGE_MESSAGE = 'La imagen supera los 2 MB.'

const FOCUSABLE = 'input:not(:disabled), button:not(:disabled), [tabindex="0"]'

const SECONDARY_BUTTON =
  'rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60'

// Modal to choose the avatar: a catalog of 12 illustrations, or an own picture that is framed
// before it is sent. The catalog is built on native radio buttons (arrow keys move the choice;
// the chosen one is marked with a border and a check as well as a color).
export function AvatarPicker({
  currentPreset,
  onSelect,
  onUpload,
  onClose,
}: AvatarPickerProps): JSX.Element {
  useRestoreFocus()
  const [tab, setTab] = useState<Tab>('catalog')
  const [selected, setSelected] = useState<string | null>(currentPreset)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const groupName = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  // The handlers below are registered once: they read the live state through this ref.
  const uploadingRef = useRef(false)
  useEffect(() => {
    uploadingRef.current = uploading
  }, [uploading])

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const initial =
      dialog.querySelector<HTMLElement>('input:checked') ?? dialog.querySelector('input')
    initial?.focus()

    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        // While a picture is going up nothing can be abandoned half way.
        if (!uploadingRef.current) onClose()
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

  function moveTab(event: KeyboardEvent<HTMLButtonElement>): void {
    const index = TABS.findIndex((candidate) => candidate.id === tab)
    const next: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }
    const target = next[event.key]
    if (target === undefined || uploading) return
    event.preventDefault()
    const targetTab = TABS[target]
    if (targetTab) {
      setTab(targetTab.id)
      document.getElementById(`${titleId}-tab-${targetTab.id}`)?.focus()
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
    const chosen = event.target.files?.[0]
    // So that choosing the same file again fires `change` again.
    event.target.value = ''
    if (!chosen) return
    if (!ACCEPTED_TYPES.includes(chosen.type)) {
      setError(WRONG_TYPE_MESSAGE)
      return
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setError(TOO_LARGE_MESSAGE)
      return
    }
    // Checked here before anything is sent; the server checks it all again.
    setError(null)
    setFile(chosen)
  }

  async function upload(picture: Blob): Promise<void> {
    setUploading(true)
    setError(null)
    try {
      await onUpload(picture)
      onClose()
    } catch (failure) {
      // The previous avatar is untouched: the picker stays open to try again or pick another.
      setError(avatarErrorMessage(failure))
      setUploading(false)
    }
  }

  const canSave = selected !== null && selected !== currentPreset

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !uploading) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 shadow-modal sm:rounded-2xl"
      >
        <h2 id={titleId} className="text-heading font-heading text-text">
          Elegir avatar
        </h2>
        <p id={descriptionId} className="mt-1 text-caption text-text-muted">
          Elige una ilustración o sube tu propia imagen para tu perfil, el tablero y las tareas.
        </p>

        <div
          role="tablist"
          aria-label="Origen del avatar"
          className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-alt p-1"
        >
          {TABS.map((candidate) => {
            const isActive = candidate.id === tab
            return (
              <button
                key={candidate.id}
                id={`${titleId}-tab-${candidate.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`${titleId}-panel-${candidate.id}`}
                tabIndex={isActive ? 0 : -1}
                disabled={uploading}
                onClick={() => setTab(candidate.id)}
                onKeyDown={moveTab}
                className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed ${
                  isActive
                    ? 'border border-border bg-surface text-text shadow-sm'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {candidate.label}
              </button>
            )
          })}
        </div>

        {tab === 'catalog' && (
          <div
            role="tabpanel"
            id={`${titleId}-panel-catalog`}
            aria-labelledby={`${titleId}-tab-catalog`}
          >
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
          </div>
        )}

        {tab === 'upload' && (
          <div
            role="tabpanel"
            id={`${titleId}-panel-upload`}
            aria-labelledby={`${titleId}-tab-upload`}
            className="mt-4 flex flex-col gap-4"
          >
            {file === null ? (
              <div className="flex flex-col items-start gap-2">
                <label
                  className={`${SECONDARY_BUTTON} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary`}
                >
                  <span>Elegir archivo</span>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    onChange={chooseFile}
                    className="sr-only"
                  />
                </label>
                <p className="text-caption text-text-muted">JPEG, PNG o WebP, hasta 2 MB</p>
              </div>
            ) : (
              <AvatarCropper
                file={file}
                busy={uploading}
                onConfirm={(picture) => void upload(picture)}
                onCancel={() => {
                  setFile(null)
                  setError(null)
                }}
              />
            )}
          </div>
        )}

        {error !== null && (
          <p role="alert" className="mt-3 text-caption font-semibold text-error">
            {error}
          </p>
        )}

        {tab === 'catalog' && (
          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
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
        )}

        {tab === 'upload' && file === null && (
          <div className="mt-6 flex items-center justify-end">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
