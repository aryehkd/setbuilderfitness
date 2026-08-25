import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell.tsx'
import { useAuth } from './lib/auth.tsx'
import { ClientDetailPage } from './pages/ClientDetailPage.tsx'
import { ClientHomePage } from './pages/ClientHomePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { OnboardingPage } from './pages/OnboardingPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { SessionDetailPage } from './pages/SessionDetailPage.tsx'
import { TemplateEditorPage } from './pages/TemplateEditorPage.tsx'
import { TrainerHomePage } from './pages/TrainerHomePage.tsx'
import { WorkoutListPage } from './pages/WorkoutListPage.tsx'

function Guard({ children }: { children: ReactNode }) {
  const { loading, identity, me } = useAuth()
  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-muted">Loading…</div>
  }
  if (!identity) return <Navigate to="/login" replace />
  if (!me?.user.onboardingCompleted) return <Navigate to="/onboarding" replace />
  return children
}

function Home() {
  const { me } = useAuth()
  if (me?.user.role === 'trainer') return <TrainerHomePage />
  return <ClientHomePage />
}

function TrainerOnly({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  if (me?.user.role !== 'trainer') return <Navigate to="/" replace />
  return children
}

function NotFound() {
  const { pathname } = useLocation()
  // Identity has no local backend, so /.netlify/identity/* falls through to the SPA in dev.
  const isIdentityPath = pathname.startsWith('/.netlify/identity')

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="font-display text-2xl font-bold">
          {isIdentityPath ? 'Identity is not running here' : 'Page not found'}
        </h1>
        <p className="text-sm text-muted">
          {isIdentityPath
            ? 'Netlify Identity is a hosted service and has no local backend, so this URL only resolves on a deployed Netlify site with Identity enabled.'
            : `Nothing is routed at ${pathname}.`}
        </p>
        <Link to="/login" className="inline-block text-sm text-lime">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  const { loading, identity, me } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          !loading && identity ? (
            <Navigate to={me?.user.onboardingCompleted ? '/' : '/onboarding'} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/onboarding"
        element={
          loading ? (
            <div className="flex min-h-svh items-center justify-center text-muted">Loading…</div>
          ) : !identity ? (
            <Navigate to="/login" replace />
          ) : me?.user.onboardingCompleted ? (
            <Navigate to="/" replace />
          ) : (
            <OnboardingPage />
          )
        }
      />
      <Route
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route
          path="/workouts"
          element={
            <TrainerOnly>
              <WorkoutListPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/workouts/:id"
          element={
            <TrainerOnly>
              <TemplateEditorPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <TrainerOnly>
              <ClientDetailPage />
            </TrainerOnly>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
