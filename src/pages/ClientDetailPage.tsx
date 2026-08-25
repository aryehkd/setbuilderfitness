import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, Field, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type { Session, TrainerClient, WorkoutTemplate } from '../../shared/types.ts'

export function ClientDetailPage() {
  const { id } = useParams()
  const [client, setClient] = useState<TrainerClient | null>(null)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [templateId, setTemplateId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const load = async () => {
    const [clients, tpls, sess] = await Promise.all([
      api<TrainerClient[]>('/api/clients'),
      api<WorkoutTemplate[]>('/api/templates'),
      api<Session[]>(`/api/sessions?clientId=${id}`),
    ])
    setClient(clients.find((c) => c.id === id) ?? null)
    setTemplates(tpls)
    setSessions(sess)
    if (!templateId && tpls[0]) setTemplateId(tpls[0].id)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const assign = async () => {
    await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ clientId: id, templateId, date }),
    })
    await load()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl font-bold">{client?.name || 'Client'}</h1>
      <p className="text-muted">{client?.email}</p>
      <Card className="space-y-3">
        <h2 className="font-semibold">Assign a workout to a date</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Workout">
            <select
              className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button disabled={!templateId} onClick={() => void assign()}>
              Assign
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Assigned sessions</h2>
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/sessions/${s.id}`}>
                {s.scheduledDate} · {s.name} · {s.status}
              </Link>
              <button
                type="button"
                className="text-xs text-red-300"
                onClick={async () => {
                  await api(`/api/sessions/${s.id}`, { method: 'DELETE' })
                  await load()
                }}
              >
                Unassign
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
