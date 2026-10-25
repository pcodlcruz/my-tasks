import { type FormEvent, useId, useState } from 'react'
import type { Profile, ProfileUpdate } from '../../api/types'
import { Avatar } from './Avatar'

interface IdentitySectionProps {
  profile: Profile
  uid: string
  // The name and e-mail of the Google account: what is used while no name is chosen.
  googleName: string | null
  email: string
  // The `blob:` URL of the uploaded image, if the avatar is one.
  avatarUrl?: string
  onChange: (update: ProfileUpdate) => void
  onChooseAvatar: () => void
  onRemoveAvatar: () => void
}

const NAME_MAX_LENGTH = 50
const EMPTY_NAME_MESSAGE = 'Escribe un nombre de 1 a 50 caracteres o usa el de Google.'
const LONG_NAME_MESSAGE = `El nombre no puede superar los ${NAME_MAX_LENGTH} caracteres.`
const CONTROL_NAME_MESSAGE = 'El nombre no puede contener caracteres de control.'

// Controls and invisible formatting (Unicode Cc and Cf), except the zero-width joiner that
// glues emoji sequences. The server applies the same rule: this only gives a clearer message.
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u
const ZERO_WIDTH_JOINER = /‍/g

// Length in characters (code points), the way the server counts them: an emoji is one.
function lengthOf(text: string): number {
  return Array.from(text).length
}

// The error message, or `null` if the name can be saved.
function validateName(value: string): string | null {
  const name = value.trim()
  if (lengthOf(name) === 0) return EMPTY_NAME_MESSAGE
  if (lengthOf(name) > NAME_MAX_LENGTH) return LONG_NAME_MESSAGE
  if (FORBIDDEN_CHARACTERS.test(name.replace(ZERO_WIDTH_JOINER, ''))) return CONTROL_NAME_MESSAGE
  return null
}

const SECONDARY_BUTTON =
  'rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60'

export function IdentitySection({
  profile,
  uid,
  googleName,
  email,
  avatarUrl,
  onChange,
  onChooseAvatar,
  onRemoveAvatar,
}: IdentitySectionProps): JSX.Element {
  const [value, setValue] = useState(profile.display_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const helpId = useId()
  const errorId = useId()
  const shownName = profile.display_name ?? googleName ?? email

  // The saved name is the source of truth: after a save (or a reset) the field follows it.
  // Adjusted while rendering, not in an effect: the field is re-synchronised in the same render
  // that sees the new saved name instead of painting a stale value first.
  const [savedName, setSavedName] = useState(profile.display_name)
  if (profile.display_name !== savedName) {
    setSavedName(profile.display_name)
    setValue(profile.display_name ?? '')
    setError(null)
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    const problem = validateName(value)
    setError(problem)
    if (problem === null) onChange({ display_name: value.trim() })
  }

  const describedBy = error === null ? helpId : `${helpId} ${errorId}`

  return (
    <section
      aria-labelledby="identity-heading"
      className="rounded-xl border border-border bg-surface p-6 shadow-card"
    >
      <h2 id="identity-heading" className="mb-4 text-heading font-heading text-text">
        Identidad
      </h2>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex flex-col items-start gap-3">
          <Avatar
            avatar={profile.avatar}
            name={shownName}
            email={email}
            seed={uid}
            size="lg"
            imageUrl={avatarUrl}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onChooseAvatar} className={SECONDARY_BUTTON}>
              Elegir avatar
            </button>
            {profile.avatar.kind !== 'initials' && (
              <button type="button" onClick={onRemoveAvatar} className={SECONDARY_BUTTON}>
                Quitar avatar
              </button>
            )}
          </div>
        </div>

        <form onSubmit={submit} noValidate className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <label htmlFor={inputId} className="text-body-strong font-body-strong text-text">
                Nombre para mostrar
              </label>
              <span className="text-caption text-text-muted">
                {lengthOf(value.trim())}/{NAME_MAX_LENGTH}
              </span>
            </div>
            <input
              id={inputId}
              type="text"
              value={value}
              autoComplete="nickname"
              aria-invalid={error === null ? undefined : 'true'}
              aria-describedby={describedBy}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
              className={`w-full rounded-lg border bg-surface px-3 py-2 text-body text-text ${
                error === null ? 'border-border' : 'border-error'
              }`}
            />
            <p id={helpId} className="mt-1 text-caption text-text-muted">
              {googleName === null
                ? `Si lo dejas en blanco se usará tu correo: ${email}`
                : `Si lo dejas en blanco se usará el de tu cuenta de Google: ${googleName}`}
            </p>
            {error !== null && (
              <p id={errorId} role="alert" className="mt-1 text-caption font-semibold text-error">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Guardar
            </button>
            <button
              type="button"
              disabled={profile.display_name === null}
              onClick={() => onChange({ display_name: null })}
              className={SECONDARY_BUTTON}
            >
              Usar el de Google
            </button>
          </div>

          <p className="text-caption text-text-muted">
            <span className="font-semibold text-text">Correo de la cuenta:</span>{' '}
            <span>{email}</span>
          </p>
        </form>
      </div>
    </section>
  )
}
