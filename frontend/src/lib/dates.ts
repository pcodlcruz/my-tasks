const DAY_MS = 24 * 60 * 60 * 1000

const DAY_AND_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' })
const WEEKDAY = new Intl.DateTimeFormat('es-ES', { weekday: 'long' })
const HOUR_AND_MINUTE = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Días naturales entre `date` y `now` (0 = hoy, 1 = ayer, ...).
function calendarDaysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
}

export function dayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function formatDayHeading(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const dayAndMonth = DAY_AND_MONTH.format(date)
  const daysAgo = calendarDaysAgo(date, now)
  if (daysAgo === 0) return `Hoy, ${dayAndMonth}`
  if (daysAgo === 1) return `Ayer, ${dayAndMonth}`
  return `${capitalize(WEEKDAY.format(date))}, ${dayAndMonth}`
}

export function formatCompletedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const time = HOUR_AND_MINUTE.format(date)
  const daysAgo = calendarDaysAgo(date, now)
  if (daysAgo === 0) return `Completada hoy, ${time}`
  if (daysAgo === 1) return `Completada ayer, ${time}`
  return `Completada el ${DAY_AND_MONTH.format(date)}, ${time}`
}

export function formatPurgeNotice(iso: string, now: Date = new Date()): string {
  const days = Math.max(1, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS))
  return `Se eliminará en ${days} ${days === 1 ? 'día' : 'días'}`
}
