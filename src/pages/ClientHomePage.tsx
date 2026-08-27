import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { AdHocType, Session } from '../../shared/types.ts'

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = first.getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < start; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function ClientHomePage() {
  const { me } = useAuth()
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [view, setView] = useState<'calendar' | 'list'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
      ? 'list'
      : 'calendar',
  )
  const [sessions, setSessions] = useState<Session[]>([])
  const [adHocType, setAdHocType] = useState<AdHocType>('cardio')
  const [minutes, setMinutes] = useState('30')
  const [notes, setNotes] = useState('')
  const [loggedOn, setLoggedOn] = useState(now.toISOString().slice(0, 10))
  const [message, setMessage] = useState<string | null>(null)

  const from = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-01`
  const to = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-31`

  const reload = () => {
    void api<Session[]>(`/api/sessions?from=${from}&to=${to}`).then(setSessions)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of sessions) {
      const list = map.get(s.scheduledDate) ?? []
      list.push(s)
      map.set(s.scheduledDate, list)
    }
    return map
  }, [sessions])

  const cells = monthMatrix(cursor.y, cursor.m)
  const title = new Date(cursor.y, cursor.m, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const logAdHoc = async () => {
    setMessage(null)
    await api('/api/ad-hoc', {
      method: 'POST',
      body: JSON.stringify({
        activityType: adHocType,
        durationMinutes: Number(minutes),
        notes,
        loggedOn,
      }),
    })
    setNotes('')
    setMessage('Logged extra activity.')
  }

  const trainer = me?.client?.trainerId
    ? { name: me.client.trainerName, code: me.client.trainerCode }
    : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      {trainer && (
        <Link
          to="/trainer"
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 hover:border-lime sm:px-5"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Your trainer</p>
            <p className="truncate font-semibold">{trainer.name || 'View profile'}</p>
          </div>
          {trainer.code && (
            <span className="shrink-0 rounded-md bg-lime/15 px-2 py-0.5 font-mono text-sm text-lime">
              {trainer.code}
            </span>
          )}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Your training</h1>
        <div className="flex rounded-xl border border-line p-1 text-sm">
          <button
            type="button"
            className={`min-h-11 rounded-lg px-3 py-1 ${view === 'calendar' ? 'bg-lime text-accent-contrast' : 'text-muted'}`}
            onClick={() => setView('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            className={`min-h-11 rounded-lg px-3 py-1 ${view === 'list' ? 'bg-lime text-accent-contrast' : 'text-muted'}`}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              className="min-h-11 text-sm text-muted"
              onClick={() =>
                setCursor((c) =>
                  c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 },
                )
              }
            >
              Previous
            </button>
            <h2 className="font-semibold">{title}</h2>
            <button
              type="button"
              className="min-h-11 text-sm text-muted"
              onClick={() =>
                setCursor((c) =>
                  c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 },
                )
              }
            >
              Next
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                <span className="sm:hidden">{d.slice(0, 1)}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
            {cells.map((day, i) => {
              const key =
                day == null
                  ? null
                  : `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const daySessions = key ? byDay.get(key) ?? [] : []
              return (
                <div
                  key={i}
                  className="min-h-14 min-w-0 rounded-lg border border-line/70 p-1 text-left sm:min-h-20"
                >
                  <div className="text-xs text-muted">{day ?? ''}</div>
                  {daySessions.map((s) => (
                    <Link
                      key={s.id}
                      to={`/sessions/${s.id}`}
                      className="mt-1 block truncate rounded bg-lime/15 px-1 py-0.5 text-[11px] text-lime"
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <Card>
          {sessions.length === 0 && <p className="text-sm text-muted">No assigned workouts this month.</p>}
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="py-3">
                <Link to={`/sessions/${s.id}`} className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-words">
                    {s.scheduledDate} · {s.name}
                  </span>
                  <span className="shrink-0 text-xs uppercase text-muted">{s.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Log something that was not assigned</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Type">
            <select
              className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
              value={adHocType}
              onChange={(e) => setAdHocType(e.target.value as AdHocType)}
            >
              <option value="cardio">Cardio</option>
              <option value="sport">Sport</option>
              <option value="mobility">Mobility</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Minutes">
            <TextInput value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={loggedOn} onChange={(e) => setLoggedOn(e.target.value)} />
          </Field>
          <Field label="Notes">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => void logAdHoc()}>
          Log activity
        </Button>
        {message && <p className="text-sm text-lime">{message}</p>}
      </Card>
    </div>
  )
}
