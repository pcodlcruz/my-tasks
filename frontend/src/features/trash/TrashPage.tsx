import { useState } from 'react'
import { useDeleteTask, useRestoreTask, useTrash } from '../../api/tasks'
import type { Task } from '../../api/types'
import { ConfirmDialog } from '../../app/ConfirmDialog'
import { formatPurgeNotice } from '../../lib/dates'
import { QuadrantBadge, ScopeBadge } from '../shared/TaskBadges'
import { TaskRow } from '../shared/TaskRow'

const ACTION_BUTTON =
  'rounded-lg border border-border bg-surface px-3 py-1.5 text-caption font-semibold text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60'

const DELETE_BUTTON =
  'rounded-lg border border-error/40 bg-surface px-3 py-1.5 text-caption font-semibold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60'

export function TrashPage(): JSX.Element {
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useTrash()
  const restore = useRestoreTask()
  const deleteTask = useDeleteTask()
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)
  const tasks = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-display font-display text-text">Papelera</h1>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-blue-200 bg-quadrant-schedule-surface p-3">
        <span aria-hidden="true">ℹ️</span>
        <p className="text-caption text-text">
          Las tareas se eliminan automáticamente a los 30 días.
        </p>
      </div>

      {isLoading && (
        <div role="status" aria-label="Cargando papelera" className="flex flex-col gap-3">
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
          <span>No se pudo cargar la papelera.</span>
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
          <p className="text-body font-semibold text-text">La papelera está vacía</p>
        </div>
      )}

      {!isLoading && !isError && tasks.length > 0 && (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              meta={
                <>
                  <ScopeBadge scope={task.scope} />
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-alt px-2 py-0.5 text-caption font-semibold text-text">
                    {task.status === 'completed' ? 'Completada' : 'Activa'}
                  </span>
                  <QuadrantBadge quadrant={task.quadrant} />
                  {task.purge_at && (
                    <span className="text-caption text-text-muted">
                      {formatPurgeNotice(task.purge_at)}
                    </span>
                  )}
                </>
              }
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => restore.mutate(task.id)}
                    disabled={restore.isPending}
                    className={ACTION_BUTTON}
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(task)}
                    className={DELETE_BUTTON}
                  >
                    Eliminar definitivamente
                  </button>
                </>
              }
            />
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-3">
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

      {pendingDelete && (
        <ConfirmDialog
          title="¿Eliminar definitivamente?"
          message={`«${pendingDelete.title}» se borrará para siempre. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar definitivamente"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteTask.mutate(pendingDelete.id)
            setPendingDelete(null)
          }}
        />
      )}
    </main>
  )
}
