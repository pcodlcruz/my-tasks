import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useSession } from '../features/auth/useSession'

/**
 * Drops every cached query when the signed-in user changes (sign-out included),
 * so one person's tasks or admin lists are never shown to the next one.
 */
export function SessionCacheReset(): null {
  const queryClient = useQueryClient()
  const { user, loading } = useSession()
  const uid = user?.uid ?? null
  // `undefined` until the first session check ends: that first load is not a change.
  const previousUid = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (loading) return
    if (previousUid.current !== undefined && previousUid.current !== uid) {
      queryClient.clear()
    }
    previousUid.current = uid
  }, [loading, uid, queryClient])

  return null
}
