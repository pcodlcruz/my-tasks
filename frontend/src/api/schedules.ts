import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, isUserFacingError } from '../lib/apiClient'
import { useToastStore } from '../stores/toastStore'
import { PROGRESS_QUERY_KEY } from './progress'
import type { Schedule, ScheduleCreate, ScheduleUpdate } from './types'

export const SCHEDULES_QUERY_KEY = ['schedules'] as const
const TASKS_QUERY_KEY = ['tasks'] as const

const GENERIC_ERROR_MESSAGE = 'No se pudo completar la acción. Inténtalo de nuevo.'

interface SchedulePage {
  items: Schedule[]
}

export function useSchedules() {
  return useQuery({
    queryKey: SCHEDULES_QUERY_KEY,
    queryFn: () => apiFetch<SchedulePage>('/api/v1/schedules'),
    select: (page) => page.items,
    retry: 1,
  })
}

// A change may make a task due today appear (creating, editing or resuming one for today), and
// the server only generates it when the progress is read: so the progress is asked for again
// first and, once it is answered, the board. Awaited, so the form closes onto a board that
// already has the task.
async function refreshAfterChange(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY })
  await queryClient.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY })
  await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
}

// The 50-schedule limit and a finished schedule come with a message written for the person; any
// other failure gets the generic one, never the server's own text. The list is read again: the
// schedule may have finished or disappeared in another window.
function reportFailure(queryClient: QueryClient, error: unknown): void {
  const message = isUserFacingError(error) ? error.message : GENERIC_ERROR_MESSAGE
  useToastStore.getState().show(message)
  void queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY })
}

function useScheduleMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => refreshAfterChange(queryClient),
    onError: (error) => reportFailure(queryClient, error),
  })
}

export function useCreateSchedule() {
  return useScheduleMutation((data: ScheduleCreate) =>
    apiFetch<Schedule>('/api/v1/schedules', { method: 'POST', body: JSON.stringify(data) }),
  )
}

interface UpdateScheduleVariables {
  id: string
  data: ScheduleUpdate
}

export function useUpdateSchedule() {
  return useScheduleMutation(({ id, data }: UpdateScheduleVariables) =>
    apiFetch<Schedule>(`/api/v1/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  )
}

export function usePauseSchedule() {
  return useScheduleMutation((id: string) =>
    apiFetch<Schedule>(`/api/v1/schedules/${id}/pause`, { method: 'POST' }),
  )
}

export function useResumeSchedule() {
  return useScheduleMutation((id: string) =>
    apiFetch<Schedule>(`/api/v1/schedules/${id}/resume`, { method: 'POST' }),
  )
}

// The tasks it already generated stay on the board.
export function useDeleteSchedule() {
  return useScheduleMutation((id: string) =>
    apiFetch<undefined>(`/api/v1/schedules/${id}`, { method: 'DELETE' }),
  )
}
