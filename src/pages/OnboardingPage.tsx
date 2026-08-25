import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Field, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { MeResponse, Role } from '../../shared/types.ts'

export function OnboardingPage() {
  const { refreshMe } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<{ name: string; code: string } | null>(null)
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
        body: JSON.stringify({
          role,
          name,
          bio,
          trainerCode: code,
        }),
      })
      await refreshMe()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish setup')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
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
              className="text-xs text-muted"
              onClick={() => {
                setRole(null)
                setLookup(null)
              }}
            >
              Change role
            </button>
            <Field label="Your name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {role === 'trainer' && (
              <Field label="Bio (optional)">
                <TextInput value={bio} onChange={(e) => setBio(e.target.value)} />
              </Field>
            )}
            {role === 'client' && (
              <div className="space-y-3">
                <Field label="Trainer code">
                  <div className="flex gap-2">
                    <TextInput
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase())
                        setLookup(null)
                      }}
                      placeholder="K7M2QX"
                    />
                    <Button type="button" variant="ghost" onClick={() => void findTrainer()}>
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
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
            <Button
              disabled={busy || !name.trim() || (role === 'client' && !lookup)}
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
