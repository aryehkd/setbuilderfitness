import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Heatmap } from '../components/Heatmap.tsx'
import { MovementHistorySearch } from '../components/MovementHistorySearch.tsx'
import { Button, Card, ConfirmLink, Field, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type {
  ActivityDay,
  Program,
  Session,
  TrainerClient,
  WorkoutTemplate,
} from '../../shared/types.ts'

export function ClientDetailPage() {
  const { id } = useParams()
  const [client, setClient] = useState<TrainerClient | null>(null)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activity, setActivity] = useState<ActivityDay[]>([])
  const [templateId, setTemplateId] = useState('')
  const [programId, setProgramId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const year = new Date().getFullYear()

  const load = async () => {
    const [clients, tpls, programRows, sess, activityDays] = await Promise.all([
      api<TrainerClient[]>('/api/clients'),
      api<WorkoutTemplate[]>('/api/templates'),
      api<Program[]>('/api/programs'),
      api<Session[]>(`/api/sessions?clientId=${id}`),
      api<ActivityDay[]>(`/api/activity?year=${year}&clientId=${id}`),
    ])
    setClient(clients.find((c) => c.id === id) ?? null)
    setTemplates(tpls)
    setPrograms(programRows)
    setSessions(sess)
    setActivity(activityDays)
    if (!templateId && tpls[0]) setTemplateId(tpls[0].id)
    if (!programId && programRows[0]) setProgramId(programRows[0].id)
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

  const assignProgram = async () => {
    if (!id || !programId) return
    await api(`/api/programs/${programId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ clientId: id, startDate: date }),
    })
    await load()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <h1 className="break-words font-display text-3xl font-bold">{client?.name || 'Client'}</h1>
      <p className="break-all text-muted">{client?.email}</p>
      <Card>
        <h2 className="mb-4 font-semibold">{year} Completed sessions</h2>
        <Heatmap year={year} days={activity} />
      </Card>
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
            <Button className="w-full sm:w-auto" disabled={!templateId} onClick={() => void assign()}>
              Assign
            </Button>
          </div>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Assign a program</h2>
        <p className="text-sm text-muted">
          Places every program workout on the client calendar, starting the week of the date you
          pick. Each day is a unique assigned workout.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Program">
            <select
              className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start week">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button
              className="w-full sm:w-auto"
              disabled={!programId}
              onClick={() => void assignProgram()}
            >
              Assign program
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Assigned sessions</h2>
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-col items-start gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <Link to={`/sessions/${s.id}`} className="break-words">
                {s.scheduledDate} · {s.name} · {s.status}
              </Link>
              <ConfirmLink
                className="min-h-11 shrink-0 text-xs text-red-300 sm:min-h-0"
                confirmLabel="Confirm unassign"
                onConfirm={async () => {
                  await api(`/api/sessions/${s.id}`, { method: 'DELETE' })
                  await load()
                }}
              >
                Unassign
              </ConfirmLink>
            </li>
          ))}
        </ul>
      </Card>
      {id && <MovementHistorySearch clientId={id} />}
    </div>
  )
}
