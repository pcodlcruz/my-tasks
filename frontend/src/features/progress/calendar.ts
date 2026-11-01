import type { ProgressDay } from '../../api/types'

// The calendar of «Progreso» (S9): 12 whole weeks, Monday first, the last one being the current
// week. Days are progress-day keys (`YYYY-MM-DD`); the arithmetic is done in UTC so the browser's
// time zone and its daylight-saving changes cannot shift a day.
export const CALENDAR_WEEKS = 12
export const CALENDAR_DAYS = CALENDAR_WEEKS * 7

function toUtc(key: string): number {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function addDays(key: string, days: number): string {
  return new Date(toUtc(key) + days * 86_400_000).toISOString().slice(0, 10)
}

// 0 = Monday ... 6 = Sunday.
export function weekdayIndex(key: string): number {
  return (new Date(toUtc(key)).getUTCDay() + 6) % 7
}

export function calendarRange(today: string): { start: string; end: string } {
  const start = addDays(today, -weekdayIndex(today) - (CALENDAR_WEEKS - 1) * 7)
  return { start, end: addDays(start, CALENDAR_DAYS - 1) }
}

export type CellState = 'future' | 'empty' | 'rest' | 'partial' | 'goal'

// What a cell is, from the stored day (none when there was no activity and it was never closed).
export function cellState(day: ProgressDay | undefined, key: string, today: string): CellState {
  if (key > today) return 'future'
  if (day === undefined) return 'empty'
  if (!day.active) return 'rest'
  if (day.goal_met) return 'goal'
  return day.completed_count > 0 ? 'partial' : 'empty'
}

const LONG_DATE = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
const SHORT_DATE = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatLongDay(key: string): string {
  return capitalize(LONG_DATE.format(toUtc(key)))
}

export function formatShortDay(key: string): string {
  return SHORT_DATE.format(toUtc(key))
}

const STATE_TEXT: Record<CellState, string> = {
  future: 'día futuro',
  empty: 'sin actividad',
  rest: 'día de descanso',
  partial: 'meta sin cumplir',
  goal: 'meta cumplida',
}

export function cellLabel(key: string, day: ProgressDay | undefined, state: CellState): string {
  const count = day?.completed_count ?? 0
  const tasks = count > 0 ? `, ${count} ${count === 1 ? 'tarea' : 'tareas'}` : ''
  return `${formatLongDay(key)}: ${STATE_TEXT[state]}${state === 'future' ? '' : tasks}`
}
