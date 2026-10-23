import { useAccount } from './useAccount'
import { useSession } from './useSession'

// Whether the signed-in account is an administrator. Only decides what to show: every
// /api/v1/admin call is authorized again by the server, so a wrong answer here never
// grants anything. Shares the account query with ProtectedRoute, so it costs no request.
export function useIsAdmin(): boolean {
  const { user } = useSession()
  const account = useAccount(user?.uid)
  return account.status === 'active' && account.account.role === 'admin'
}
