import { useEffect, useState } from 'react'
import { MissingIdentityError, getSettings } from '@netlify/identity'
import { Button } from '../components/ui.tsx'
import { useAuth } from '../lib/auth.tsx'
import { DEV_PERSONAS, setDevPersona } from '../lib/devPersona.ts'

type IdentityState =
  | { status: 'checking' }
  | { status: 'ready'; google: boolean }
  | { status: 'not-enabled' }
  | { status: 'unreachable' }

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
      .catch((err: unknown) => {
        if (cancelled) return
        setIdentityState({
          status: err instanceof MissingIdentityError ? 'not-enabled' : 'unreachable',
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-svh items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-line bg-panel p-5 sm:p-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-lime">Trainer OS</p>
          <h1 className="mt-2 break-words font-display text-3xl font-bold tracking-tight sm:text-4xl">
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

        {identityState.status === 'not-enabled' && !import.meta.env.DEV && (
          <div className="space-y-2 rounded-xl border border-line bg-ink p-4 text-sm text-muted">
            <p className="font-medium text-[#e8eadf]">Identity is not enabled for this project.</p>
            <p>
              Turn it on in the Netlify dashboard under Project configuration → Identity, then add
              Google under External providers.
            </p>
          </div>
        )}

        {identityState.status === 'unreachable' && !import.meta.env.DEV && (
          <div className="space-y-2 rounded-xl border border-line bg-ink p-4 text-sm text-muted">
            <p className="font-medium text-[#e8eadf]">Sign-in is temporarily unavailable.</p>
            <p>The Identity service could not be reached. Try again in a moment.</p>
          </div>
        )}

        {import.meta.env.DEV && identityState.status !== 'checking' && (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-200">
              Identity has no local backend. Sign in with a dev persona instead.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {DEV_PERSONAS.map((p) => (
                <Button
                  key={p.key}
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setDevPersona(p.key)
                    window.location.assign('/')
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted">
          First-time users pick trainer or client in a short setup wizard.
        </p>
      </div>
    </div>
  )
}
