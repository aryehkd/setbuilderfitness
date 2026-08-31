import { useState } from 'react'
import type { AdHocType } from '../../shared/types.ts'
import { api } from '../lib/api.ts'
import { Button, Card, DateInput, Field, TextInput } from './ui.tsx'

export function ExtraActivityForm({ onLogged }: { onLogged?: () => void | Promise<void> }) {
  const [activityType, setActivityType] = useState<AdHocType>('cardio')
  const [minutes, setMinutes] = useState('30')
  const [notes, setNotes] = useState('')
  const [loggedOn, setLoggedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const durationMinutes = Number(minutes)
  const canSubmit = Number.isFinite(durationMinutes) && durationMinutes > 0 && Boolean(loggedOn)

  const logActivity = async () => {
    if (!canSubmit) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await api('/api/ad-hoc', {
        method: 'POST',
        body: JSON.stringify({
          activityType,
          durationMinutes,
          notes,
          loggedOn,
        }),
      })
      setNotes('')
      setMessage('Logged extra activity.')
      await onLogged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log activity')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Track extra activity</h2>
      <p className="text-sm text-muted">Log training that was not assigned as a workout.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Type">
          <select
            className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
            value={activityType}
            onChange={(event) => setActivityType(event.target.value as AdHocType)}
          >
            <option value="cardio">Cardio</option>
            <option value="sport">Sport</option>
            <option value="mobility">Mobility</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Minutes">
          <TextInput
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </Field>
        <Field label="Date">
          <DateInput value={loggedOn} onChange={(event) => setLoggedOn(event.target.value)} />
        </Field>
        <Field label="Notes">
          <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={!canSubmit || saving}
        onClick={() => void logActivity()}
      >
        {saving ? 'Logging…' : 'Log activity'}
      </Button>
      {message && <p className="text-sm text-lime">{message}</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </Card>
  )
}
