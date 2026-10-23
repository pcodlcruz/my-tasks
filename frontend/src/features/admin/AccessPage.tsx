import { type FormEvent, useId, useState } from 'react'
import {
  useAccessList,
  useInviteUser,
  useRevokeInvitation,
  useRevokeUserAccess,
} from '../../api/access'
import {
  ACCESS_LIST_LIMIT,
  type AccountEntry,
  type AccountStatus,
  type Invitation,
  type InvitationStatus,
  MAX_PENDING_INVITATIONS,
  type Role,
} from '../../api/types'
import { ConfirmDialog } from '../../app/ConfirmDialog'
import { ApiClientError, isUserFacingError } from '../../lib/apiClient'
import { formatDay } from '../../lib/dates'

// Same rule as the server: something@something.tld, no spaces, no slash, at most 254 chars.
const EMAIL_PATTERN = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/
const EMAIL_MAX_LENGTH = 254

const INVALID_EMAIL_MESSAGE = 'Escribe un correo válido.'
const INVITE_FAILED_MESSAGE = 'No se pudo crear la invitación. Inténtalo de nuevo.'

const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  revoked: 'Revocada',
}

const ROLE_LABELS: Record<Role, string> = { user: 'Usuario', admin: 'Administrador' }

const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Activa',
  revoked: 'Sin acceso',
}

const BADGE =
  'inline-flex items-center rounded-full border border-border bg-surface-alt px-2 py-0.5 text-caption font-semibold text-text'

const PRIMARY_BUTTON =
  'rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60'

const DANGER_BUTTON =
  'rounded-lg border border-error/40 bg-surface px-3 py-1.5 text-caption font-semibold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60'

type PendingRevocation =
  { kind: 'invitation'; invitation: Invitation } | { kind: 'account'; account: AccountEntry }

function isValidEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value)
}

// What to tell about a failed invitation: the server's own message for a rule (already has
// access, too many pending), the format message for a 422, or a generic one.
function inviteErrorMessage(error: unknown): string {
  if (isUserFacingError(error)) return error.message
  if (error instanceof ApiClientError && error.code === 'validation_error') {
    return INVALID_EMAIL_MESSAGE
  }
  return INVITE_FAILED_MESSAGE
}

function InviteForm(): JSX.Element {
  const invite = useInviteUser()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const message = fieldError ?? (invite.error ? inviteErrorMessage(invite.error) : null)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const value = email.trim()
    if (!isValidEmail(value)) {
      setFieldError(INVALID_EMAIL_MESSAGE)
      return
    }
    setFieldError(null)
    invite.mutate(value, { onSuccess: () => setEmail('') })
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-body-strong text-text">
        Correo de la persona a invitar
      </label>
      <div className="flex flex-wrap items-start gap-3">
        <input
          id={inputId}
          type="text"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setFieldError(null)
            if (invite.error) invite.reset()
          }}
          aria-invalid={message !== null}
          aria-describedby={message !== null ? errorId : undefined}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-body text-text"
        />
        <button type="submit" disabled={invite.isPending} className={PRIMARY_BUTTON}>
          Invitar
        </button>
      </div>
      {message !== null && (
        <p id={errorId} role="alert" className="text-caption text-error">
          {message}
        </p>
      )}
    </form>
  )
}

function Skeleton(): JSX.Element {
  return (
    <div role="status" aria-label="Cargando accesos" className="flex flex-col gap-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-lg bg-surface-alt" />
      ))}
    </div>
  )
}

const ROW =
  'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-card'

export function AccessPage(): JSX.Element {
  const { data, isLoading, isError, refetch } = useAccessList()
  const revokeInvitation = useRevokeInvitation()
  const revokeAccess = useRevokeUserAccess()
  const [pending, setPending] = useState<PendingRevocation | null>(null)

  const invitations = data?.invitations ?? []
  const accounts = data?.accounts ?? []
  const pendingCount = invitations.filter((item) => item.status === 'pending').length
  const isTruncated =
    invitations.length >= ACCESS_LIST_LIMIT || accounts.length >= ACCESS_LIST_LIMIT

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-display font-display text-text">Accesos</h1>

      <section aria-labelledby="invite-heading" className="mb-8">
        <h2 id="invite-heading" className="mb-3 text-heading font-heading text-text">
          Invitar a otra persona
        </h2>
        <InviteForm />
        {data && (
          <p className="mt-2 text-caption text-text-muted">
            {pendingCount} de {MAX_PENDING_INVITATIONS} invitaciones pendientes
          </p>
        )}
      </section>

      {isLoading && <Skeleton />}

      {isError && !isLoading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/10 p-4 text-error"
        >
          <span>No se pudieron cargar los accesos.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-semibold underline hover:text-error/80"
          >
            Reintentar
          </button>
        </div>
      )}

      {data && (
        <>
          {isTruncated && (
            <p className="mb-6 rounded-xl border border-border bg-surface-alt p-3 text-caption text-text">
              Se muestran las {ACCESS_LIST_LIMIT} más recientes de cada lista.
            </p>
          )}

          <section aria-labelledby="invitations-heading" className="mb-8">
            <h2 id="invitations-heading" className="mb-3 text-heading font-heading text-text">
              Invitaciones
            </h2>
            {invitations.length === 0 ? (
              <p className="text-body text-text-muted">No hay invitaciones.</p>
            ) : (
              <ul aria-label="Invitaciones" className="flex flex-col gap-3">
                {invitations.map((invitation) => (
                  <li key={invitation.email} className={ROW}>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-body-strong text-text">{invitation.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={BADGE}>{INVITATION_STATUS_LABELS[invitation.status]}</span>
                        <span className="text-caption text-text-muted">
                          Creada el {formatDay(invitation.created_at)}
                        </span>
                      </div>
                    </div>
                    {invitation.status === 'pending' && (
                      <button
                        type="button"
                        aria-label={`Revocar invitación de ${invitation.email}`}
                        onClick={() => setPending({ kind: 'invitation', invitation })}
                        className={DANGER_BUTTON}
                      >
                        Revocar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="accounts-heading">
            <h2 id="accounts-heading" className="mb-1 text-heading font-heading text-text">
              Personas con cuenta
            </h2>
            <p className="mb-3 text-caption text-text-muted">
              Quien pierde el acceso conserva sus tareas. Para devolvérselo, vuelve a invitar su
              correo.
            </p>
            {accounts.length === 0 ? (
              <p className="text-body text-text-muted">Todavía no hay personas con cuenta.</p>
            ) : (
              <ul aria-label="Personas con cuenta" className="flex flex-col gap-3">
                {accounts.map((account) => (
                  <li key={account.uid} className={ROW}>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-body-strong text-text">{account.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={BADGE}>{ROLE_LABELS[account.role]}</span>
                        <span className={BADGE}>{ACCOUNT_STATUS_LABELS[account.status]}</span>
                        <span className="text-caption text-text-muted">
                          Desde el {formatDay(account.created_at)}
                        </span>
                      </div>
                    </div>
                    {account.role === 'user' && account.status === 'active' && (
                      <button
                        type="button"
                        aria-label={`Retirar acceso a ${account.email}`}
                        onClick={() => setPending({ kind: 'account', account })}
                        className={DANGER_BUTTON}
                      >
                        Retirar acceso
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {pending?.kind === 'invitation' && (
        <ConfirmDialog
          title="¿Revocar la invitación?"
          message={`${pending.invitation.email} ya no podrá entrar con esta invitación.`}
          confirmLabel="Revocar invitación"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            revokeInvitation.mutate(pending.invitation.email)
            setPending(null)
          }}
        />
      )}

      {pending?.kind === 'account' && (
        <ConfirmDialog
          title="¿Retirar el acceso?"
          message={`${pending.account.email} dejará de poder usar la aplicación en su próxima petición. Sus tareas se conservan y las recuperará si se le vuelve a invitar.`}
          confirmLabel="Retirar acceso"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            revokeAccess.mutate(pending.account.uid)
            setPending(null)
          }}
        />
      )}
    </main>
  )
}
