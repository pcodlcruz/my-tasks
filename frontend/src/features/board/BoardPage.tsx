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
  const { data, isLoading, isError, refetch } = useBoardTasks()
  const [isCreating, setIsCreating] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const tasks = data?.items ?? []
  const groups = groupByQuadrant(tasks)
  const hasNoTasks = tasks.length === 0

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-display font-display text-text">Matriz de prioridades</h1>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          + Nueva tarea
        </button>
      </div>

      {isLoading && (
        <div
          role="status"
          aria-label="Cargando tablero"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {CANONICAL_QUADRANTS.map((quadrant) => (
            <div key={quadrant} className="h-48 animate-pulse rounded-xl bg-surface-alt" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/10 p-4 text-error"
        >
          <span>No se pudo cargar el tablero.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-semibold underline hover:text-error/80"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {hasNoTasks && (
            <div className="mb-6 rounded-xl border border-border bg-surface-alt p-6 text-center">
              <p className="text-body font-semibold text-text">¡Bienvenido a MyTasks!</p>
              <p className="mt-1 text-caption text-text-muted">
                Crea tu primera tarea para empezar a organizarte.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {CANONICAL_QUADRANTS.map((quadrant) => (
              <Quadrant key={quadrant} quadrant={quadrant} count={groups[quadrant].length}>
                {groups[quadrant].length > 0 && (
                  <div className="flex flex-1 flex-col gap-3">
                    {groups[quadrant].map((task) => (
                      <TaskCard key={task.id} task={task} onEdit={setEditingTask} />
                    ))}
                  </div>
                )}
              </Quadrant>
            ))}
          </div>
        </>
      )}

      {isCreating && <TaskForm onClose={() => setIsCreating(false)} />}
      {editingTask && <TaskForm task={editingTask} onClose={() => setEditingTask(null)} />}
    </main>
  )
}
