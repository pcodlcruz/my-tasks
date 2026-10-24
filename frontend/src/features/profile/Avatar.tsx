import type { Avatar as AvatarData } from '../../api/types'
import { findAvatar } from './avatars'
import { avatarColorClass, initialsOf } from './initials'

interface AvatarProps {
  // `undefined` while the profile is loading or if it failed: the initials are shown, never a gap.
  avatar: AvatarData | undefined
  name: string
  email?: string | null
  // Stable per account (the uid): picks the color of the initials.
  seed: string
  size?: 'sm' | 'lg'
  // The surrounding link or heading already says who it is: nothing to announce.
  decorative?: boolean
  isLoading?: boolean
  // The `blob:` URL of an uploaded image. Without it (still downloading, or it failed) an
  // uploaded avatar shows the initials like any other.
  imageUrl?: string
}

const SIZE_CLASSES = { sm: 'h-8 w-8 text-caption', lg: 'h-24 w-24 text-display' } as const

const BASE_CLASSES =
  'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold'

export function Avatar({
  avatar,
  name,
  email,
  seed,
  size = 'sm',
  decorative = false,
  isLoading = false,
  imageUrl,
}: AvatarProps): JSX.Element {
  const hidden = decorative ? ('true' as const) : undefined
  const catalogAvatar = avatar?.kind === 'preset' ? findAvatar(avatar.preset) : undefined

  if (catalogAvatar) {
    // The illustrations are drawn for a light background, so they sit on a fixed light circle
    // in both themes (like the Google button, this is artwork, not a themed surface).
    return (
      <span
        aria-hidden={hidden}
        className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} bg-white ring-1 ring-border`}
      >
        <img
          src={catalogAvatar.src}
          alt={decorative ? '' : catalogAvatar.name}
          className="h-[85%] w-[85%]"
        />
      </span>
    )
  }

  if (avatar?.kind === 'upload' && imageUrl !== undefined) {
    return (
      <span
        aria-hidden={hidden}
        className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} bg-white ring-1 ring-border`}
      >
        <img
          src={imageUrl}
          alt={decorative ? '' : 'Tu imagen de avatar'}
          className="h-full w-full object-cover"
        />
      </span>
    )
  }

  // Without an image (initials, a stale identifier, or an upload not downloaded yet).
  const initials = initialsOf(name, email)
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `Iniciales ${initials}`}
      aria-hidden={hidden}
      aria-busy={isLoading ? 'true' : undefined}
      className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} ${avatarColorClass(seed)} ${
        isLoading ? 'animate-pulse' : ''
      }`}
    >
      {initials}
    </span>
  )
}
