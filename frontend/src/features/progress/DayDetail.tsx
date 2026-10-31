import type { ProgressDayDetail } from '../../api/types'
import { QuadrantBadge, ScopeBadge } from '../shared/TaskBadges'
import { formatLongDay } from './calendar'
import { formatScore } from './arcadeCatalog'

const TIME = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const PILL = 'rounded-full border px-3 py-1 text-caption font-semibold'

interface DayDetailProps {
  day: string
  // `undefined` for a day without a document: nothing was done and nothing is asked for.
  detail: ProgressDayDetail | undefined
  loading?: boolean
  failed?: boolean
}

// The day chosen in the calendar: how it went and the tasks completed that day that still exist.
// The count is the day's own, so it can be higher than the list (a trashed task is not listed).
export function DayDetail({ day, detail, loading, failed }: DayDetailProps): JSX.Element {
  return (
    <section
      aria-labelledby="day-detail-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 id="day-detail-heading" className="text-heading font-heading text-text">
        {formatLongDay(day)}
      </h2>

      {loading && (
        <p role="status" className="mt-3 text-caption text-text-muted">
          Cargando el día…
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-caption text-error">
          No se pudo cargar este día. Inténtalo de nuevo.
        </p>
      )}
      {!loading && !failed && detail === undefined && (
        <p className="mt-3 text-body text-text-muted">Sin actividad este día.</p>
      )}

      {detail !== undefined && (
        <>
          <p className="mt-1 text-body text-text">
            <strong>
              {detail.completed_count} de {detail.goal}
            </strong>{' '}
            {detail.goal === 1 ? 'tarea' : 'tareas'} de la meta
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!detail.active && (
              <span className={`${PILL} border-border text-text-muted`}>Día de descanso</span>
            )}
            {detail.active && detail.goal_met && (
              <span className={`${PILL} border-success text-success`}>Meta cumplida</span>
            )}
            {detail.mission_cleared && (
              <span className={`${PILL} border-gold text-gold`}>Misión cumplida</span>
            )}
            {detail.points !== null && (
              <span className={`${PILL} border-border text-text`}>
                +{formatScore(detail.points)} PTS
              </span>
            )}
          </div>

          {detail.tasks.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2" aria-label="Tareas completadas ese día">
              {detail.tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-border bg-surface-alt p-3">
                  <p className="text-body text-text">{task.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <QuadrantBadge quadrant={task.quadrant} />
                    <ScopeBadge scope={task.scope} />
                    {task.completed_at !== null && (
                      <span className="text-caption text-text-muted">
                        {TIME.format(new Date(task.completed_at))}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            detail.completed_count > 0 && (
              <p className="mt-4 text-caption text-text-muted">
                Las tareas de este día ya no están disponibles.
              </p>
            )
          )}
        </>
      )}
    </section>
  )
}
