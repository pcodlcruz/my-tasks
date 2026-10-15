import { useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useSession } from './useSession'

interface LocationState {
  from?: string
}

export function LoginPage(): JSX.Element {
  const { user, signInWithGoogle } = useSession()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  if (user) {
    const from = (location.state as LocationState | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const sessionExpired = searchParams.get('reason') === 'expired'

  async function handleSignIn(): Promise<void> {
    setStatus('loading')
    try {
      await signInWithGoogle()
    } catch (error) {
      const code = (error as { code?: string }).code
      setStatus(code === 'auth/popup-closed-by-user' ? 'idle' : 'error')
      return
    }
    setStatus('idle')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-alt px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display text-display font-bold text-text">MyTasks</h1>
          <p className="mt-1 text-body text-text-muted">
            Organiza tus tareas con la matriz de Eisenhower
          </p>
        </div>

        {sessionExpired && (
          <p
            role="status"
            className="mt-6 rounded border border-border bg-surface-alt px-3 py-2 text-caption text-text-muted"
          >
            Tu sesión ha caducado
          </p>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="mt-6 flex items-center justify-between gap-2 rounded border border-error/30 bg-error/10 px-3 py-2 text-caption text-error"
          >
            <span>No se pudo iniciar sesión.</span>
            <button
              type="button"
              onClick={handleSignIn}
              className="font-semibold underline hover:text-error/80"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="mt-8">
          <button
            type="button"
            aria-label={status === 'loading' ? 'Cargando' : 'Iniciar sesión con Google'}
            aria-busy={status === 'loading'}
            disabled={status === 'loading'}
            onClick={handleSignIn}
            className="flex h-10 w-full items-center justify-center rounded border border-[#747775] bg-white px-4 text-sm font-medium text-[#1F1F1F] transition-shadow hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'loading' ? (
              <span>Iniciando sesión...</span>
            ) : (
              <>
                <GoogleIcon />
                <span className="ml-3">Iniciar sesión con Google</span>
              </>
            )}
          </button>
          <p className="mt-4 text-center text-caption text-text-muted">
            La primera vez, tu cuenta se crea automáticamente. No usamos contraseñas.
          </p>
        </div>
      </div>
    </main>
  )
}

function GoogleIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 18 18">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.347 2.825.957 4.039l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}
