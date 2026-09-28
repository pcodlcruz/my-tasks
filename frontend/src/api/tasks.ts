import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import type { Scope, Task, TaskCreate, TaskPage } from './types'

const BOARD_QUERY_KEY = ['tasks', 'board'] as const

export function boardQueryKey(scope?: Scope): readonly [string, string, string] {
  return [...BOARD_QUERY_KEY, scope ?? 'all']
}

export function useBoardTasks(scope?: Scope) {
  return useQuery({
    queryKey: boardQueryKey(scope),
    queryFn: () => {
      const params = new URLSearchParams({ view: 'board' })
      if (scope) {
        params.set('scope', scope)
      }
      return apiFetch<TaskPage>(`/api/v1/tasks?${params.toString()}`)
    },
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskCreate) =>
      apiFetch<Task>('/api/v1/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY })
    },
  })
}
