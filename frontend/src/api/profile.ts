import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ApiClientError, apiFetch, apiFetchBlob } from '../lib/apiClient'
import type { Avatar, Profile, ProfileUpdate } from './types'

export const PROFILE_QUERY_KEY = ['profile'] as const

export function getProfile(): Promise<Profile> {
  return apiFetch<Profile>('/api/v1/me/profile')
}

export function updateProfile(update: ProfileUpdate): Promise<Profile> {
  return apiFetch<Profile>('/api/v1/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

export function resetProfile(): Promise<Profile> {
  return apiFetch<Profile>('/api/v1/me/profile', { method: 'DELETE' })
}

// One retry only (like `useAccount`): with the API down, TanStack Query's default of three
// retries with backoff would hold the screens that wait for the profile for several seconds.
export function useProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getProfile,
    retry: 1,
    refetchOnWindowFocus: true,
  })
}

// The settings apply as soon as they are chosen and go back to the saved value if the server
// refuses them. A change of avatar is not applied ahead of time: its version and image only
// exist once the server has answered.
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateProfile,
    onMutate: async (update) => {
      const previous = queryClient.getQueryData<Profile>(PROFILE_QUERY_KEY)
      if (previous !== undefined && update.avatar === undefined) {
        // Synchronous, before any await: the control the person just clicked is controlled by
        // this cache, and would flicker back to its old value for a render otherwise.
        queryClient.setQueryData<Profile>(PROFILE_QUERY_KEY, { ...previous, ...update } as Profile)
        // A refetch already in flight must not overwrite the choice with the old value.
        await queryClient.cancelQueries({ queryKey: PROFILE_QUERY_KEY })
      }
      return { previous }
    },
    onError: (_error, _update, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(PROFILE_QUERY_KEY, context.previous)
      }
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, profile)
    },
  })
}

export function useResetProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, profile)
    },
  })
}

export function uploadAvatar(picture: Blob): Promise<Profile> {
  return apiFetch<Profile>('/api/v1/me/avatar', {
    method: 'PUT',
    // The raw image: the server identifies it by its content, the type is only informative.
    headers: { 'Content-Type': picture.type },
    body: picture,
  })
}

export function removeAvatar(): Promise<Profile> {
  return apiFetch<Profile>('/api/v1/me/avatar', { method: 'DELETE' })
}

// The server's answer replaces the cached profile: the new avatar version is what makes the
// image get downloaded again.
export function useUploadAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, profile)
    },
  })
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeAvatar,
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, profile)
    },
  })
}

const AVATAR_QUERY_KEY = 'avatar'
const revokerInstalled = new WeakSet<QueryClient>()

// The avatar is cached as a `blob:` URL, which keeps its bytes alive until it is revoked. This
// revokes each one as its query leaves the cache: when nobody shows that version any more, or
// when the whole cache is cleared because another person signed in. Idempotent per client.
export function ensureAvatarUrlRevoker(queryClient: QueryClient): void {
  if (revokerInstalled.has(queryClient)) return
  revokerInstalled.add(queryClient)
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'removed') return
    const [scope] = event.query.queryKey
    const url: unknown = event.query.state.data
    if (scope === AVATAR_QUERY_KEY && typeof url === 'string') URL.revokeObjectURL(url)
  })
}

// The image of an uploaded avatar as a `blob:` URL. An <img src> cannot send the token, so it is
// downloaded with `fetch` (the browser's HTTP cache keeps it: `immutable`, and `?v=` changes
// with each new image) and shown from memory. `undefined` while loading, if it fails, or if the
// avatar is not an upload: the caller then shows the initials.
export function useAvatarUrl(avatar: Avatar | undefined): string | undefined {
  const queryClient = useQueryClient()
  useEffect(() => {
    ensureAvatarUrlRevoker(queryClient)
  }, [queryClient])
  const version = avatar?.version ?? 0
  const query = useQuery({
    queryKey: [AVATAR_QUERY_KEY, version],
    queryFn: async () => URL.createObjectURL(await apiFetchBlob(`/api/v1/me/avatar?v=${version}`)),
    enabled: avatar?.kind === 'upload',
    staleTime: Infinity,
    // Dropped (and so revoked) as soon as no component shows this version.
    gcTime: 0,
    retry: 1,
  })
  return avatar?.kind === 'upload' ? query.data : undefined
}

const AVATAR_ERROR_MESSAGES: Record<string, string> = {
  avatar_too_large: 'La imagen supera los 2 MB.',
  avatar_unsupported: 'La imagen no es válida. Usa un archivo JPEG, PNG o WebP.',
  avatar_rate_limited: 'Has subido demasiadas imágenes. Espera unos minutos.',
}

const AVATAR_GENERIC_ERROR = 'No se pudo subir la imagen. Inténtalo de nuevo.'

// What to tell the person when an upload fails. Messages are written here, never taken from the
// server: a network failure or any unexpected error gets the generic one.
export function avatarErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return AVATAR_ERROR_MESSAGES[error.code] ?? AVATAR_GENERIC_ERROR
  }
  return AVATAR_GENERIC_ERROR
}
