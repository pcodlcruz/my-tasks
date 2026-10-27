import { NavLink } from 'react-router-dom'
import { useIsAdmin } from '../features/auth/useIsAdmin'
import { useSession } from '../features/auth/useSession'
import { useAvatarUrl } from '../api/profile'
import { APP_NAME } from '../lib/brand'
import { Avatar } from '../features/profile/Avatar'
import { useSettledProfile } from '../features/profile/useSettledProfile'

const NAV_ITEMS = [
  { to: '/', label: 'Tablero' },
  { to: '/historial', label: 'Historial' },
  { to: '/papelera', label: 'Papelera' },
]

const ADMIN_NAV_ITEMS = [{ to: '/admin/access', label: 'Accesos' }]

export function AppHeader(): JSX.Element {
  const { user, signOut } = useSession()
  const isAdmin = useIsAdmin()
  const { profile, settled } = useSettledProfile()
  const avatarUrl = useAvatarUrl(profile?.avatar)
  // The name shown: the one chosen in the profile, else the Google account's, else the e-mail.
  const shownName = profile?.display_name ?? user?.displayName ?? user?.email ?? ''
  const navItems = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <div className="flex items-center gap-4 sm:gap-8">
          <span className="font-heading text-heading font-bold text-schedule">{APP_NAME}</span>
          <nav aria-label="Navegación principal" className="flex items-center gap-1 sm:gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive
                    ? 'border-b-2 border-primary px-2 py-1 font-semibold text-primary'
                    : 'px-2 py-1 text-text-muted hover:text-primary'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          {user && (
            // A single link to the profile: avatar and name together. On a phone only the
            // avatar shows; the name stays in the accessible name.
            <NavLink
              to="/perfil"
              aria-label={`Perfil de ${shownName}`}
              className={({ isActive }) =>
                `flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 ${
                  isActive
                    ? 'font-semibold text-primary ring-1 ring-primary/40'
                    : 'text-text-muted hover:text-primary'
                }`
              }
            >
              <Avatar
                avatar={profile?.avatar}
                name={shownName}
                email={user.email}
                seed={user.uid}
                size="sm"
                decorative
                isLoading={!settled}
                imageUrl={avatarUrl}
              />
              <span className="hidden max-w-[10rem] truncate text-caption sm:inline">
                {shownName}
              </span>
            </NavLink>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg px-2 py-1 text-caption text-text-muted hover:bg-error/10 hover:text-error"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  )
}
