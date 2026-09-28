import { useTogglePin } from '../../api/tasks'
import type { Task } from '../../api/types'
import { SCOPE_LABELS } from '../../api/types'

interface TaskCardProps {
  task: Task
  onEdit: (task: Task) => void
}

const SCOPE_BADGE_STYLE: Record<Task['scope'], string> = {
  work: 'bg-purple-50 text-scope-work border-purple-200',
  personal: 'bg-teal-50 text-scope-personal border-teal-200',
}

export function TaskCard({ task, onEdit }: TaskCardProps): JSX.Element {
  const { togglePin, isPending } = useTogglePin()

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
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void togglePin(task)}
            disabled={isPending}
            className="rounded p-1 text-caption text-text-muted hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {task.pinned ? 'Desfijar' : 'Fijar'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded p-1 text-caption text-text-muted hover:bg-surface-alt hover:text-text"
          >
            Editar
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold ${SCOPE_BADGE_STYLE[task.scope]}`}
        >
          {SCOPE_LABELS[task.scope]}
        </span>
      </div>
    </article>
  )
}
