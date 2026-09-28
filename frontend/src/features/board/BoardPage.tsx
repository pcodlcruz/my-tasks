import { useState } from 'react'
import { useBoardTasks } from '../../api/tasks'
import type { Quadrant as QuadrantKey, Task } from '../../api/types'
import { TaskForm } from '../task-form/TaskForm'
import { Quadrant } from './Quadrant'
import { TaskCard } from './TaskCard'

const CANONICAL_QUADRANTS: QuadrantKey[] = ['do_now', 'schedule', 'delegate', 'eliminate']

function groupByQuadrant(tasks: Task[]): Record<QuadrantKey, Task[]> {
  const groups: Record<QuadrantKey, Task[]> = {
    do_now: [],
    schedule: [],
    delegate: [],
    eliminate: [],
  }
  for (const task of tasks) {
    groups[task.quadrant].push(task)
  }
  return groups
}

export function BoardPage(): JSX.Element {
  const { data } = useBoardTasks()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const groups = groupByQuadrant(data?.items ?? [])

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-display font-display text-text">Matriz de prioridades</h1>
        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          + Nueva tarea
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {CANONICAL_QUADRANTS.map((quadrant) => (
          <Quadrant key={quadrant} quadrant={quadrant} count={groups[quadrant].length}>
            {groups[quadrant].length > 0 && (
              <div className="flex flex-1 flex-col gap-3">
                {groups[quadrant].map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </Quadrant>
        ))}
      </div>
      {isFormOpen && <TaskForm onClose={() => setIsFormOpen(false)} />}
    </main>
  )
}
