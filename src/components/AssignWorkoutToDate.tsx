import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { Session, TrainerClient, WorkoutTemplate } from '../../shared/types.ts'
import { Button, Card, DateInput, Field } from './ui.tsx'

export const ASSIGN_WORKOUT_NOTE =
  'Assigning creates a unique session for that person and date. You can edit that assigned workout without changing the template. Later edits to the template do not apply to sessions already assigned.'

const selectClass =
  'w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm'

export function AssignWorkoutToDate({
  clients,
  templates,
  clientId,
  templateId,
  onClientIdChange,
  onTemplateIdChange,
  onAssigned,
}: {
  clients?: TrainerClient[]
  templates?: WorkoutTemplate[]
  clientId: string
  templateId: string
  onClientIdChange?: (id: string) => void
  onTemplateIdChange?: (id: string) => void
  onAssigned?: () => void | Promise<void>
}) {
  const { me } = useAuth()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assigned, setAssigned] = useState<Session | null>(null)

  const canAssign = Boolean(clientId && templateId && date)

  const assign = async () => {
    if (!canAssign) return
    setSaving(true)
    setError(null)
    setAssigned(null)
    try {
      const session = await api<Session>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ clientId, templateId, date }),
      })
      setAssigned(session)
      await onAssigned?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign workout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Assign workout</h2>
      <p className="text-sm text-muted">{ASSIGN_WORKOUT_NOTE}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {templates && onTemplateIdChange ? (
          <Field label="Workout">
            <select
              className={selectClass}
              value={templateId}
              onChange={(event) => onTemplateIdChange(event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {clients && onClientIdChange ? (
          <Field label="Person">
            <select
              className={selectClass}
              value={clientId}
              onChange={(event) => onClientIdChange(event.target.value)}
            >
              <option value="">Select a person</option>
              {me?.client?.isSelf ? (
                <option value={me.client.id}>Myself</option>
              ) : null}
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Date">
          <DateInput value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button
            className="w-full sm:w-auto"
            disabled={!canAssign || saving}
            onClick={() => void assign()}
          >
            {saving ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {assigned ? (
        <p className="text-sm text-lime">
          Assigned{' '}
          <Link to={`/sessions/${assigned.id}`} className="underline">
            {assigned.name}
          </Link>{' '}
          for {assigned.scheduledDate}
          {assigned.clientName ? ` · ${assigned.clientName}` : ''}.
        </p>
      ) : null}
    </Card>
  )
}
