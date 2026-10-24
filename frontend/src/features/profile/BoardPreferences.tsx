import type { BoardOrder, DefaultScope, HistoryDays, Profile, ProfileUpdate } from '../../api/types'
import { type SegmentedOption, SegmentedControl } from './SegmentedControl'

interface BoardPreferencesProps {
  profile: Profile
  onChange: (update: ProfileUpdate) => void
}

const SCOPE_OPTIONS: readonly SegmentedOption<DefaultScope>[] = [
  { value: 'all', label: 'Todas' },
  { value: 'work', label: 'Laboral' },
  { value: 'personal', label: 'Personal' },
]

const ORDER_OPTIONS: readonly SegmentedOption<BoardOrder>[] = [
  { value: 'oldest', label: 'Más antiguas primero' },
  { value: 'newest', label: 'Más recientes primero' },
]

// The control works with strings; the API uses a number, or null for the whole history.
type HistoryChoice = 'all' | '30' | '90'

const HISTORY_OPTIONS: readonly SegmentedOption<HistoryChoice>[] = [
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'all', label: 'Todo' },
]

function toChoice(days: HistoryDays): HistoryChoice {
  return days === null ? 'all' : (String(days) as HistoryChoice)
}

function toDays(choice: HistoryChoice): HistoryDays {
  return choice === 'all' ? null : (Number(choice) as 30 | 90)
}

export function BoardPreferences({ profile, onChange }: BoardPreferencesProps): JSX.Element {
  return (
    <section
      aria-labelledby="board-preferences-heading"
      className="rounded-xl border border-border bg-surface p-6 shadow-card"
    >
      <h2 id="board-preferences-heading" className="mb-4 text-heading font-heading text-text">
        Tablero e historial
      </h2>
      <div className="flex flex-col gap-6">
        <SegmentedControl
          label="Tablero por defecto"
          value={profile.default_scope}
          options={SCOPE_OPTIONS}
          onChange={(default_scope) => onChange({ default_scope })}
        />
        <div>
          <SegmentedControl
            label="Orden de las tareas"
            value={profile.board_order}
            options={ORDER_OPTIONS}
            onChange={(board_order) => onChange({ board_order })}
          />
          <p className="mt-2 text-caption text-text-muted">
            Las tareas fijadas siempre aparecen arriba.
          </p>
        </div>
        <SegmentedControl
          label="Historial"
          value={toChoice(profile.history_days)}
          options={HISTORY_OPTIONS}
          onChange={(choice) => onChange({ history_days: toDays(choice) })}
        />
      </div>
    </section>
  )
}
