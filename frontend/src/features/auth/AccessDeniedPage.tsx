import { APP_NAME } from '../../lib/brand'
import { useSession } from './useSession'

// Shown to anyone who signed in with Google but has no active account. It says the same
// for "never invited" and "access withdrawn", so it reveals nothing about either.
export function AccessDeniedPage(): JSX.Element {
  const { user, signOut } = useSession()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-alt px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="font-display text-heading font-bold text-text">Necesitas una invitación</h1>
        <p className="mt-3 text-body text-text-muted">
          {APP_NAME} es una aplicación privada. Pide al administrador que te invite con tu cuenta de
          Google y vuelve a entrar.
        </p>
        {user?.email && (
          <p className="mt-4 break-all text-caption text-text-muted">
            Has iniciado sesión como {user.email}
          </p>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-8 w-full rounded-lg border border-border px-4 py-2 text-body font-medium text-text hover:bg-surface-alt"
        >
          Cerrar sesión
        </button>
      </div>
    </main>
  )
}
