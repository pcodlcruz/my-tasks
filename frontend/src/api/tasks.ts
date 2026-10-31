import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiFetch, isStaleTaskError, isUserFacingError } from '../lib/apiClient'
import { useToastStore } from '../stores/toastStore'
import { invalidateProgress } from './progress'
import type {
  BoardOrder,
  HistoryDays,
  Scope,
  Task,
  TaskCreate,
  TaskPage,
  TaskUpdate,
} from './types'
import { quadrantFor } from './types'

const TASKS_QUERY_KEY = ['tasks'] as const
const BOARD_QUERY_KEY = ['tasks', 'board'] as const
const HISTORY_QUERY_KEY = ['tasks', 'history'] as const
const TRASH_QUERY_KEY = ['tasks', 'trash'] as const
const PAGE_SIZE = 20

const STALE_TASK_MESSAGE = 'La tarea cambió en otra ventana'
const GENERIC_ERROR_MESSAGE = 'No se pudo completar la acción. Inténtalo de nuevo.'

function errorMessage(error: unknown): string {
  if (isStaleTaskError(error)) return STALE_TASK_MESSAGE
  if (isUserFacingError(error)) return error.message
  return GENERIC_ERROR_MESSAGE
}

// Any failed mutation refreshes every view (board, history and trash) and shows a
// toast: the "changed in another window" message if the task went stale, or the
// server's own message for a limit or a session-verifier outage.
function handleMutationError(queryClient: QueryClient, error: unknown): void {
  useToastStore.getState().show(errorMessage(error))
  void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
}

export function boardQueryKey(
  scope?: Scope,
  order: BoardOrder = 'oldest',
): readonly [string, string, string, string] {
  return [...BOARD_QUERY_KEY, scope ?? 'all', order]
}

// `enabled` lets the board wait for the profile (its default scope and order) so it never asks
// for, and shows, a board with the wrong filter. The default order is not sent: the request is
// then the same one that was made before the profile existed.
export function useBoardTasks(scope?: Scope, order: BoardOrder = 'oldest', enabled = true) {
  return useQuery({
    queryKey: boardQueryKey(scope, order),
    enabled,
    queryFn: () => {
      const params = new URLSearchParams({ view: 'board' })
      if (scope) {
        params.set('scope', scope)
      }
      if (order !== 'oldest') {
        params.set('order', order)
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
    onError: (error) => handleMutationError(queryClient, error),
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

interface PagedOptions {
  withinDays?: HistoryDays
  enabled?: boolean
}

function usePagedTasks(
  view: 'history' | 'trash',
  queryKey: readonly string[],
  { withinDays = null, enabled = true }: PagedOptions = {},
) {
  return useInfiniteQuery({
    queryKey: [...queryKey, withinDays ?? 'all'],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ view, limit: String(PAGE_SIZE) })
      if (pageParam) {
        params.set('cursor', pageParam)
      }
      if (withinDays !== null) {
        params.set('within_days', String(withinDays))
      }
      return apiFetch<TaskPage>(`/api/v1/tasks?${params.toString()}`)
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  })
}

export function useHistory(withinDays: HistoryDays = null, enabled = true) {
  return usePagedTasks('history', HISTORY_QUERY_KEY, { withinDays, enabled })
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
      invalidateProgress(queryClient)
      useToastStore.getState().show('Tarea restaurada')
    })
    .catch((error: unknown) => handleMutationError(queryClient, error))
}

// Completing, reopening and moving to the trash can change today's progress, so the scoreboard is
// asked for again with the views. Restoring does not change it today; it is refreshed too so the
// scoreboard does not depend on which transitions the server counts.
function useTransition(
  action: TransitionAction,
  onSuccess: (task: Task, queryClient: QueryClient) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => transitionRequest(taskId, action),
    onSuccess: (task) => {
      refreshAllViews(queryClient)
      invalidateProgress(queryClient)
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
