import type { ReactNode } from 'react'
import type { Quadrant as QuadrantKey } from '../../api/types'
import { QUADRANT_LABELS } from '../../api/types'

interface QuadrantProps {
  quadrant: QuadrantKey
  count: number
  children?: ReactNode
}

const QUADRANT_STYLES: Record<QuadrantKey, { token: string; border: string }> = {
  do_now: { token: 'do-now', border: 'border-red-200' },
  schedule: { token: 'schedule', border: 'border-blue-200' },
  delegate: { token: 'delegate', border: 'border-amber-200' },
  eliminate: { token: 'eliminate', border: 'border-slate-200' },
}

const QUADRANT_DESCRIPTIONS: Record<QuadrantKey, string> = {
  do_now: 'Urgente e importante · Resolver de inmediato',
  schedule: 'No urgente, pero importante · Asignar tiempo en agenda',
  delegate: 'Urgente, pero no importante · Asignar a otra persona',
  eliminate: 'Ni urgente ni importante · Descartar distracciones',
}

export function Quadrant({ quadrant, count, children }: QuadrantProps): JSX.Element {
  const style = QUADRANT_STYLES[quadrant]
  const headingId = `quadrant-heading-${quadrant}`

  return (
    <section
      aria-labelledby={headingId}
      className={`flex flex-col overflow-hidden rounded-xl border shadow-sm bg-quadrant-${style.token}-surface ${style.border}`}
    >
      <div className="flex items-center justify-between border-b border-black/5 bg-surface/70 p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-1 h-3 w-3 shrink-0 rounded-full bg-quadrant-${style.token}-accent`} />
          <div>
            <div className="flex items-center gap-2">
              <h2 id={headingId} className="text-heading font-heading text-text">
                {QUADRANT_LABELS[quadrant]}
              </h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-caption font-semibold text-quadrant-${style.token}-accent ${style.border}`}
              >
                {count} {count === 1 ? 'tarea' : 'tareas'}
              </span>
            </div>
            <p className="mt-0.5 text-caption text-text-muted">{QUADRANT_DESCRIPTIONS[quadrant]}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 p-4">
        {count === 0 && !children ? (
          <p className="py-6 text-center text-caption text-text-muted">
            No hay tareas en este cuadrante.
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
