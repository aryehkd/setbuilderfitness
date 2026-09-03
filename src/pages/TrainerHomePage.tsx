import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExtraActivityForm } from '../components/ExtraActivityForm.tsx'
import { WorkoutSchedule } from '../components/WorkoutSchedule.tsx'
import { Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import {
  currentMonthCursor,
  monthRange,
  type MonthCursor,
} from '../lib/workoutSchedule.ts'
import type {
  AdHocLog,
  Program,
  Session,
  TrainerClient,
  WorkoutTemplate,
} from '../../shared/types.ts'

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
  const [sessions, setSessions] = useState<Session[]>([])
  const [activities, setActivities] = useState<AdHocLog[]>([])
  const [cursor, setCursor] = useState<MonthCursor>(currentMonthCursor)
  const [selectedClientId, setSelectedClientId] = useState('')
  const { from, to } = monthRange(cursor)

  useEffect(() => {
    void api<TrainerClient[]>('/api/clients').then(setClients)
    void api<WorkoutTemplate[]>('/api/templates').then(setTemplates)
    void api<Program[]>('/api/programs').then(setPrograms)
  }, [])

  const reloadSessions = async () => {
    const query = new URLSearchParams({ from, to })
    if (selectedClientId) query.set('clientId', selectedClientId)
    setSessions(await api<Session[]>(`/api/sessions?${query.toString()}`))
  }

  useEffect(() => {
    void reloadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, selectedClientId])

  const reloadActivities = async () => {
    setActivities(await api<AdHocLog[]>(`/api/ad-hoc?from=${from}&to=${to}`))
  }

  useEffect(() => {
    void reloadActivities()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

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
  const assignPeople = useMemo(() => {
    const people = me?.client?.isSelf
      ? [{ id: me.client.id, label: 'Myself' }]
      : []
    return [
      ...people,
      ...clients.map((client) => ({
        id: client.id,
        label: client.name || client.email,
        detail: client.name ? client.email : undefined,
      })),
    ]
  }, [clients, me])
  const assignWorkouts = useMemo(
    () => templates.map((template) => ({ id: template.id, label: template.name })),
    [templates],
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
            <h2 className="font-semibold">Workouts</h2>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="schedule-person" className="mb-1 block text-sm font-medium">
            Show workouts for
          </label>
          <select
            id="schedule-person"
            className="min-h-11 rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
          >
            <option value="">Everyone</option>
            {me?.client?.isSelf ? <option value={me.client.id}>Myself</option> : null}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name || client.email}
              </option>
            ))}
          </select>
        </div>
      </div>
      <WorkoutSchedule
        sessions={sessions}
        activities={
          !selectedClientId || selectedClientId === me?.client?.id ? activities : []
        }
        cursor={cursor}
        onCursorChange={setCursor}
        onActivityUpdated={reloadActivities}
        showAssignee
        assign={{
          people: assignPeople,
          workouts: assignWorkouts,
          defaultPersonId: selectedClientId || undefined,
          onAssigned: reloadSessions,
        }}
      />
      <ExtraActivityForm onLogged={reloadActivities} />
    </div>
  )
}
