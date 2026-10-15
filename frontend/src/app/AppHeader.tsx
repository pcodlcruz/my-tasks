import { NavLink } from 'react-router-dom'
import { useSession } from '../features/auth/useSession'

const NAV_ITEMS = [
  { to: '/', label: 'Tablero' },
  { to: '/historial', label: 'Historial' },
  { to: '/papelera', label: 'Papelera' },
]

export function AppHeader(): JSX.Element {
  const { user, signOut } = useSession()

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <div className="flex items-center gap-4 sm:gap-8">
          <span className="font-heading text-heading font-bold text-schedule">MyTasks</span>
          <nav aria-label="Navegación principal" className="flex items-center gap-1 sm:gap-4">
            {NAV_ITEMS.map((item) => (
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
            <span className="max-w-[16rem] truncate text-caption text-text-muted">
              {user.displayName ?? user.email}
            </span>
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
