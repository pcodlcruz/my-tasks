import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiClientError, apiFetch } from '../lib/apiClient'
import type { Progress } from './types'

export const PROGRESS_QUERY_KEY = ['progress'] as const

export function getProgress(): Promise<Progress> {
  return apiFetch<Progress>('/api/v1/me/progress')
}

// Today's scoreboard. The server closes the days left behind and generates the scheduled tasks
// before answering, so it is never taken as fresh (`staleTime` 0): every screen that shows it, and
// every return to the tab, asks again, which is also how a new day (from 04:00) shows up. One
// retry only, like the profile: with the API down the board must not wait for it (FR-034). On a
// failed reload TanStack Query keeps the last value, so the scoreboard keeps showing it.
export function useProgress() {
  return useQuery({
    queryKey: PROGRESS_QUERY_KEY,
    queryFn: getProgress,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: true,
  })
}

export function invalidateProgress(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY })
}

export function markReviewSeen(): Promise<Progress> {
  return apiFetch<Progress>('/api/v1/me/progress/review', { method: 'POST' })
}

export function setMission(taskIds: string[]): Promise<Progress> {
  return apiFetch<Progress>('/api/v1/me/progress/today/mission', {
    method: 'PUT',
    body: JSON.stringify({ task_ids: taskIds }),
  })
}

// Both answer with today's whole scoreboard, which replaces the cached one. Neither is applied
// ahead of time: a mission the server refuses must not show as chosen.
function useStoreProgress(): (progress: Progress) => void {
  const queryClient = useQueryClient()
  return (progress) => {
    queryClient.setQueryData(PROGRESS_QUERY_KEY, progress)
  }
}

// Idempotent: after it, `show_review` is false on every device for the rest of the day.
export function useMarkReviewSeen() {
  const storeProgress = useStoreProgress()
  return useMutation({ mutationFn: markReviewSeen, onSuccess: storeProgress })
}

export function useSetMission() {
  const storeProgress = useStoreProgress()
  return useMutation({ mutationFn: setMission, onSuccess: storeProgress })
}

const MISSION_INVALID_MESSAGE =
  'Alguna de esas tareas ya no está activa. Revisa la misión y vuelve a intentarlo.'
const MISSION_GENERIC_ERROR = 'No se pudo guardar la misión. Inténtalo de nuevo.'

// What to tell the person when the mission is refused. Never the server's own text.
export function missionErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'mission_invalid_task') {
    return MISSION_INVALID_MESSAGE
  }
  return MISSION_GENERIC_ERROR
}
