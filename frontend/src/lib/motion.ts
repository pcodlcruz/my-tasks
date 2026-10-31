import { useSyncExternalStore } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function query(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null
}

function subscribe(onChange: () => void): () => void {
  const list = query()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

// Whether the person asked the system for reduced motion; follows changes while the app is open.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false)
}
