import { useHistory, useReopenTask, useTrashTask } from '../../api/tasks'
import type { Task } from '../../api/types'
import { dayKey, formatCompletedAt, formatDayHeading } from '../../lib/dates'
import { QuadrantBadge, ScopeBadge } from '../shared/TaskBadges'
import { TaskRow } from '../shared/TaskRow'

interface DayGroup {
  key: string
  heading: string
  tasks: Task[]
}

// The server already returns tasks by `completed_at` descending, so it is enough
// to group consecutive tasks that share the same day.
function groupByCompletionDay(tasks: Task[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const task of tasks) {
    const completedAt = task.completed_at ?? task.updated_at
    const key = dayKey(completedAt)
    const last = groups[groups.length - 1]
    if (last?.key === key) {
      last.tasks.push(task)
    } else {
      groups.push({ key, heading: formatDayHeading(completedAt), tasks: [task] })
    }
  }
  return groups
}

const ACTION_BUTTON =
  'rounded-lg border border-border bg-surface px-3 py-1.5 text-caption font-semibold text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60'

export function HistoryPage(): JSX.Element {
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useHistory()
  const reopen = useReopenTask()
  const trash = useTrashTask()
  const tasks = data?.pages.flatMap((page) => page.items) ?? []
  const groups = groupByCompletionDay(tasks)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-display font-display text-text">Historial</h1>
        <p className="mt-1 text-caption text-text-muted">
          Tareas completadas, las más recientes primero.
        </p>
      </div>

      {isLoading && (
        <div role="status" aria-label="Cargando historial" className="flex flex-col gap-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-lg bg-surface-alt" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/10 p-4 text-error"
        >
          <span>No se pudo cargar el historial.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-semibold underline hover:text-error/80"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && tasks.length === 0 && (
        <div className="rounded-xl border border-border bg-surface-alt p-8 text-center">
          <p className="text-body font-semibold text-text">Aún no has completado ninguna tarea</p>
          <p className="mt-1 text-caption text-text-muted">
            Cuando completes una desde el tablero, aparecerá aquí.
          </p>
        </div>
      )}

      {!isLoading && !isError && tasks.length > 0 && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2 border-b border-border pb-2">
                <h2 className="text-heading font-heading text-text">{group.heading}</h2>
                <span className="text-caption text-text-muted">
                  ({group.tasks.length} {group.tasks.length === 1 ? 'tarea' : 'tareas'})
                </span>
              </div>
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  struckThrough
                  meta={
                    <>
                      <QuadrantBadge quadrant={task.quadrant} />
                      <ScopeBadge scope={task.scope} />
                      <span className="text-caption text-text-muted">
                        {formatCompletedAt(task.completed_at ?? task.updated_at)}
                      </span>
                    </>
                  }
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => reopen.mutate(task.id)}
                        disabled={reopen.isPending}
                        className={ACTION_BUTTON}
                      >
                        Reabrir
                      </button>
                      <button
                        type="button"
                        onClick={() => trash.mutate(task.id)}
                        disabled={trash.isPending}
                        className={ACTION_BUTTON}
                      >
                        Mover a la papelera
                      </button>
                    </>
                  }
                />
              ))}
            </section>
          ))}
          {hasNextPage && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className={ACTION_BUTTON}
              >
                Cargar más
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
