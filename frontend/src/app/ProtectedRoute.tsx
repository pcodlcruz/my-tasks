import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AccessDeniedPage } from '../features/auth/AccessDeniedPage'
import { useAccount } from '../features/auth/useAccount'
import { useSession } from '../features/auth/useSession'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element | null {
  const { user, loading } = useSession()
  const account = useAccount(user?.uid)
  const location = useLocation()

  if (loading) {
    return null
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // Being signed in with Google is not enough: the backend must also know the account.
  switch (account.status) {
    case 'loading':
      return null
    case 'denied':
      return <AccessDeniedPage />
    case 'error':
      return (
        <main className="flex min-h-screen items-center justify-center px-4">
          <div
            role="alert"
            className="flex items-center gap-3 rounded border border-error/30 bg-error/10 px-4 py-3 text-caption text-error"
          >
            <span>No se pudo comprobar tu acceso.</span>
            <button
              type="button"
              onClick={account.retry}
              className="font-semibold underline hover:text-error/80"
            >
              Reintentar
            </button>
          </div>
        </main>
      )
    case 'active':
      return <>{children}</>
  }
}
