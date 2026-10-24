import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { ensureAvatarUrlRevoker } from '../api/profile'
import { useSession } from '../features/auth/useSession'
import { useUiStore } from '../stores/uiStore'

/**
 * Drops every cached query, and the board filter, when the signed-in user changes (sign-out
 * included), so one person's tasks, admin lists or filter are never shown to the next one.
 */
export function SessionCacheReset(): null {
  const queryClient = useQueryClient()
  // So that clearing the cache also releases the avatar images held as blob: URLs.
  useEffect(() => {
    ensureAvatarUrlRevoker(queryClient)
  }, [queryClient])
  const { user, loading } = useSession()
  const uid = user?.uid ?? null
  // `undefined` until the first session check ends: that first load is not a change.
  const previousUid = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (loading) return
    if (previousUid.current !== undefined && previousUid.current !== uid) {
      queryClient.clear()
      // The next person starts from their own default scope, not the previous one's filter.
      useUiStore.getState().reset()
    }
    previousUid.current = uid
  }, [loading, uid, queryClient])

  return null
}
