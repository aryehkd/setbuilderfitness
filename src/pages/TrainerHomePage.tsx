import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { Program, Session, TrainerClient, WorkoutTemplate } from '../../shared/types.ts'

const HOME_PREVIEW_LIMIT = 5

function recencyMs(iso: string | null | undefined) {
  if (!iso) return 0
  const value = Date.parse(iso)
  return Number.isNaN(value) ? 0 : value
}

function SeeAllLink({ to }: { to: string }) {
  return (
    <Link to={to} className="shrink-0 text-sm text-muted hover:text-lime">
      See all
    </Link>
  )
}

export function TrainerHomePage() {
  const { me } = useAuth()
  const [clients, setClients] = useState<TrainerClient[]>([])
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [upcoming, setUpcoming] = useState<Session[]>([])

  useEffect(() => {
    void api<TrainerClient[]>('/api/clients').then(setClients)
    void api<WorkoutTemplate[]>('/api/templates').then(setTemplates)
    void api<Program[]>('/api/programs').then(setPrograms)
    const from = new Date().toISOString().slice(0, 10)
    void api<Session[]>(`/api/sessions?from=${from}`).then(setUpcoming)
  }, [])

  const recentClients = useMemo(
    () =>
      [...clients]
        .sort((a, b) => {
          const dateDiff = recencyMs(b.lastSessionDate) - recencyMs(a.lastSessionDate)
          if (dateDiff) return dateDiff
          return b.upcomingCount - a.upcomingCount
        })
        .slice(0, HOME_PREVIEW_LIMIT),
    [clients],
  )
  const recentTemplates = useMemo(
    () => [...templates].sort((a, b) => recencyMs(b.updatedAt) - recencyMs(a.updatedAt)).slice(0, HOME_PREVIEW_LIMIT),
    [templates],
  )
  const recentPrograms = useMemo(
    () => [...programs].sort((a, b) => recencyMs(b.updatedAt) - recencyMs(a.updatedAt)).slice(0, HOME_PREVIEW_LIMIT),
    [programs],
  )

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
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Clients</h2>
            <SeeAllLink to="/clients" />
          </div>
          {clients.length === 0 && (
            <p className="text-sm text-muted">
              No clients yet. Share your code so they can join.
            </p>
          )}
          <ul className="space-y-2">
            {recentClients.map((c) => (
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Workout templates</h2>
            <SeeAllLink to="/workouts" />
          </div>
          {templates.length === 0 && (
            <p className="text-sm text-muted">Create a template to assign sessions.</p>
          )}
          <ul className="space-y-2">
            {recentTemplates.map((t) => (
              <li key={t.id}>
                <Link to={`/workouts/${t.id}`} className="text-sm hover:text-lime">
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Programs</h2>
            <SeeAllLink to="/programs" />
          </div>
          {programs.length === 0 && (
            <p className="text-sm text-muted">Build a program from your saved workouts.</p>
          )}
          <ul className="space-y-2">
            {recentPrograms.map((program) => (
              <li key={program.id}>
                <Link to={`/programs/${program.id}`} className="text-sm hover:text-lime">
                  {program.name}
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
