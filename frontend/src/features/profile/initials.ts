// Backgrounds of the initials avatar: white text on a dark shade, so contrast is the same in
// the light and the dark theme. Full literal class names: Tailwind only generates what it can
// read in the source.
export const AVATAR_COLOR_CLASSES: readonly string[] = [
  'bg-blue-700 text-white',
  'bg-teal-700 text-white',
  'bg-purple-700 text-white',
  'bg-rose-700 text-white',
  'bg-amber-800 text-white',
  'bg-emerald-800 text-white',
  'bg-indigo-700 text-white',
  'bg-slate-700 text-white',
]

// The same account always gets the same color, whatever its name: it is derived from the uid.
export function avatarColorClass(seed: string): string {
  let hash = 0
  for (const character of seed) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0
  }
  return AVATAR_COLOR_CLASSES[hash % AVATAR_COLOR_CLASSES.length] as string
}

// First letter or digit of a word, skipping emojis, signs and punctuation around it.
function firstLetterOf(word: string): string {
  const match = /[\p{L}\p{N}]/u.exec(word)
  return match ? match[0].toUpperCase() : ''
}

// One word gives one initial; several give the first and the last (a middle name is skipped).
function initialsFromWords(words: string[]): string {
  const initials = words.map(firstLetterOf).filter((initial) => initial !== '')
  if (initials.length === 0) return ''
  if (initials.length === 1) return initials[0] as string
  return `${initials[0]}${initials[initials.length - 1]}`
}

// Initials of the shown name or, when it has no letters (empty, only emojis), of the e-mail's
// local part. Never empty: an avatar must not be a blank circle.
export function initialsOf(name: string | null | undefined, email?: string | null): string {
  const fromName = initialsFromWords((name ?? '').split(/\s+/))
  if (fromName !== '') return fromName
  const localPart = (email ?? '').split('@')[0] ?? ''
  const fromEmail = initialsFromWords(localPart.split(/[._+-]+/))
  return fromEmail !== '' ? fromEmail : '?'
}
