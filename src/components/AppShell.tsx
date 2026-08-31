import type { CSSProperties, ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.tsx'

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean }

function accentContrast(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
  return luminance > 0.179 ? '#0c0d0b' : '#ffffff'
}

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

function ClientsIcon() {
  return (
    <Glyph>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.5" />
      <path d="M15.2 14.2c1.7.6 2.8 2.1 2.8 4.8" />
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

function ProgramsIcon() {
  return (
    <Glyph>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </Glyph>
  )
}

function MovementsIcon() {
  return (
    <Glyph>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="m8.5 8.5 7 7M13 6l5 5M6 13l5 5" />
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

export function AppShell() {
  const { me } = useAuth()
  const role = me?.user.role
  const accentColor = me?.user.accentColor ?? '#c6f54e'

  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: <HomeIcon />, end: true },
    ...(role === 'trainer'
      ? [
          { to: '/clients', label: 'Clients', icon: <ClientsIcon /> },
          { to: '/workouts', label: 'Workouts', icon: <WorkoutsIcon /> },
          { to: '/programs', label: 'Programs', icon: <ProgramsIcon /> },
          { to: '/movements', label: 'Movements', icon: <MovementsIcon /> },
        ]
      : []),
    { to: '/profile', label: 'Profile', icon: <ProfileIcon /> },
  ]

  return (
    <div
      className="min-h-svh bg-ink text-[#e8eadf]"
      style={
        {
          '--color-lime': accentColor,
          '--color-accent-contrast': accentContrast(accentColor),
        } as CSSProperties
      }
    >
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
        </div>
      </nav>
    </div>
  )
}
