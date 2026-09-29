import type { Quadrant, Scope } from '../../api/types'
import { QUADRANT_LABELS, SCOPE_LABELS } from '../../api/types'

// Nombres de clase completos y literales a propósito (ver Quadrant.tsx): el
// escáner de Tailwind no genera utilidades construidas con plantillas.
const SCOPE_BADGE_STYLE: Record<Scope, string> = {
  work: 'bg-purple-50 text-scope-work border-purple-200',
  personal: 'bg-teal-50 text-scope-personal border-teal-200',
}

const QUADRANT_BADGE_STYLE: Record<Quadrant, string> = {
  do_now: 'bg-quadrant-do-now-surface text-quadrant-do-now-accent border-red-200',
  schedule: 'bg-quadrant-schedule-surface text-quadrant-schedule-accent border-blue-200',
  delegate: 'bg-quadrant-delegate-surface text-quadrant-delegate-accent border-amber-200',
  eliminate: 'bg-quadrant-eliminate-surface text-quadrant-eliminate-accent border-slate-200',
}

const BADGE_BASE =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-semibold'

export function ScopeBadge({ scope }: { scope: Scope }): JSX.Element {
  return <span className={`${BADGE_BASE} ${SCOPE_BADGE_STYLE[scope]}`}>{SCOPE_LABELS[scope]}</span>
}

// El cuadrante siempre lleva etiqueta de texto: el color solo refuerza (WCAG 1.4.1).
export function QuadrantBadge({ quadrant }: { quadrant: Quadrant }): JSX.Element {
  return (
    <span className={`${BADGE_BASE} ${QUADRANT_BADGE_STYLE[quadrant]}`}>
      {QUADRANT_LABELS[quadrant]}
    </span>
  )
}
