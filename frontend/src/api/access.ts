import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, isStaleAccessError, isUserFacingError } from '../lib/apiClient'
import { useToastStore } from '../stores/toastStore'
import type { Account, AccessList, InviteResult } from './types'

const ACCESS_QUERY_KEY = ['admin', 'access'] as const

const GENERIC_ERROR_MESSAGE = 'No se pudo completar la acción. Inténtalo de nuevo.'
const STALE_ACCESS_MESSAGE = 'La lista de accesos cambió en otra ventana'

// Also the call that turns a pending invitation into an account the first time the
// invited person signs in, so it must run once after every sign-in.
export function getMe(): Promise<Account> {
  return apiFetch<Account>('/api/v1/me')
}

export function listAccess(): Promise<AccessList> {
  return apiFetch<AccessList>('/api/v1/admin/access')
}

export function createInvitation(email: string): Promise<InviteResult> {
  return apiFetch<InviteResult>('/api/v1/admin/invitations', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function revokeInvitation(email: string): Promise<undefined> {
  return apiFetch<undefined>(`/api/v1/admin/invitations/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  })
}

export function revokeUserAccess(uid: string): Promise<undefined> {
  return apiFetch<undefined>(`/api/v1/admin/users/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
  })
}

export function useAccessList() {
  return useQuery({ queryKey: ACCESS_QUERY_KEY, queryFn: listAccess })
}

// A list request that is still in flight (the first load, on a slow connection) would swallow a
// plain invalidation: with no data yet, TanStack Query lets the new refetch join it, and its
// answer was computed before this change. So that request is dropped first and asked again.
function refreshAccess(queryClient: QueryClient): void {
  void queryClient
    .cancelQueries({ queryKey: ACCESS_QUERY_KEY })
    .then(() => queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEY }))
}

function inviteMessage(result: InviteResult): string {
  switch (result.outcome) {
    case 'invited':
      return `Invitación creada para ${result.email}`
    case 'already_pending':
      return `${result.email} ya tenía una invitación pendiente`
    case 'reactivated':
      return `Se ha restablecido el acceso de ${result.email}`
  }
}

// The form shows an invitation's failure next to the field, so there is no toast here.
export function useInviteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createInvitation,
    onSuccess: (result) => {
      refreshAccess(queryClient)
      useToastStore.getState().show(inviteMessage(result))
    },
    onError: () => refreshAccess(queryClient),
  })
}

// A revocation that fails shows a toast and refreshes the lists: the server's own message
// for a rule (an administrator cannot be revoked), "changed in another window" if the item
// is gone, or a generic one.
function handleRevokeError(queryClient: QueryClient, error: unknown): void {
  let message = GENERIC_ERROR_MESSAGE
  if (isUserFacingError(error)) message = error.message
  else if (isStaleAccessError(error)) message = STALE_ACCESS_MESSAGE
  useToastStore.getState().show(message)
  refreshAccess(queryClient)
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => {
      refreshAccess(queryClient)
      useToastStore.getState().show('Invitación revocada')
    },
    onError: (error) => handleRevokeError(queryClient, error),
  })
}

export function useRevokeUserAccess() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeUserAccess,
    onSuccess: () => {
      refreshAccess(queryClient)
      useToastStore.getState().show('Acceso retirado')
    },
    onError: (error) => handleRevokeError(queryClient, error),
  })
}
