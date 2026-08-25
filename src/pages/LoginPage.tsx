import { useEffect, useState } from 'react'
import { getSettings } from '@netlify/identity'
import { Button } from '../components/ui.tsx'
import { useAuth } from '../lib/auth.tsx'

type IdentityState =
  | { status: 'checking' }
  | { status: 'ready'; google: boolean }
  | { status: 'unavailable' }

export function LoginPage() {
  const { login } = useAuth()
  const [identityState, setIdentityState] = useState<IdentityState>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((settings) => {
        if (!cancelled) {
          setIdentityState({ status: 'ready', google: Boolean(settings.providers?.google) })
        }
      })
      .catch(() => {
        if (!cancelled) setIdentityState({ status: 'unavailable' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-svh items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-line bg-panel p-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-lime">Trainer OS</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
            setbuilder.fitness
          </h1>
          <p className="mt-3 text-muted">
            Build programs, assign them to clients, and log every set.
          </p>
        </div>

        {identityState.status === 'checking' && (
          <p className="text-sm text-muted">Checking sign-in options…</p>
        )}

        {identityState.status === 'ready' && identityState.google && (
          <Button className="w-full" onClick={login}>
            Continue with Google
          </Button>
        )}

        {identityState.status === 'ready' && !identityState.google && (
          <div className="rounded-xl border border-line bg-ink p-4 text-sm text-muted">
            Netlify Identity is running, but the Google provider is not enabled. Add it under
            Project configuration → Identity → External providers.
          </div>
        )}

        {identityState.status === 'unavailable' && (
          <div className="space-y-2 rounded-xl border border-line bg-ink p-4 text-sm text-muted">
            <p className="font-medium text-[#e8eadf]">Sign-in is not available on this origin.</p>
            <p>
              Netlify Identity is a hosted service with no local backend, so Google login only
              works on a deployed Netlify site with Identity enabled.
            </p>
          </div>
        )}

        <p className="text-xs text-muted">
          First-time users pick trainer or client in a short setup wizard.
        </p>
      </div>
    </div>
  )
}
