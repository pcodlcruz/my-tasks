import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiFetch, isStaleTaskError } from '../lib/apiClient'
import { useToastStore } from '../stores/toastStore'
import type { Scope, Task, TaskCreate, TaskPage, TaskUpdate } from './types'
import { quadrantFor } from './types'

const TASKS_QUERY_KEY = ['tasks'] as const
const BOARD_QUERY_KEY = ['tasks', 'board'] as const
const HISTORY_QUERY_KEY = ['tasks', 'history'] as const
const TRASH_QUERY_KEY = ['tasks', 'trash'] as const
const PAGE_SIZE = 20

const STALE_TASK_MESSAGE = 'La tarea cambió en otra ventana'
const GENERIC_ERROR_MESSAGE = 'No se pudo completar la acción. Inténtalo de nuevo.'

// Cualquier mutación que falle refresca todas las vistas (tablero, historial y
// papelera) y avisa: si la tarea cambió en otra ventana, con ese mensaje.
function handleMutationError(queryClient: QueryClient, error: unknown): void {
  const { show } = useToastStore.getState()
  show(isStaleTaskError(error) ? STALE_TASK_MESSAGE : GENERIC_ERROR_MESSAGE)
  void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
}

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
    onError: (error, _variables, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
      handleMutationError(queryClient, error)
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

function usePagedTasks(view: 'history' | 'trash', queryKey: readonly string[]) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ view, limit: String(PAGE_SIZE) })
      if (pageParam) {
        params.set('cursor', pageParam)
      }
      return apiFetch<TaskPage>(`/api/v1/tasks?${params.toString()}`)
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  })
}

export function useHistory() {
  return usePagedTasks('history', HISTORY_QUERY_KEY)
}

export function useTrash() {
  return usePagedTasks('trash', TRASH_QUERY_KEY)
}

type TransitionAction = 'complete' | 'reopen' | 'trash' | 'restore'

function transitionRequest(taskId: string, action: TransitionAction): Promise<Task> {
  return apiFetch<Task>(`/api/v1/tasks/${taskId}/${action}`, { method: 'POST' })
}

function refreshAllViews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
}

function undoTrash(queryClient: QueryClient, taskId: string): void {
  transitionRequest(taskId, 'restore')
    .then(() => {
      refreshAllViews(queryClient)
      useToastStore.getState().show('Tarea restaurada')
    })
    .catch((error: unknown) => handleMutationError(queryClient, error))
}

function useTransition(
  action: TransitionAction,
  onSuccess: (task: Task, queryClient: QueryClient) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => transitionRequest(taskId, action),
    onSuccess: (task) => {
      refreshAllViews(queryClient)
      onSuccess(task, queryClient)
    },
    onError: (error) => handleMutationError(queryClient, error),
  })
}

export function useCompleteTask() {
  return useTransition('complete', () => useToastStore.getState().show('Tarea completada'))
}

export function useReopenTask() {
  return useTransition('reopen', () => useToastStore.getState().show('Tarea reabierta'))
}

export function useTrashTask() {
  return useTransition('trash', (task, queryClient) =>
    useToastStore.getState().show('Tarea movida a la papelera', {
      label: 'Deshacer',
      onAction: () => undoTrash(queryClient, task.id),
    }),
  )
}

export function useRestoreTask() {
  return useTransition('restore', () => useToastStore.getState().show('Tarea restaurada'))
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) =>
      apiFetch<undefined>(`/api/v1/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refreshAllViews(queryClient)
      useToastStore.getState().show('Tarea eliminada definitivamente')
    },
    onError: (error) => handleMutationError(queryClient, error),
  })
}
