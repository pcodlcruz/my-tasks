import { useState } from 'react'
import { useProgress } from '../../api/progress'
import {
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule,
  useSchedules,
} from '../../api/schedules'
import { MAX_SCHEDULES, type Schedule, type ScheduleStatus } from '../../api/types'
import { ConfirmDialog } from '../../app/ConfirmDialog'
import { localDateKey } from '../../lib/dates'
import { QuadrantBadge, ScopeBadge } from '../shared/TaskBadges'
import { ScheduleForm } from './ScheduleForm'
import { describeDay, recurrenceLabel } from './recurrenceLabel'

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
  finished: 'Terminada',
}

// The state is always a word; the color only reinforces it (WCAG 1.4.1). Full literal class
// names on purpose (see Quadrant.tsx).
const STATUS_STYLE: Record<ScheduleStatus, string> = {
  active: 'border-success/40 text-success',
  paused: 'border-border text-text-muted',
  finished: 'border-border text-text-muted',
}

const ROW_BUTTON =
  'rounded-lg border border-border bg-surface px-3 py-1.5 text-caption font-semibold text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60'

type Editing = { kind: 'new' } | { kind: 'edit'; schedule: Schedule } | null

// «Tareas programadas» (S10): every schedule with how it repeats, its state and when it next
// appears, and the actions on it. Deleting one keeps the tasks it already generated.
export function SchedulesPage(): JSX.Element {
  const { data: schedules, isPending, isError, refetch } = useSchedules()
  const { data: progress } = useProgress()
  const pause = usePauseSchedule()
  const resume = useResumeSchedule()
  const remove = useDeleteSchedule()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Schedule | null>(null)
  // The progress day (it starts at 04:00); the browser's date only until it is known.
  const today = progress?.today ?? localDateKey()
  const items = schedules ?? []
  const atLimit = items.length >= MAX_SCHEDULES

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-display text-text">Tareas programadas</h1>
        <button
          type="button"
          onClick={() => setEditing({ kind: 'new' })}
          disabled={atLimit}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          + Nueva programación
        </button>
      </div>

      {atLimit && (
        <p className="mb-4 rounded-xl border border-border bg-surface-alt p-4 text-caption text-text">
          Has llegado al límite de {MAX_SCHEDULES} programaciones. Elimina alguna para poder crear
          otra.
        </p>
      )}

      {isPending && (
        <div role="status" aria-label="Cargando programaciones" className="flex flex-col gap-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl bg-surface-alt" />
          ))}
        </div>
      )}

      {isError && schedules === undefined && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/10 p-4 text-error"
        >
          <span>No se pudieron cargar las programaciones.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-semibold underline hover:text-error/80"
          >
            Reintentar
          </button>
        </div>
      )}

      {schedules !== undefined && items.length === 0 && (
        <div className="rounded-xl border border-border bg-surface-alt p-8 text-center">
          <p className="text-body-strong text-text">Aún no tienes tareas programadas</p>
          <p className="mt-1 text-caption text-text-muted">
            Programa una tarea y aparecerá sola en el tablero los días que elijas.
          </p>
          <button
            type="button"
            onClick={() => setEditing({ kind: 'new' })}
            className="mt-4 rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Crear la primera programación
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((schedule) => (
            <li
              key={schedule.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-body font-semibold text-text">
                  {schedule.title}
                </h2>
                <span
                  className={`rounded-full border px-2 py-0.5 text-caption font-semibold ${STATUS_STYLE[schedule.status]}`}
                >
                  {STATUS_LABELS[schedule.status]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <QuadrantBadge quadrant={schedule.quadrant} />
                <ScopeBadge scope={schedule.scope} />
                <span className="text-caption text-text">
                  {recurrenceLabel(schedule.recurrence)}
                </span>
              </div>
              <p className="text-caption text-text-muted">
                {schedule.next_occurrence !== null
                  ? `Próxima aparición: ${describeDay(schedule.next_occurrence, today)}`
                  : 'Sin próxima aparición'}
              </p>
              <div className="flex flex-wrap gap-2">
                {schedule.status !== 'finished' && (
                  <button
                    type="button"
                    onClick={() => setEditing({ kind: 'edit', schedule })}
                    className={ROW_BUTTON}
                  >
                    Editar
                  </button>
                )}
                {schedule.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => pause.mutate(schedule.id)}
                    disabled={pause.isPending}
                    className={ROW_BUTTON}
                  >
                    Pausar
                  </button>
                )}
                {schedule.status === 'paused' && (
                  <button
                    type="button"
                    onClick={() => resume.mutate(schedule.id)}
                    disabled={resume.isPending}
                    className={ROW_BUTTON}
                  >
                    Reanudar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleting(schedule)}
                  className="rounded-lg border border-error/40 px-3 py-1.5 text-caption font-semibold text-error hover:bg-error/10"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <ScheduleForm
          today={today}
          schedule={editing.kind === 'edit' ? editing.schedule : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting !== null && (
        <ConfirmDialog
          title="¿Eliminar la programación?"
          message={`Dejará de crear tareas. Las tareas que ya ha generado se quedan en el tablero. Programación: «${deleting.title}».`}
          confirmLabel="Eliminar"
          onConfirm={() => {
            remove.mutate(deleting.id)
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  )
}
