import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.tsx'

export function AppShell() {
  const { me, logout } = useAuth()
  const role = me?.user.role

  return (
    <div className="min-h-svh bg-ink text-[#e8eadf]">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <NavLink to="/" className="font-display text-lg font-bold tracking-tight">
            setbuilder<span className="text-lime">.fitness</span>
          </NavLink>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink to="/" className="text-muted hover:text-white">
              Home
            </NavLink>
            {role === 'trainer' && (
              <NavLink to="/workouts" className="text-muted hover:text-white">
                Workouts
              </NavLink>
            )}
            <NavLink to="/profile" className="text-muted hover:text-white">
              Profile
            </NavLink>
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
      <Outlet />
    </div>
  )
}
