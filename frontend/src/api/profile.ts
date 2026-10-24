import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import type { Profile, ProfileUpdate } from './types'

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
