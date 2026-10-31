import { useEffect, useRef } from 'react'
import { useProfile, useUpdateProfile } from '../../api/profile'
import { detectTimezone } from '../../lib/timezone'

// The first time the profile has no time zone, it takes this device's: the progress day (04:00 to
// 03:59) is computed in it. Once there is one it is never changed on its own, even if the device
// is elsewhere; «Perfil» offers the detected one instead. Runs on every protected screen, so it
// does not wait for the person to open «Perfil».
export function useTimezoneSync(): void {
  const { data: profile } = useProfile()
  const { mutate } = useUpdateProfile()
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current || profile?.timezone !== null) return
    const detected = detectTimezone()
    if (detected === null) return
    sent.current = true
    mutate({ timezone: detected })
  }, [profile?.timezone, mutate])
}
