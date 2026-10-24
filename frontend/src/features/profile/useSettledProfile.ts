import { useProfile } from '../../api/profile'
import type { Profile } from '../../api/types'

interface SettledProfile {
  profile: Profile | undefined
  // The profile either arrived or failed for good (after its single retry). The screens that
  // depend on a preference wait for this and no longer: with the API down they fall back to
  // the defaults instead of waiting (FR-026).
  settled: boolean
}

export function useSettledProfile(): SettledProfile {
  const { data, isPending } = useProfile()
  return { profile: data, settled: !isPending }
}
