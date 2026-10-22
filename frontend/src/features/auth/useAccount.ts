import { useQuery } from '@tanstack/react-query'
import { getMe } from '../../api/access'
import type { Account } from '../../api/types'
import { isAccessDeniedError } from '../../lib/apiClient'

export type AccountState =
  | { status: 'loading' }
  | { status: 'active'; account: Account }
  | { status: 'denied' }
  | { status: 'error'; retry: () => void }

// The account of the signed-in user. Keyed by uid so a different user never sees the
// previous one's answer. A denial is final (no retry); any other failure is retried once.
export function useAccount(uid: string | undefined): AccountState {
  const query = useQuery({
    queryKey: ['account', uid],
    queryFn: getMe,
    enabled: uid !== undefined,
    retry: (failureCount, error) => !isAccessDeniedError(error) && failureCount < 1,
  })

  // Checked before the data: a refetch that now answers 403 means access was withdrawn
  // while the previous answer is still cached.
  if (query.isError && isAccessDeniedError(query.error)) {
    return { status: 'denied' }
  }
  if (query.isError) {
    return {
      status: 'error',
      retry: () => {
        void query.refetch()
      },
    }
  }
  if (query.data) {
    return { status: 'active', account: query.data }
  }
  return { status: 'loading' }
}
