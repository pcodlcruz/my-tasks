import { type ReactNode, useEffect, useRef, useState } from 'react'
import { missionErrorMessage, useMarkReviewSeen, useSetMission } from '../../api/progress'
import type { Progress, ProgressDay, Task } from '../../api/types'
import { useRestoreFocus } from '../../app/useRestoreFocus'
import { MAX_MISSION_TASKS, MissionPicker, type MissionSection } from './MissionPicker'

interface StartOfDayDialogProps {
  progress: Progress
  // Today's active tasks; `undefined` while they load.
  tasks: Task[] | undefined
  onClose: () => void
  onCreateTask: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea'

// The progress day before `day` ("2026-11-03" → "2026-11-02"), to tell "yesterday" apart from an
// older last active day.
function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

// The start-of-day review, «PULSA START» (S8): how the last active day went, the streak, today's
// goal and the mission picker over «Hacer ahora» and today's scheduled tasks. Modal: focus stays
// inside and goes back to whoever opened it. Closing it in any way marks today's review as seen,
// on every device; «Empezar» first saves the mission if it changed, and stays open if the server
// refuses it, keeping the choice.
export function StartOfDayDialog({
  progress,
  tasks,
  onClose,
  onCreateTask,
}: StartOfDayDialogProps): JSX.Element {
  useRestoreFocus()
  const dialogRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const markReviewSeen = useMarkReviewSeen()
  const setMission = useSetMission()
  const [selected, setSelected] = useState<string[]>(progress.mission.task_ids)
  const [error, setError] = useState<string | null>(null)

  function finish(): void {
    markReviewSeen.mutate()
    onClose()
  }

  function start(): void {
    if (sameIds(selected, progress.mission.task_ids)) {
      finish()
      return
    }
    setError(null)
    setMission.mutate(selected, {
      onSuccess: finish,
      onError: (failure) => setError(missionErrorMessage(failure)),
    })
  }

  function createTask(): void {
    markReviewSeen.mutate()
    onCreateTask()
  }

  function toggle(taskId: string): void {
    setSelected((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : current.length < MAX_MISSION_TASKS
          ? [...current, taskId]
          : current,
    )
  }

  // Initial focus on the main action, once.
  useEffect(() => {
    startRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        finish()
        return
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  const scheduledToday = (tasks ?? []).filter((task) => task.scheduled_for === progress.today)
  const sections: MissionSection[] = [
    {
      id: 'do-now',
      title: 'Hacer ahora',
      tasks: (tasks ?? []).filter(
        (task) => task.quadrant === 'do_now' && task.scheduled_for !== progress.today,
      ),
      emptyText: 'No tienes tareas en «Hacer ahora».',
    },
    {
      id: 'scheduled',
      title: 'Programadas de hoy',
      tasks: scheduledToday,
      emptyText: 'Hoy no hay tareas programadas.',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-of-day-title"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <h2 id="start-of-day-title" className="font-pixel text-base leading-7 text-text">
              PULSA START
            </h2>
            <p className="mt-1 text-caption text-text-muted">Así va tu partida.</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={finish}
            className="rounded-lg px-2 py-1 text-text-muted hover:bg-surface-alt hover:text-text"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <LastDayCard lastDay={progress.last_day} today={progress.today} />
            <SummaryCard id="streak" label="Racha">
              <p className="font-pixel text-sm leading-6 text-streak">
                {progress.streak > 0
                  ? `${progress.streak} ${progress.streak === 1 ? 'día' : 'días'}`
                  : 'Sin racha'}
              </p>
            </SummaryCard>
            <SummaryCard id="goal" label="Meta de hoy">
              <p className="font-pixel text-sm leading-6 text-energy-fill">
                {progress.goal} {progress.goal === 1 ? 'tarea' : 'tareas'}
              </p>
            </SummaryCard>
          </div>

          {tasks === undefined && (
            <div
              role="status"
              aria-label="Cargando tareas"
              className="h-32 animate-pulse rounded-lg bg-surface-alt"
            />
          )}

          {tasks !== undefined && tasks.length === 0 && (
            <div className="rounded-lg border border-border bg-surface-alt p-6 text-center">
              <p className="text-body-strong text-text">Aún no tienes tareas activas.</p>
              <p className="mt-1 text-caption text-text-muted">
                Crea la primera tarea del día para empezar la partida.
              </p>
              <button
                type="button"
                onClick={createTask}
                className="mt-4 rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                Crear la primera tarea
              </button>
            </div>
          )}

          {tasks !== undefined && tasks.length > 0 && (
            <MissionPicker sections={sections} selected={selected} onToggle={toggle} />
          )}

          {error !== null && (
            <p
              role="alert"
              className="rounded-xl border border-error/30 bg-error/10 p-4 text-error"
            >
              {error}
            </p>
          )}
        </div>

        <div className="mt-auto flex justify-end border-t border-border p-6">
          <button
            ref={startRef}
            type="button"
            onClick={start}
            disabled={setMission.isPending}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Empezar
          </button>
        </div>
      </div>
    </div>
  )
}

interface SummaryCardProps {
  id: string
  label: string
  children: ReactNode
}

function SummaryCard({ id, label, children }: SummaryCardProps): JSX.Element {
  const labelId = `start-of-day-${id}`
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="rounded-xl border border-border bg-surface-alt p-4"
    >
      <p id={labelId} className="text-caption font-semibold text-text-muted">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function LastDayCard({
  lastDay,
  today,
}: {
  lastDay: ProgressDay | null
  today: string
}): JSX.Element {
  if (lastDay === null) {
    return (
      <SummaryCard id="last-day" label="Primer día">
        <p className="font-pixel text-sm leading-6 text-gold">PARTIDA NUEVA</p>
        <p className="mt-1 text-caption text-text-muted">Tu primera partida empieza hoy.</p>
      </SummaryCard>
    )
  }
  return (
    <SummaryCard
      id="last-day"
      label={lastDay.date === previousDay(today) ? 'Ayer' : 'Último día activo'}
    >
      <p className="font-pixel text-sm leading-6 text-text">
        {lastDay.completed_count}/{lastDay.goal}
      </p>
      <p className="mt-1 text-caption text-text-muted">
        {lastDay.goal_met ? (
          <>
            <span aria-hidden="true" className="text-success">
              ✓{' '}
            </span>
            Fase superada
          </>
        ) : (
          'Meta no cumplida'
        )}
      </p>
    </SummaryCard>
  )
}
