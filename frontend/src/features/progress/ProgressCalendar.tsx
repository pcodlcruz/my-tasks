import { useRef, useState, type KeyboardEvent } from 'react'
import type { ProgressDay } from '../../api/types'
import {
  CALENDAR_DAYS,
  addDays,
  calendarRange,
  cellLabel,
  cellState,
  formatShortDay,
  type CellState,
} from './calendar'

interface ProgressCalendarProps {
  today: string
  days: readonly ProgressDay[]
  selected: string | null
  onSelect: (day: string) => void
}

const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// Every state has its own glyph and border on top of the color (WCAG 1.4.1). Full literal class
// names on purpose (see Quadrant.tsx).
const CELL_STYLE: Record<CellState, string> = {
  goal: 'border-success bg-success text-on-accent',
  partial: 'border-energy-fill bg-surface text-text',
  empty: 'border-border bg-surface-alt text-text-muted',
  rest: 'border-dashed border-border bg-surface-alt text-text-muted',
  future: 'border-dotted border-border bg-transparent text-text-muted',
}

const CELL_GLYPH: Record<CellState, string> = {
  goal: '✓',
  partial: '•',
  empty: '',
  rest: '–',
  future: '',
}

const CELL_BASE =
  'flex aspect-square w-full items-center justify-center rounded border text-caption font-semibold'

const LEGEND: ReadonlyArray<{ state: CellState; text: string }> = [
  { state: 'empty', text: 'Sin actividad' },
  { state: 'partial', text: 'Tareas, meta sin cumplir' },
  { state: 'goal', text: 'Meta cumplida' },
  { state: 'rest', text: 'Día de descanso' },
  { state: 'future', text: 'Futuro' },
]

// «Actividad de las últimas 12 semanas» (S9): one cell per day, a column per week. The days with
// a stored document are painted by what they hold; the rest are empty. Arrow keys move between
// days (←/→ a week, ↑/↓ a day) with a single tab stop, and only days up to today can be chosen.
export function ProgressCalendar({
  today,
  days,
  selected,
  onSelect,
}: ProgressCalendarProps): JSX.Element {
  const { start } = calendarRange(today)
  const byDate = new Map(days.map((day) => [day.date, day]))
  const [focused, setFocused] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const stop = focused ?? selected ?? today

  const move = (event: KeyboardEvent<HTMLElement>, from: string): void => {
    const step: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }
    const delta = step[event.key]
    if (delta === undefined) return
    event.preventDefault()
    const target = addDays(from, delta)
    if (target < start || target > today) return
    setFocused(target)
    // The target is already in the grid (only its tab stop changes), so it can be focused now.
    grid.current?.querySelector<HTMLElement>(`[data-day="${target}"]`)?.focus()
  }

  const keys = Array.from({ length: CALENDAR_DAYS }, (_, index) => addDays(start, index))

  return (
    <div>
      <div className="flex gap-2">
        <div aria-hidden="true" className="grid grid-rows-7 gap-0.5 text-caption text-text-muted">
          {WEEKDAY_LETTERS.map((letter) => (
            <span key={letter} className="flex items-center">
              {letter}
            </span>
          ))}
        </div>
        <div
          ref={grid}
          role="group"
          aria-label="Actividad de las últimas 12 semanas"
          className="grid flex-1 auto-cols-fr grid-flow-col grid-rows-7 gap-0.5"
        >
          {keys.map((key) => {
            const day = byDate.get(key)
            const state = cellState(day, key, today)
            const label = cellLabel(key, day, state)
            const style = `${CELL_BASE} ${CELL_STYLE[state]}`
            if (state === 'future') {
              // Nothing to say or do yet: left out of the accessibility tree.
              return (
                <span key={key} data-cell data-state={state} aria-hidden="true" className={style} />
              )
            }
            const isSelected = key === selected
            return (
              <button
                key={key}
                type="button"
                data-cell
                data-day={key}
                data-state={state}
                aria-label={label}
                aria-pressed={isSelected}
                tabIndex={key === stop ? 0 : -1}
                onClick={() => {
                  setFocused(key)
                  onSelect(key)
                }}
                onFocus={() => setFocused(key)}
                onKeyDown={(event) => move(event, key)}
                className={`${style} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                  isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
                }`}
              >
                <span aria-hidden="true">{CELL_GLYPH[state]}</span>
              </button>
            )
          })}
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-caption text-text">
        {LEGEND.map((item) => (
          <li key={item.state} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded border text-caption font-semibold ${CELL_STYLE[item.state]}`}
            >
              {CELL_GLYPH[item.state]}
            </span>
            {item.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-text-muted">
        {formatShortDay(start)} – {formatShortDay(today)}
      </p>
    </div>
  )
}
