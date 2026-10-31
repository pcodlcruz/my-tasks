import { type QueryClient, useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
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
