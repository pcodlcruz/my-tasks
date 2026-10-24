import { useState } from 'react'
import {
  useAvatarUrl,
  useProfile,
  useRemoveAvatar,
  useResetProfile,
  useUpdateProfile,
  useUploadAvatar,
} from '../../api/profile'
import type { ProfileUpdate } from '../../api/types'
import { ConfirmDialog } from '../../app/ConfirmDialog'
import { useSession } from '../auth/useSession'
import { AppearanceSection } from './AppearanceSection'
import { AvatarPicker } from './AvatarPicker'
import { BoardPreferences } from './BoardPreferences'
import { IdentitySection } from './IdentitySection'

// One fixed message for any failure to save: the server's own text is never shown.
const SAVE_ERROR_MESSAGE = 'No se pudo guardar el cambio. Inténtalo de nuevo.'

type LastAction =
  | { type: 'update'; change: ProfileUpdate }
  | { type: 'reset' }
  | { type: 'remove-avatar' }
  // The picker explains upload errors itself, next to the picture being sent.
  | { type: 'upload-avatar' }

export function ProfilePage(): JSX.Element {
  const profileQuery = useProfile()
  const update = useUpdateProfile()
  const reset = useResetProfile()
  const removeAvatar = useRemoveAvatar()
  const uploadAvatar = useUploadAvatar()
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const [isConfirmingReset, setIsConfirmingReset] = useState(false)
  const [isPickingAvatar, setIsPickingAvatar] = useState(false)
  const { user } = useSession()
  const profile = profileQuery.data

  const avatarUrl = useAvatarUrl(profile?.avatar)

  // Status of the last thing the person did (a change, a reset, or an avatar operation).
  const operation = {
    update,
    reset,
    'remove-avatar': removeAvatar,
    'upload-avatar': uploadAvatar,
  }[lastAction?.type ?? 'update']
  const isSaving = lastAction !== null && operation.isPending
  // A failed upload is explained by the picker, not by this page's generic notice.
  const failed = lastAction !== null && lastAction.type !== 'upload-avatar' && operation.isError
  const saved = lastAction !== null && operation.isSuccess

  function save(change: ProfileUpdate): void {
    setLastAction({ type: 'update', change })
    update.mutate(change)
  }

  function retry(): void {
    if (lastAction?.type === 'reset') reset.mutate()
    else if (lastAction?.type === 'remove-avatar') removeAvatar.mutate()
    else if (lastAction?.type === 'update') update.mutate(lastAction.change)
  }

  function removeCurrentAvatar(): void {
    setLastAction({ type: 'remove-avatar' })
    removeAvatar.mutate()
  }

  // Rejects on failure so the picker, which stays open, can explain it.
  async function uploadPicture(picture: Blob): Promise<void> {
    setLastAction({ type: 'upload-avatar' })
    await uploadAvatar.mutateAsync(picture)
  }

  function chooseAvatar(presetId: string): void {
    setIsPickingAvatar(false)
    save({ avatar: { kind: 'preset', preset: presetId } })
  }

  function confirmReset(): void {
    setIsConfirmingReset(false)
    setLastAction({ type: 'reset' })
    reset.mutate()
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-display font-display text-text">Perfil</h1>

      {profileQuery.isPending && (
        <div role="status" aria-label="Cargando perfil" className="flex flex-col gap-4">
          {[0, 1].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-xl bg-surface-alt" />
          ))}
        </div>
      )}

      {profile === undefined && profileQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/10 p-4 text-error"
        >
          <span>No se pudo cargar tu perfil.</span>
          <button
            type="button"
            onClick={() => void profileQuery.refetch()}
            className="font-semibold underline hover:text-error/80"
          >
            Reintentar
          </button>
        </div>
      )}

      {profile !== undefined && (
        <div className="flex flex-col gap-6">
          <IdentitySection
            profile={profile}
            uid={user?.uid ?? ''}
            googleName={user?.displayName ?? null}
            email={user?.email ?? ''}
            avatarUrl={avatarUrl}
            onChange={save}
            onChooseAvatar={() => setIsPickingAvatar(true)}
            onRemoveAvatar={removeCurrentAvatar}
          />
          <AppearanceSection profile={profile} onChange={save} />
          <BoardPreferences profile={profile} onChange={save} />

          <div className="min-h-6">
            <p role="status" className="text-caption text-success">
              {isSaving ? 'Guardando…' : saved ? 'Guardado' : ''}
            </p>
            {failed && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/10 p-4 text-error"
              >
                <span>{SAVE_ERROR_MESSAGE}</span>
                <button
                  type="button"
                  onClick={retry}
                  className="font-semibold underline hover:text-error/80"
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>

          <section
            aria-labelledby="reset-heading"
            className="rounded-xl border border-border bg-surface p-6 shadow-card"
          >
            <h2 id="reset-heading" className="sr-only">
              Restablecer
            </h2>
            <button
              type="button"
              onClick={() => setIsConfirmingReset(true)}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-alt"
            >
              Restablecer valores por defecto
            </button>
            <p className="mt-2 text-caption text-text-muted">No cambia tu nombre ni tu avatar.</p>
          </section>
        </div>
      )}

      {isPickingAvatar && profile !== undefined && (
        <AvatarPicker
          currentPreset={profile.avatar.kind === 'preset' ? profile.avatar.preset : null}
          onSelect={chooseAvatar}
          onUpload={uploadPicture}
          onClose={() => setIsPickingAvatar(false)}
        />
      )}

      {isConfirmingReset && (
        <ConfirmDialog
          title="¿Restablecer los valores por defecto?"
          message="Volverán el tema, la densidad, el tablero por defecto, el orden y el historial a sus valores iniciales. No cambia tu nombre ni tu avatar."
          confirmLabel="Restablecer"
          onConfirm={confirmReset}
          onCancel={() => setIsConfirmingReset(false)}
        />
      )}
    </main>
  )
}
