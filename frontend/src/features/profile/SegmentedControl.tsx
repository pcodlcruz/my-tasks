import { useId } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  // Decorative: the label always carries the meaning.
  icon?: string
}

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
}

// A group of mutually exclusive options built on native radio buttons, so the arrow keys,
// the focus and the screen-reader semantics come for free. The chosen option is told apart by
// border, background and a check mark, never by color alone (WCAG 1.4.1).
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>): JSX.Element {
  const labelId = useId()
  const name = useId()

  return (
    <div>
      <p id={labelId} className="mb-2 text-body-strong font-body-strong text-text">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className={`relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2 text-body ${
                selected
                  ? 'border-primary bg-primary/10 font-semibold text-text'
                  : 'border-border bg-surface text-text-muted hover:border-primary/60 hover:text-text'
              } focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {option.icon !== undefined && <span aria-hidden="true">{option.icon}</span>}
              <span>{option.label}</span>
              {selected && (
                <span aria-hidden="true" className="text-primary">
                  ✓
                </span>
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
