import type { Task } from '../../api/types'
import { ScopeBadge } from '../shared/TaskBadges'

export const MAX_MISSION_TASKS = 5

export interface MissionSection {
  id: string
  title: string
  tasks: Task[]
  emptyText: string
}

interface MissionPickerProps {
  sections: MissionSection[]
  // The ids chosen so far, including mission tasks already completed today (they still count).
  selected: string[]
  onToggle: (taskId: string) => void
}

const FULL_REASON_ID = 'mission-full-reason'

// The mission selector of S8: one toggle button per active task, in lists. Up to five tasks; once
// there are five, the others say why they cannot be added. Only active tasks are offered: the
// server would refuse any other (FR-004).
export function MissionPicker({ sections, selected, onToggle }: MissionPickerProps): JSX.Element {
  const full = selected.length >= MAX_MISSION_TASKS

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-caption font-semibold text-text">
        <span aria-hidden="true" className="text-gold">
          ★
        </span>
        Misión del día: {selected.length} de {MAX_MISSION_TASKS} elegidas
      </p>
      {full && (
        <p id={FULL_REASON_ID} className="sr-only">
          La misión ya tiene 5 tareas.
        </p>
      )}
      {sections.map((section) => {
        const tasks = section.tasks.filter((task) => task.status === 'active' && !task.in_trash)
        const headingId = `mission-section-${section.id}`
        return (
          <div key={section.id} role="group" aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-2 text-body-strong text-text">
              {section.title}
            </h3>
            {tasks.length === 0 ? (
              <p className="text-caption text-text-muted">{section.emptyText}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tasks.map((task) => {
                  const chosen = selected.includes(task.id)
                  const blocked = !chosen && full
                  return (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="break-words text-body text-text">{task.title}</p>
                        <ScopeBadge scope={task.scope} />
                      </div>
                      <button
                        type="button"
                        aria-label={`Añadir a la misión: ${task.title}`}
                        aria-pressed={chosen}
                        aria-describedby={blocked ? FULL_REASON_ID : undefined}
                        disabled={blocked}
                        onClick={() => onToggle(task.id)}
                        className={
                          chosen
                            ? 'flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-gold bg-surface px-3 py-1.5 text-caption font-semibold text-gold'
                            : 'flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-caption text-text-muted hover:bg-surface-alt disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text'
                        }
                      >
                        <span aria-hidden="true">{chosen ? '★' : '☆'}</span>
                        {chosen ? 'En misión' : 'Añadir a la misión'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
