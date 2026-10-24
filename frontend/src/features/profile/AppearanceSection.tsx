import type { Density, Profile, ProfileUpdate, Theme } from '../../api/types'
import { type SegmentedOption, SegmentedControl } from './SegmentedControl'

interface AppearanceSectionProps {
  profile: Profile
  onChange: (update: ProfileUpdate) => void
}

const THEME_OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'light', label: 'Claro', icon: '☀️' },
  { value: 'dark', label: 'Oscuro', icon: '🌙' },
  { value: 'system', label: 'Sistema', icon: '💻' },
]

const DENSITY_OPTIONS: readonly SegmentedOption<Density>[] = [
  { value: 'comfortable', label: 'Cómoda' },
  { value: 'compact', label: 'Compacta' },
]

// Two miniature task cards that show what the density changes.
function DensityPreview({ density }: { density: Density }): JSX.Element {
  const compact = density === 'compact'
  return (
    <div
      aria-hidden="true"
      className={`mt-3 flex w-48 flex-col rounded-md border border-border bg-surface-alt p-2 ${
        compact ? 'gap-1' : 'gap-2'
      }`}
    >
      {[0, 1].map((card) => (
        <div
          key={card}
          className={`rounded border border-border bg-surface ${compact ? 'h-3' : 'h-6'}`}
        />
      ))}
    </div>
  )
}

export function AppearanceSection({ profile, onChange }: AppearanceSectionProps): JSX.Element {
  return (
    <section
      aria-labelledby="appearance-heading"
      className="rounded-xl border border-border bg-surface p-6 shadow-card"
    >
      <h2 id="appearance-heading" className="mb-4 text-heading font-heading text-text">
        Apariencia
      </h2>
      <div className="flex flex-col gap-6">
        <SegmentedControl
          label="Tema"
          value={profile.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => onChange({ theme })}
        />
        <div>
          <SegmentedControl
            label="Densidad"
            value={profile.density}
            options={DENSITY_OPTIONS}
            onChange={(density) => onChange({ density })}
          />
          <DensityPreview density={profile.density} />
        </div>
      </div>
    </section>
  )
}
