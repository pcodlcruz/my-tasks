interface EnergyBarProps {
  completed: number
  goal: number
}

// Past the goal only this many extra segments are drawn; the rest is shown as "+N".
const MAX_EXTRA_SEGMENTS = 10

const SEGMENT = 'h-4 w-5 rounded-sm sm:w-7'

// The arcade energy bar: one segment per task of the goal, and the ones above it in another tone
// (docs/design/DESIGN.md § Barra de energía). Full and empty differ by their fill, not only by
// color. Decorative: the scoreboard next to it says the same in words.
export function EnergyBar({ completed, goal }: EnergyBarProps): JSX.Element {
  const filled = Math.min(completed, goal)
  const extra = Math.max(completed - goal, 0)
  const shownExtra = Math.min(extra, MAX_EXTRA_SEGMENTS)
  const hiddenExtra = extra - shownExtra

  return (
    <div aria-hidden="true" className="flex flex-wrap items-center gap-1">
      {Array.from({ length: goal }, (_, index) =>
        index < filled ? (
          <span
            key={index}
            data-segment="filled"
            className={`${SEGMENT} border border-energy-fill bg-energy-fill`}
          />
        ) : (
          <span
            key={index}
            data-segment="empty"
            className={`${SEGMENT} border-2 border-energy-empty-border bg-surface`}
          />
        ),
      )}
      {Array.from({ length: shownExtra }, (_, index) => (
        <span
          key={`extra-${index}`}
          data-segment="extra"
          className={`${SEGMENT} border border-energy-extra bg-energy-extra`}
        />
      ))}
      {hiddenExtra > 0 && (
        <span className="text-caption font-semibold text-energy-extra">+{hiddenExtra}</span>
      )}
    </div>
  )
}
