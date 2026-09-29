import type { ReactNode } from 'react'
import type { Quadrant, Task } from '../../api/types'

interface TaskRowProps {
  task: Task
  struckThrough?: boolean
  meta: ReactNode
  actions: ReactNode
}

// Full literal class names on purpose (see Quadrant.tsx).
const QUADRANT_ROW_ACCENT: Record<Quadrant, string> = {
  do_now: 'border-l-quadrant-do-now-accent',
  schedule: 'border-l-quadrant-schedule-accent',
  delegate: 'border-l-quadrant-delegate-accent',
  eliminate: 'border-l-quadrant-eliminate-accent',
}

export function TaskRow({ task, struckThrough = false, meta, actions }: TaskRowProps): JSX.Element {
  return (
    <article
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-4 border-border bg-surface p-4 shadow-card ${QUADRANT_ROW_ACCENT[task.quadrant]}`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`break-words text-body-strong ${struckThrough ? 'text-text-muted line-through' : 'text-text'}`}
        >
          {task.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
    </article>
  )
}
