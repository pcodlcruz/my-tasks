import { SCOPE_LABELS } from '../../api/types'
import { type ScopeFilterValue, useUiStore } from '../../stores/uiStore'

const OPTIONS: { value: ScopeFilterValue; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'work', label: SCOPE_LABELS.work },
  { value: 'personal', label: SCOPE_LABELS.personal },
]

export function ScopeFilter(): JSX.Element {
  const scopeFilter = useUiStore((state) => state.scopeFilter)
  const setScopeFilter = useUiStore((state) => state.setScopeFilter)

  return (
    <fieldset
      role="radiogroup"
      aria-label="Filtrar por ámbito"
      className="flex items-center gap-1 rounded-xl border border-border bg-surface-alt p-1"
    >
      <legend className="sr-only">Filtrar por ámbito</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className="cursor-pointer">
          <input
            type="radio"
            name="scope_filter"
            value={option.value}
            checked={scopeFilter === option.value}
            onChange={() => setScopeFilter(option.value)}
            className="sr-only"
          />
          <span
            className={`inline-block rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors ${
              scopeFilter === option.value
                ? 'border border-border bg-surface text-text shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
