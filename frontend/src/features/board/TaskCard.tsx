import type { Task } from '../../api/types'
import { SCOPE_LABELS } from '../../api/types'

interface TaskCardProps {
  task: Task
}

const SCOPE_BADGE_STYLE: Record<Task['scope'], string> = {
  work: 'bg-purple-50 text-scope-work border-purple-200',
  personal: 'bg-teal-50 text-scope-personal border-teal-200',
}

export function TaskCard({ task }: TaskCardProps): JSX.Element {
  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-body font-semibold text-text">{task.title}</p>
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
