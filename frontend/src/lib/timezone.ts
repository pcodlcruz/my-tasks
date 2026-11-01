// The IANA time zone of this device ("Europe/Madrid"), or null if the browser does not say.
export function detectTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof zone === 'string' && zone !== '' ? zone : null
  } catch {
    return null
  }
}

// The zones to choose from: the browser's list, plus the saved and the detected ones if it lacks
// them (some browsers leave out aliases such as "UTC"). The server validates the choice.
export function timezoneOptions(...extra: (string | null)[]): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  const all = new Set(zones)
  for (const zone of extra) {
    if (zone) all.add(zone)
  }
  return [...all].sort((a, b) => a.localeCompare(b))
}
