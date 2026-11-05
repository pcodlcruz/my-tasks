import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

interface CardIndicatorProps {
  // What the icon means; read by screen readers and shown in the tooltip.
  label: string
  // The icon; decorative, the label carries the meaning.
  children: ReactNode
  // Color of the icon (e.g. `text-text-muted`).
  className?: string
}

// An icon next to a task title with its meaning (contracts/task-card-ui.md, research R3). The
// text is in `sr-only`, so the tooltip is a convenience for pointer and touch users only: it is
// `aria-hidden`, not a tab stop and not a control. It opens on mouse hover and on tap, stays open
// while the pointer is over the icon or the tooltip (WCAG 1.4.13), and closes on `Escape` or on a
// tap anywhere else.
export function CardIndicator({ label, children, className }: CardIndicatorProps): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [tapped, setTapped] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const open = hovered || tapped

  useEffect(() => {
    if (!open) return
    function close(): void {
      setHovered(false)
      setTapped(false)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') close()
    }
    function onPointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && root.current?.contains(event.target)) return
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // Only a real mouse hovers: a tap also fires pointer enter, and must toggle instead.
  function onHover(event: ReactPointerEvent, value: boolean): void {
    if (event.pointerType === 'mouse') setHovered(value)
  }

  return (
    // The meaning is already in the sr-only text; clicking only shows it for touch users, so
    // there is no keyboard equivalent to provide (research R3).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <span
      ref={root}
      onPointerEnter={(event) => onHover(event, true)}
      onPointerLeave={(event) => onHover(event, false)}
      onClick={() => setTapped((value) => !value)}
      className={`relative inline-flex shrink-0 cursor-default items-center align-middle ${className ?? ''}`}
    >
      <span aria-hidden="true" className="inline-flex items-center">
        {children}
      </span>
      <span className="sr-only">{label}</span>
      {open && (
        // Anchored to the icon's left edge so it never spills out of the card on the left, and
        // never wider than the card (no horizontal scroll at 320 px).
        <span
          role="tooltip"
          aria-hidden="true"
          className="absolute bottom-full left-0 z-20 mb-1 max-w-[calc(100vw-2rem)] whitespace-nowrap rounded bg-text px-2 py-0.5 text-caption font-normal text-surface shadow-md"
        >
          {label}
        </span>
      )}
    </span>
  )
}
