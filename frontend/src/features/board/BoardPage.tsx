import { useEffect, useState } from 'react'
import { useProgress } from '../../api/progress'
import { useBoardTasks } from '../../api/tasks'
import type { Quadrant as QuadrantKey, Task } from '../../api/types'
import { APP_NAME } from '../../lib/brand'
import { useUiStore } from '../../stores/uiStore'
import { DayScoreboard } from '../progress/DayScoreboard'
import { StartOfDayDialog } from '../progress/StartOfDayDialog'
import { useSettledProfile } from '../profile/useSettledProfile'
import { TaskForm } from '../task-form/TaskForm'
import { Quadrant } from './Quadrant'
import { ScopeFilter } from './ScopeFilter'
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
  const scopeFilter = useUiStore((state) => state.scopeFilter)
  const scopeInitialized = useUiStore((state) => state.scopeInitialized)
  const initializeScope = useUiStore((state) => state.initializeScope)
  const { profile, settled } = useSettledProfile()
  // Asked for before the board: answering it closes the days left behind and generates today's
  // scheduled tasks, so the board waits for it to arrive, or to fail (FR-034: then it loads anyway).
  const progress = useProgress()

  // The profile's default scope sets the filter once; a manual change never writes back to it.
  useEffect(() => {
    if (settled) initializeScope(profile?.default_scope ?? 'all')
  }, [settled, profile?.default_scope, initializeScope])

  // Wait for the profile (and the filter it sets) before asking for tasks, so the board never
  // shows the wrong scope nor makes a request that is thrown away.
  const ready = settled && scopeInitialized && !progress.isPending
  // The start-of-day review opens by itself when the server says so (first opening of an active
  // day with it enabled), and by hand from the scoreboard. Once closed here it does not come back
  // by itself, even before the server's "seen" arrives.
  const [reviewDismissed, setReviewDismissed] = useState(false)
  const [reviewReopened, setReviewReopened] = useState(false)
  const isReviewOpen =
    ready &&
    progress.data !== undefined &&
    (reviewReopened || (progress.data.show_review && !reviewDismissed))
  // Every active task, whatever the board's filter, for the mission picker.
  const reviewTasks = useBoardTasks(undefined, profile?.board_order ?? 'oldest', isReviewOpen)

  const { data, isLoading, isError, refetch } = useBoardTasks(
    scopeFilter === 'all' ? undefined : scopeFilter,
    profile?.board_order ?? 'oldest',
    ready,
  )
  const [isCreating, setIsCreating] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  function closeReview(): void {
    setReviewDismissed(true)
    setReviewReopened(false)
  }

  const tasks = data?.items ?? []
  const groups = groupByQuadrant(tasks)
  const hasNoTasks = tasks.length === 0

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <DayScoreboard
        progress={progress.data}
        isLoading={progress.isPending}
        isError={progress.isError}
        onRetry={() => void progress.refetch()}
        onOpenReview={() => setReviewReopened(true)}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-display text-text">Matriz de prioridades</h1>
        <ScopeFilter />
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
        >
          + Nueva tarea
        </button>
      </div>

      {(!ready || isLoading) && (
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

      {ready && isError && !isLoading && (
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

      {ready && !isLoading && !isError && (
        <>
          {hasNoTasks && scopeFilter === 'all' && (
            <div className="mb-6 rounded-xl border border-border bg-surface-alt p-6 text-center">
              <p className="text-body font-semibold text-text">¡Bienvenido a {APP_NAME}!</p>
              <p className="mt-1 text-caption text-text-muted">
                Crea tu primera tarea para empezar a organizarte.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {CANONICAL_QUADRANTS.map((quadrant) => (
              <Quadrant key={quadrant} quadrant={quadrant} count={groups[quadrant].length}>
                {groups[quadrant].length > 0 && (
                  <div className="flex flex-1 flex-col gap-[var(--card-gap)]">
                    {groups[quadrant].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onEdit={setEditingTask}
                        missionTaskIds={progress.data?.mission.task_ids}
                      />
                    ))}
                  </div>
                )}
              </Quadrant>
            ))}
          </div>
        </>
      )}

      {isReviewOpen && progress.data !== undefined && (
        <StartOfDayDialog
          progress={progress.data}
          tasks={reviewTasks.data?.items}
          onClose={closeReview}
          onCreateTask={() => {
            closeReview()
            setIsCreating(true)
          }}
        />
      )}
      {isCreating && <TaskForm onClose={() => setIsCreating(false)} />}
      {editingTask && <TaskForm task={editingTask} onClose={() => setEditingTask(null)} />}
    </main>
  )
}
