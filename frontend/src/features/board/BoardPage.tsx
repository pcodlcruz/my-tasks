import { Quadrant } from './Quadrant'

const CANONICAL_QUADRANTS = ['do_now', 'schedule', 'delegate', 'eliminate'] as const

export function BoardPage(): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="mb-6 text-display font-display text-text">Matriz de prioridades</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {CANONICAL_QUADRANTS.map((quadrant) => (
          <Quadrant key={quadrant} quadrant={quadrant} count={0} />
        ))}
      </div>
    </main>
  )
}
