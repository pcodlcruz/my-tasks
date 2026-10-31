import { useMemo, useState } from 'react'
import type { Profile, ProfileUpdate, Weekday } from '../../api/types'
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from '../../api/types'
import { detectTimezone, timezoneOptions } from '../../lib/timezone'

interface ProgressSettingsProps {
  profile: Profile
  onChange: (update: ProfileUpdate) => void
}

const WEEKDAYS: readonly { value: Weekday; short: string; name: string }[] = [
  { value: 1, short: 'L', name: 'Lunes' },
  { value: 2, short: 'M', name: 'Martes' },
  { value: 3, short: 'X', name: 'Miércoles' },
  { value: 4, short: 'J', name: 'Jueves' },
  { value: 5, short: 'V', name: 'Viernes' },
  { value: 6, short: 'S', name: 'Sábado' },
  { value: 7, short: 'D', name: 'Domingo' },
]

const STEP_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded border border-border bg-surface font-bold text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text'

function goalText(goal: number): string {
  return `${goal} ${goal === 1 ? 'tarea' : 'tareas'}`
}

function toggleWeekday(days: readonly Weekday[], day: Weekday): Weekday[] {
  const next = days.includes(day) ? days.filter((value) => value !== day) : [...days, day]
  return next.sort((a, b) => a - b)
}

// «Progreso y juego» in «Perfil» (S7 v2): the daily goal, the active days and the time zone. Each
// change is saved at once, like the rest of the page. The switches for the morning review and the
// arcade mode arrive in later phases. «Restablecer» leaves this section alone.
export function ProgressSettings({ profile, onChange }: ProgressSettingsProps): JSX.Element {
  // Read once: the device's zone does not change while the page is open.
  const [detected] = useState(detectTimezone)
  const zones = useMemo(
    () => timezoneOptions(profile.timezone, detected),
    [profile.timezone, detected],
  )
  const goal = profile.daily_goal
  const days = profile.active_weekdays

  return (
    <section
      aria-labelledby="progress-settings-heading"
      className="rounded-xl border border-border bg-surface p-6 shadow-card"
    >
      <h2 id="progress-settings-heading" className="mb-4 text-heading font-heading text-text">
        Progreso y juego
      </h2>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p id="daily-goal-label" className="text-body-strong text-text">
              Meta diaria
            </p>
            <p className="mt-0.5 text-caption text-text-muted">
              Tareas que quieres completar cada día
            </p>
          </div>
          <div
            role="group"
            aria-labelledby="daily-goal-label"
            className="flex items-center gap-3 self-start rounded-lg border border-border bg-surface-alt p-1.5"
          >
            <button
              type="button"
              aria-label="Disminuir meta diaria"
              disabled={goal <= DAILY_GOAL_MIN}
              onClick={() => onChange({ daily_goal: goal - 1 })}
              className={STEP_BUTTON}
            >
              −
            </button>
            <span className="min-w-[5rem] px-2 text-center text-body-strong text-text">
              {goalText(goal)}
            </span>
            <button
              type="button"
              aria-label="Aumentar meta diaria"
              disabled={goal >= DAILY_GOAL_MAX}
              onClick={() => onChange({ daily_goal: goal + 1 })}
              className={STEP_BUTTON}
            >
              +
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p id="active-days-label" className="text-body-strong text-text">
            Días activos
          </p>
          <p className="mt-0.5 text-caption text-text-muted">
            En los días no activos no se rompe la racha. Al menos un día.
          </p>
          <div
            role="group"
            aria-labelledby="active-days-label"
            className="mt-3 flex flex-wrap gap-2"
          >
            {WEEKDAYS.map((weekday) => {
              const active = days.includes(weekday.value)
              const isLast = active && days.length === 1
              return (
                <button
                  key={weekday.value}
                  type="button"
                  aria-label={weekday.name}
                  aria-pressed={active}
                  disabled={isLast}
                  onClick={() => onChange({ active_weekdays: toggleWeekday(days, weekday.value) })}
                  className={
                    active
                      ? 'flex h-9 w-9 items-center justify-center rounded-lg border-2 border-primary bg-quadrant-schedule-surface text-caption font-semibold text-primary disabled:cursor-not-allowed'
                      : 'flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-caption text-text-muted hover:bg-surface-alt'
                  }
                >
                  {weekday.short}
                </button>
              )
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <label htmlFor="timezone-select" className="block text-body-strong text-text">
            Zona horaria
          </label>
          <select
            id="timezone-select"
            value={profile.timezone ?? ''}
            onChange={(event) => onChange({ timezone: event.target.value })}
            className="mt-2 w-full max-w-md rounded-lg border border-border bg-surface px-3.5 py-2.5 text-body text-text"
          >
            {profile.timezone === null && (
              <option value="" disabled>
                Sin elegir
              </option>
            )}
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-caption text-text-muted">
            El día empieza a las 04:00 en esta zona.
          </p>
          {detected !== null && detected !== profile.timezone && (
            <p className="mt-1 text-caption text-text-muted">
              Detectada en este dispositivo: {detected} ·{' '}
              <button
                type="button"
                onClick={() => onChange({ timezone: detected })}
                className="font-semibold text-primary underline hover:text-primary-hover"
              >
                Usar esta
              </button>
            </p>
          )}
        </div>

        <p className="border-t border-border pt-4 text-caption text-text-muted">
          «Restablecer valores por defecto» no cambia esta sección.
        </p>
      </div>
    </section>
  )
}
