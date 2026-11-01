import type { Stats } from '../../api/types'
import { formatShortDay } from './calendar'
import { formatScore } from './arcadeCatalog'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function Card({
  title,
  value,
  note,
}: {
  title: string
  value: string
  note?: string
}): JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-surface-alt p-3">
      <dt className="text-caption text-text-muted">{title}</dt>
      <dd className="mt-1 text-heading font-heading text-text">{value}</dd>
      {note !== undefined && <dd className="text-caption text-text-muted">{note}</dd>}
    </div>
  )
}

// «Racha actual · Mejor día · Mejor racha · Completadas» and, with the arcade mode on, the level
// and the score. The streak and the best day are settled when a day closes.
export function StatsPanel({ stats }: { stats: Stats }): JSX.Element {
  return (
    <section
      aria-labelledby="stats-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 id="stats-heading" className="text-heading font-heading text-text">
        Estadísticas
      </h2>
      {stats.arcade !== null && (
        <p className="mt-3 rounded-xl border border-border bg-surface-alt p-3 text-body text-text">
          <span className="font-semibold">
            Nivel {stats.arcade.level} · {stats.arcade.level_name}
          </span>
          {' — '}
          {formatScore(stats.arcade.score)} puntos
        </p>
      )}
      <dl className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <Card
          title="Racha actual"
          value={plural(stats.current_streak, 'día', 'días')}
          note="Actividad consecutiva"
        />
        <Card
          title="Mejor día"
          value={plural(stats.best_day_count, 'tarea', 'tareas')}
          note={stats.best_day_date !== null ? formatShortDay(stats.best_day_date) : 'Aún sin días'}
        />
        <Card
          title="Mejor racha"
          value={plural(stats.best_streak, 'día', 'días')}
          note="Récord de constancia"
        />
        <Card
          title="Completadas"
          value={plural(stats.tasks_scored, 'tarea', 'tareas')}
          note="Total acumulado"
        />
      </dl>
    </section>
  )
}
