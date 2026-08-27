import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  emptyProfileDraft,
  isTrainerProfileComplete,
  ProfileFields,
} from '../components/ProfileFields.tsx'
import { Button, Card, Field, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { MeResponse, Role } from '../../shared/types.ts'

export function OnboardingPage() {
  const { me, refreshMe } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState(me?.user.name || me?.identity.name || '')
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<{ name: string; code: string } | null>(null)
  const [profile, setProfile] = useState(() =>
    emptyProfileDraft({
      name: me?.user.name || me?.identity.name || '',
      email: me?.user.email || me?.identity.email || '',
      accentColor: me?.user.accentColor,
    }),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const findTrainer = async () => {
    setError(null)
    try {
      const result = await api<{ name: string; code: string }>(
        `/api/trainers/lookup?code=${encodeURIComponent(code.trim())}`,
      )
      setLookup(result)
    } catch (err) {
      setLookup(null)
      setError(err instanceof Error ? err.message : 'Trainer not found')
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api<MeResponse>('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(
          role === 'trainer'
            ? { role, ...profile }
            : { role, name, trainerCode: code },
        ),
      })
      await refreshMe()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish setup')
    } finally {
      setBusy(false)
    }
  }

  const canFinish =
    role === 'trainer'
      ? isTrainerProfileComplete(profile)
      : Boolean(name.trim() && lookup)

  return (
    <div className="flex min-h-svh items-center justify-center bg-ink px-4 py-10">
      <div className={`w-full space-y-4 ${role === 'trainer' ? 'max-w-2xl' : 'max-w-lg'}`}>
        <h1 className="font-display text-3xl font-bold">Set up your account</h1>
        <p className="text-muted">This only happens once.</p>
        {!role && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setRole('trainer')}
              className="rounded-2xl border border-line bg-panel p-5 text-left hover:border-lime"
            >
              <div className="font-semibold">I am a trainer</div>
              <p className="mt-1 text-sm text-muted">
                Create programs and assign them to clients.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setRole('client')}
              className="rounded-2xl border border-line bg-panel p-5 text-left hover:border-lime"
            >
              <div className="font-semibold">I am a client</div>
              <p className="mt-1 text-sm text-muted">
                Join your trainer with a short code.
              </p>
            </button>
          </div>
        )}
        {role && (
          <Card className="space-y-4">
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm text-muted"
              onClick={() => {
                setRole(null)
                setLookup(null)
              }}
            >
              Change role
            </button>
            {role === 'trainer' ? (
              <>
                <div>
                  <h2 className="font-semibold">Your profile</h2>
                  <p className="text-sm text-muted">
                    Clients see this when they join you. Finish it to enter the app.
                  </p>
                </div>
                <ProfileFields draft={profile} onChange={setProfile} />
              </>
            ) : (
              <>
                <Field label="Your name">
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <div className="space-y-3">
                  <Field label="Trainer code">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <TextInput
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.toUpperCase())
                          setLookup(null)
                        }}
                        placeholder="K7M2QX"
                      />
                      <Button
                        className="w-full sm:w-auto"
                        type="button"
                        variant="ghost"
                        onClick={() => void findTrainer()}
                      >
                        Find
                      </Button>
                    </div>
                  </Field>
                  {lookup && (
                    <p className="text-sm">
                      Link to trainer <span className="font-semibold">{lookup.name}</span> (
                      {lookup.code})?
                    </p>
                  )}
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
            <Button
              className="w-full sm:w-auto"
              disabled={busy || !canFinish}
              onClick={() => void submit()}
            >
              Finish setup
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
