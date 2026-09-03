import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell.tsx'
import { DevBar } from './components/DevBar.tsx'
import { ScrollToTop } from './components/ScrollToTop.tsx'
import { useAuth } from './lib/auth.tsx'
import { ClientDetailPage } from './pages/ClientDetailPage.tsx'
import { ClientListPage } from './pages/ClientListPage.tsx'
import { ClientHomePage } from './pages/ClientHomePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { OnboardingPage } from './pages/OnboardingPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { TrainerPublicProfilePage } from './pages/TrainerPublicProfilePage.tsx'
import { SessionDetailPage } from './pages/SessionDetailPage.tsx'
import { TemplateEditorPage } from './pages/TemplateEditorPage.tsx'
import { TrainerHomePage } from './pages/TrainerHomePage.tsx'
import { WorkoutListPage } from './pages/WorkoutListPage.tsx'
import { ProgramListPage } from './pages/ProgramListPage.tsx'
import { ProgramEditorPage } from './pages/ProgramEditorPage.tsx'
import { ProgramSessionEditorPage } from './pages/ProgramSessionEditorPage.tsx'
import { SavedMovementsPage } from './pages/SavedMovementsPage.tsx'
import { SharedProgramPreviewPage } from './pages/SharedProgramPreviewPage.tsx'
import { SharedWorkoutPreviewPage } from './pages/SharedWorkoutPreviewPage.tsx'

function Loading() {
  return <div className="flex min-h-svh items-center justify-center text-muted">Loading…</div>
}

function Guard({ children }: { children: ReactNode }) {
  const { loading, me } = useAuth()
  if (loading) return <Loading />
  if (!me) return <Navigate to="/login" replace />
  if (!me.user.onboardingCompleted) return <Navigate to="/onboarding" replace />
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

function AssignedClientOnly({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  if (me?.user.role !== 'client' || !me.client?.trainerId) return <Navigate to="/" replace />
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
  const { loading, me } = useAuth()

  return (
    <>
      <ScrollToTop />
      {import.meta.env.DEV && <DevBar />}
      <Routes>
      <Route
        path="/login"
        element={
          !loading && me ? (
            <Navigate to={me.user.onboardingCompleted ? '/' : '/onboarding'} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/onboarding"
        element={
          loading ? (
            <Loading />
          ) : !me ? (
            <Navigate to="/login" replace />
          ) : me.user.onboardingCompleted ? (
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
        <Route
          path="/trainer"
          element={
            <AssignedClientOnly>
              <TrainerPublicProfilePage />
            </AssignedClientOnly>
          }
        />
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
          path="/shared/workouts/:shareId"
          element={
            <TrainerOnly>
              <SharedWorkoutPreviewPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/movements"
          element={
            <TrainerOnly>
              <SavedMovementsPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/programs"
          element={
            <TrainerOnly>
              <ProgramListPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/programs/:id"
          element={
            <TrainerOnly>
              <ProgramEditorPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/shared/programs/:shareId"
          element={
            <TrainerOnly>
              <SharedProgramPreviewPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/programs/:id/sessions/:sessionId"
          element={
            <TrainerOnly>
              <ProgramSessionEditorPage />
            </TrainerOnly>
          }
        />
        <Route
          path="/clients"
          element={
            <TrainerOnly>
              <ClientListPage />
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
    </>
  )
}
