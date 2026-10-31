import { useState } from 'react'
import { useProgress, useProgressDay, useProgressDays, useStats } from '../../api/progress'
import { calendarRange } from './calendar'
import { DayDetail } from './DayDetail'
import { ProgressCalendar } from './ProgressCalendar'
import { StatsPanel } from './StatsPanel'
import { TrophyRoom } from './TrophyRoom'
import { localDateKey } from '../../lib/dates'

// «Progreso y estadísticas» (S9): the 12-week calendar, the detail of the chosen day, the
// statistics and, with the arcade mode on, the trophy room.
export function ProgressPage(): JSX.Element {
  const { data: progress } = useProgress()
  const today = progress?.today ?? localDateKey()
  const { start, end } = calendarRange(today)
  const days = useProgressDays(start, end)
  const stats = useStats()
  const [chosen, setChosen] = useState<string | null>(null)
  const selected = chosen ?? today
  const stored = days.data?.some((day) => day.date === selected) ?? false
  // A day without a document has nothing to ask for (the server would answer 404).
  const detail = useProgressDay(stored ? selected : null)

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="mb-6 text-display font-display text-text">Progreso y estadísticas</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="calendar-heading"
            className="rounded-xl border border-border bg-surface p-4"
          >
            <h2 id="calendar-heading" className="mb-3 text-heading font-heading text-text">
              Actividad de las últimas 12 semanas
            </h2>
            {days.isPending && (
              <div
                role="status"
                aria-label="Cargando el calendario"
                className="h-48 animate-pulse rounded-xl bg-surface-alt"
              />
            )}
            {days.isError && (
              <div role="alert" className="text-body text-error">
                <p>No se pudo cargar el calendario.</p>
                <button
                  type="button"
                  onClick={() => void days.refetch()}
                  className="mt-2 rounded-lg border border-border px-3 py-1.5 text-caption font-semibold text-text"
                >
                  Reintentar
                </button>
              </div>
            )}
            {days.data !== undefined && (
              <ProgressCalendar
                today={today}
                days={days.data}
                selected={selected}
                onSelect={setChosen}
              />
            )}
          </section>

          {days.data !== undefined && (
            <DayDetail
              day={selected}
              detail={detail.data}
              loading={stored && detail.isPending}
              failed={stored && detail.isError}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {stats.isPending && (
            <div
              role="status"
              aria-label="Cargando las estadísticas"
              className="h-48 animate-pulse rounded-xl bg-surface-alt"
            />
          )}
          {stats.isError && (
            <div role="alert" className="rounded-xl border border-border p-4 text-body text-error">
              <p>No se pudieron cargar las estadísticas.</p>
              <button
                type="button"
                onClick={() => void stats.refetch()}
                className="mt-2 rounded-lg border border-border px-3 py-1.5 text-caption font-semibold text-text"
              >
                Reintentar
              </button>
            </div>
          )}
          {stats.data !== undefined && (
            <>
              <StatsPanel stats={stats.data} />
              {stats.data.arcade !== null && (
                <TrophyRoom achievements={stats.data.arcade.achievements} />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
