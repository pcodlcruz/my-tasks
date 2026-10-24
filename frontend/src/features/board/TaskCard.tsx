import { useCompleteTask, useTogglePin, useTrashTask } from '../../api/tasks'
import type { Task } from '../../api/types'
import { ScopeBadge } from '../shared/TaskBadges'

interface TaskCardProps {
  task: Task
  onEdit: (task: Task) => void
}

const TEXT_BUTTON =
  'rounded p-1 text-caption text-text-muted hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-60'

// Spacing comes from the density variables (src/index.css). Compact lays the card out in one
// row (title and actions, then scope and "Completar") so more tasks fit in the same height.
const ARTICLE =
  'rounded-lg border border-border bg-surface p-[var(--card-padding)] shadow-sm compact:flex compact:flex-wrap compact:items-center compact:gap-x-3'
const HEADER =
  'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between compact:min-w-0 compact:flex-1 compact:items-center'
const FOOTER =
  'mt-[var(--card-inner-gap)] flex items-center justify-between border-t border-border/60 pt-[var(--card-footer-gap)] compact:mt-0 compact:shrink-0 compact:gap-3 compact:border-t-0 compact:pt-0'

export function TaskCard({ task, onEdit }: TaskCardProps): JSX.Element {
  const { togglePin, isPending: isPinPending } = useTogglePin()
  const complete = useCompleteTask()
  const trash = useTrashTask()

  return (
    <article className={ARTICLE}>
      <div className={HEADER}>
        <p className="flex min-w-0 items-center gap-1.5 break-words text-body font-semibold text-text">
          {task.pinned && (
            <span aria-label="Fijada" title="Fijada">
              📌
            </span>
          )}
          {task.title}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
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
      <div className={FOOTER}>
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
