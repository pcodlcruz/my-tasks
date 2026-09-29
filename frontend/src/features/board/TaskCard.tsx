import { useCompleteTask, useTogglePin, useTrashTask } from '../../api/tasks'
import type { Task } from '../../api/types'
import { ScopeBadge } from '../shared/TaskBadges'

interface TaskCardProps {
  task: Task
  onEdit: (task: Task) => void
}

const TEXT_BUTTON =
  'rounded p-1 text-caption text-text-muted hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-60'

export function TaskCard({ task, onEdit }: TaskCardProps): JSX.Element {
  const { togglePin, isPending: isPinPending } = useTogglePin()
  const complete = useCompleteTask()
  const trash = useTrashTask()

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-body font-semibold text-text">
          {task.pinned && (
            <span aria-label="Fijada" title="Fijada">
              📌
            </span>
          )}
          {task.title}
        </p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => void togglePin(task)}
            disabled={isPinPending}
            className={TEXT_BUTTON}
          >
            {task.pinned ? 'Desfijar' : 'Fijar'}
          </button>
          <button type="button" onClick={() => onEdit(task)} className={TEXT_BUTTON}>
            Editar
          </button>
          <button
            type="button"
            onClick={() => trash.mutate(task.id)}
            disabled={trash.isPending}
            className={TEXT_BUTTON}
          >
            Mover a la papelera
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
        <ScopeBadge scope={task.scope} />
        <button
          type="button"
          onClick={() => complete.mutate(task.id)}
          disabled={complete.isPending}
          className="rounded-lg border border-success/40 px-3 py-1 text-caption font-semibold text-success hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Completar
        </button>
      </div>
    </article>
  )
}
