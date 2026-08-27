import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { Session, TrainerClient, WorkoutTemplate } from '../../shared/types.ts'

export function TrainerHomePage() {
  const { me } = useAuth()
  const [clients, setClients] = useState<TrainerClient[]>([])
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [upcoming, setUpcoming] = useState<Session[]>([])

  useEffect(() => {
    void api<TrainerClient[]>('/api/clients').then(setClients)
    void api<WorkoutTemplate[]>('/api/templates').then(setTemplates)
    const from = new Date().toISOString().slice(0, 10)
    void api<Session[]>(`/api/sessions?from=${from}`).then(setUpcoming)
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Coach desk</h1>
          <p className="text-muted">
            Your trainer code:{' '}
            <span className="rounded-md bg-lime/15 px-2 py-0.5 font-mono text-lime">
              {me?.trainer?.code}
            </span>
          </p>
        </div>
        <Link to="/workouts" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">New workout</Button>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Clients</h2>
          {clients.length === 0 && (
            <p className="text-sm text-muted">
              No clients yet. Share your code so they can join.
            </p>
          )}
          <ul className="space-y-2">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/clients/${c.id}`}
                  className="flex min-h-11 flex-col items-start gap-1 rounded-xl border border-line px-3 py-2 hover:border-lime sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 break-words">{c.name || c.email}</span>
                  <span className="shrink-0 text-xs text-muted">{c.upcomingCount} upcoming</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Workout templates</h2>
          {templates.length === 0 && (
            <p className="text-sm text-muted">Create a template to assign sessions.</p>
          )}
          <ul className="space-y-2">
            {templates.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Link to={`/workouts/${t.id}`} className="text-sm hover:text-lime">
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Upcoming assigned sessions</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted">Nothing on the calendar yet.</p>}
        <ul className="divide-y divide-line">
          {upcoming.slice(0, 12).map((s) => (
            <li key={s.id}>
              <Link
                to={`/sessions/${s.id}`}
                className="flex min-h-14 flex-col items-start gap-1 py-3 text-sm hover:text-lime sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="break-words">
                  {s.scheduledDate} · {s.name}
                </span>
                <span className="shrink-0 text-muted">{s.clientName}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
