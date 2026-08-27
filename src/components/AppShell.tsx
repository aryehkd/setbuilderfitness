import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.tsx'

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean }

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      {children}
    </svg>
  )
}

function HomeIcon() {
  return (
    <Glyph>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </Glyph>
  )
}

function WorkoutsIcon() {
  return (
    <Glyph>
      <path d="M4.5 9v6M7.5 7v10M16.5 7v10M19.5 9v6M7.5 12h9" />
    </Glyph>
  )
}

function ProfileIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5" />
    </Glyph>
  )
}

function LogoutIcon() {
  return (
    <Glyph>
      <path d="M14.5 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8.5" />
      <path d="M13.5 12H21m0 0-2.75-2.75M21 12l-2.75 2.75" />
    </Glyph>
  )
}

export function AppShell() {
  const { me, logout } = useAuth()
  const role = me?.user.role

  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: <HomeIcon />, end: true },
    ...(role === 'trainer'
      ? [{ to: '/workouts', label: 'Workouts', icon: <WorkoutsIcon /> }]
      : []),
    { to: '/profile', label: 'Profile', icon: <ProfileIcon /> },
  ]

  return (
    <div className="min-h-svh bg-ink text-[#e8eadf]">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <NavLink to="/" className="shrink-0 font-display text-lg font-bold tracking-tight">
            setbuilder<span className="text-lime">.fitness</span>
          </NavLink>
          <nav className="hidden items-center gap-4 text-sm sm:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'text-lime' : 'text-muted hover:text-white'
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => void logout()}
              className="text-muted hover:text-white"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>

      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0">
        <Outlet />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="flex items-stretch justify-around">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
                  isActive ? 'text-lime' : 'text-muted'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted"
          >
            <LogoutIcon />
            Log out
          </button>
        </div>
      </nav>
    </div>
  )
}
