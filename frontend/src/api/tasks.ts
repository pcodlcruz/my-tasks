import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import type { Scope, Task, TaskCreate, TaskPage, TaskUpdate } from './types'
import { quadrantFor } from './types'

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

interface UpdateTaskVariables {
  taskId: string
  data: TaskUpdate
}

function applyOptimisticUpdate(task: Task, data: TaskUpdate): Task {
  const merged = { ...task, ...data }
  return { ...merged, quadrant: quadrantFor(merged.urgent, merged.important) }
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, data }: UpdateTaskVariables) =>
      apiFetch<Task>(`/api/v1/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onMutate: async ({ taskId, data }: UpdateTaskVariables) => {
      await queryClient.cancelQueries({ queryKey: BOARD_QUERY_KEY })
      const previous = queryClient.getQueriesData<TaskPage>({ queryKey: BOARD_QUERY_KEY })
      queryClient.setQueriesData<TaskPage>({ queryKey: BOARD_QUERY_KEY }, (page) => {
        if (!page) return page
        return {
          ...page,
          items: page.items.map((task) =>
            task.id === taskId ? applyOptimisticUpdate(task, data) : task,
          ),
        }
      })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY })
    },
  })
}

export function useTogglePin() {
  const { mutateAsync, isPending } = useUpdateTask()
  return {
    isPending,
    togglePin: (task: Task) => mutateAsync({ taskId: task.id, data: { pinned: !task.pinned } }),
  }
}
