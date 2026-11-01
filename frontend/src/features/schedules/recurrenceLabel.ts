import type { Recurrence } from '../../api/types'

// Progress days travel as "YYYY-MM-DD". They are handled here as calendar dates in UTC, so a
// change of daylight saving time or of the browser's zone never moves a day; the names are
// written out instead of coming from `Intl`, so they read the same everywhere.
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAY_NAMES = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
] as const
const WEEKDAY_ABBREVIATIONS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const

// How far to look for the next occurrence: a month and the shorter one after it.
const SEARCH_DAYS = 62

function parseDay(day: string): Date {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(day: string, amount: number): string {
  const date = parseDay(day)
  date.setUTCDate(date.getUTCDate() + amount)
  return formatDay(date)
}

// ISO weekday: 1 = Monday … 7 = Sunday.
function isoWeekday(date: Date): number {
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay()
}

function lastDayOfMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// "5 nov"
export function shortDate(day: string): string {
  const date = parseDay(day)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

// "hoy", "mañana" or "lunes 9 nov".
export function describeDay(day: string, today: string): string {
  if (day === today) return 'hoy'
  if (day === addDays(today, 1)) return 'mañana'
  return `${WEEKDAY_NAMES[isoWeekday(parseDay(day)) - 1]} ${shortDate(day)}`
}

// "lun 2", for "Pendiente desde el lun 2".
export function pendingSince(day: string): string {
  const date = parseDay(day)
  return `${WEEKDAY_ABBREVIATIONS[isoWeekday(date) - 1]} ${date.getUTCDate()}`
}

// The repetition in plain words, as listed in «Tareas programadas».
export function recurrenceLabel(rule: Recurrence): string {
  switch (rule.kind) {
    case 'once':
      return `Una vez · ${shortDate(rule.date)}`
    case 'daily':
      return 'Cada día'
    case 'weekly': {
      const days = [...new Set(rule.weekdays)].sort((a, b) => a - b)
      if (days.length === 7) return 'Todos los días'
      const names = days.map((day) => WEEKDAY_NAMES[day - 1] ?? '')
      const text =
        names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '')
      return capitalize(text)
    }
    case 'monthly':
      // From the 29th, a month may not have the day: it falls on its last one.
      return rule.month_day >= 29
        ? `Día ${rule.month_day} de cada mes (o el último)`
        : `Día ${rule.month_day} de cada mes`
  }
}

function occursOn(rule: Recurrence, day: string): boolean {
  const date = parseDay(day)
  switch (rule.kind) {
    case 'once':
      return day === rule.date
    case 'daily':
      return true
    case 'weekly':
      return rule.weekdays.includes(isoWeekday(date) as 1 | 2 | 3 | 4 | 5 | 6 | 7)
    case 'monthly':
      return date.getUTCDate() === Math.min(rule.month_day, lastDayOfMonth(date))
  }
}

// Where a new or edited schedule starts, as the server computes it (domain/recurrence.py): today
// if it falls today and nothing was generated for today yet, otherwise the next occurrence.
// Only for the preview in the form; the server decides. Independent of the active days.
export function startingOccurrence(
  rule: Recurrence,
  today: string,
  lastGeneratedFor: string | null,
): string | null {
  if (lastGeneratedFor !== today && occursOn(rule, today)) return today
  if (rule.kind === 'once') return rule.date > today ? rule.date : null
  for (let offset = 1; offset <= SEARCH_DAYS; offset += 1) {
    const day = addDays(today, offset)
    if (occursOn(rule, day)) return day
  }
  return null
}
