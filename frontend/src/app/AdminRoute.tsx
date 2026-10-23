import { Navigate, Outlet } from 'react-router-dom'
import { useIsAdmin } from '../features/auth/useIsAdmin'

// Routes only an administrator should reach; anyone else goes back to the board. Used inside
// ProtectedRoute, which has already settled the session and the account.
export function AdminRoute(): JSX.Element {
  const isAdmin = useIsAdmin()
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />
}
