import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useIsAdmin } from '../features/auth/useIsAdmin'
import { useSession } from '../features/auth/useSession'
import { useAvatarUrl } from '../api/profile'
import { APP_NAME } from '../lib/brand'
import { Avatar } from '../features/profile/Avatar'
import { useSettledProfile } from '../features/profile/useSettledProfile'

interface NavItem {
  to: string
  label: string
  icon: () => JSX.Element
}

// The tabs of the approved header (S3 v3): «Tablero · Progreso · Programadas · Historial ·
// Papelera», plus «Accesos» for the administrator.
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Tablero', icon: BoardIcon },
  { to: '/progreso', label: 'Progreso', icon: ProgressIcon },
  { to: '/programadas', label: 'Programadas', icon: CalendarIcon },
  { to: '/historial', label: 'Historial', icon: HistoryIcon },
  { to: '/papelera', label: 'Papelera', icon: TrashIcon },
]

const ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { to: '/admin/access', label: 'Accesos', icon: KeyIcon },
]

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
      {/* Name, tabs and account are direct children of one wrapping row, so nothing overflows on
          a narrow screen (reflow, WCAG 1.4.10): the name differs in length between fonts, so
          the layout cannot rely on a width that fits "just right". Below the sm breakpoint the
          tabs take a row of their own under the name and the account, which keep the first
          row; the DOM order (name, tabs, account) is the one keyboard and screen reader users
          follow, and from sm up it is also the visual one. With up to six tabs the row of tabs
          scrolls sideways on its own instead of pushing the page wider (feature 007). */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:gap-x-8">
        <span className="order-1 font-heading text-heading font-bold text-schedule">
          {APP_NAME}
        </span>
        <nav
          aria-label="Navegación principal"
          className="order-3 -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 sm:order-2 sm:mx-0 sm:w-auto sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 py-1 ${
                  isActive
                    ? 'border-b-2 border-primary font-semibold text-primary'
                    : 'text-text-muted hover:text-primary'
                }`
              }
            >
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="order-2 ml-auto flex min-w-0 items-center gap-2 sm:order-3 sm:gap-4">
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

// Tab icons of S3 v3: decorative, the label is the link's name.
function TabIcon({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {children}
    </svg>
  )
}

function BoardIcon(): JSX.Element {
  return (
    <TabIcon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </TabIcon>
  )
}

function ProgressIcon(): JSX.Element {
  return (
    <TabIcon>
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="5" />
      <line x1="18" y1="20" x2="18" y2="9" />
    </TabIcon>
  )
}

function CalendarIcon(): JSX.Element {
  return (
    <TabIcon>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </TabIcon>
  )
}

function HistoryIcon(): JSX.Element {
  return (
    <TabIcon>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 15" />
    </TabIcon>
  )
}

function TrashIcon(): JSX.Element {
  return (
    <TabIcon>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </TabIcon>
  )
}

function KeyIcon(): JSX.Element {
  return (
    <TabIcon>
      <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </TabIcon>
  )
}
