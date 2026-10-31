import type { AchievementStatus } from '../../api/types'
import { formatShortDay } from './calendar'

// «Sala de trofeos»: the whole catalog; a locked one shows its condition and the word
// «Bloqueado», so the state never depends on the look (WCAG 1.4.1).
export function TrophyRoom({
  achievements,
}: {
  achievements: readonly AchievementStatus[]
}): JSX.Element {
  const unlocked = achievements.filter((item) => item.unlocked_at !== null).length
  return (
    <section
      aria-labelledby="trophies-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="trophies-heading" className="text-heading font-heading text-text">
          Sala de trofeos
        </h2>
        <p className="text-caption font-semibold text-text">
          {unlocked} / {achievements.length} desbloqueados
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {achievements.map((item) => {
          const date = item.unlocked_at
          return (
            <li
              key={item.id}
              data-unlocked={date !== null}
              className={`rounded-xl border p-3 ${
                date !== null ? 'border-gold bg-surface' : 'border-border bg-surface-alt'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-body font-semibold text-text">{item.name}</p>
                <p className="text-caption text-text-muted">
                  {date !== null ? formatShortDay(date.slice(0, 10)) : 'Bloqueado'}
                </p>
              </div>
              <p className="mt-1 text-caption text-text-muted">{item.condition}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
