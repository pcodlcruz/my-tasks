import { useEffect } from 'react'
import { useProfile } from '../../api/profile'
import { applyAppearance, writeCachedAppearance } from '../../lib/appearance'

// Applies the profile's theme and density to <html> and keeps the local cache that
// public/theme-init.js reads on the next load. Without a profile (loading, or the API is down)
// it leaves alone what that script already painted, so a failure never changes the look.
export function useAppearance(): void {
  const { data: profile } = useProfile()
  const theme = profile?.theme
  const density = profile?.density

  useEffect(() => {
    if (theme === undefined || density === undefined) return
    const appearance = { theme, density }
    applyAppearance(appearance)
    writeCachedAppearance(appearance)

    // "Sistema" follows the operating system live; an explicit choice does not.
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyAppearance(appearance)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [theme, density])
}
