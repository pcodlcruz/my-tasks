import type { Quadrant, Scope } from '../../api/types'
import { QUADRANT_LABELS, SCOPE_LABELS } from '../../api/types'

// Full literal class names on purpose (see Quadrant.tsx): Tailwind's scanner
// does not generate utilities built from templates.
const SCOPE_BADGE_STYLE: Record<Scope, string> = {
  work: 'bg-scope-work-surface text-scope-work border-scope-work-border',
  personal: 'bg-scope-personal-surface text-scope-personal border-scope-personal-border',
}

const QUADRANT_BADGE_STYLE: Record<Quadrant, string> = {
  do_now: 'bg-quadrant-do-now-surface text-quadrant-do-now-accent border-quadrant-do-now-border',
  schedule:
    'bg-quadrant-schedule-surface text-quadrant-schedule-accent border-quadrant-schedule-border',
  delegate:
    'bg-quadrant-delegate-surface text-quadrant-delegate-accent border-quadrant-delegate-border',
  eliminate:
    'bg-quadrant-eliminate-surface text-quadrant-eliminate-accent border-quadrant-eliminate-border',
}

const BADGE_BASE =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-semibold'

export function ScopeBadge({ scope }: { scope: Scope }): JSX.Element {
  return <span className={`${BADGE_BASE} ${SCOPE_BADGE_STYLE[scope]}`}>{SCOPE_LABELS[scope]}</span>
}

// The quadrant always carries a text label: color only reinforces it (WCAG 1.4.1).
export function QuadrantBadge({ quadrant }: { quadrant: Quadrant }): JSX.Element {
  return (
    <span className={`${BADGE_BASE} ${QUADRANT_BADGE_STYLE[quadrant]}`}>
      {QUADRANT_LABELS[quadrant]}
    </span>
  )
}
