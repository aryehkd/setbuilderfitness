import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heatmap } from '../components/Heatmap.tsx'
import { Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { ActivityDay, Session } from '../../shared/types.ts'

export function ProfilePage() {
  const { me } = useAuth()
  const year = new Date().getFullYear()
  const [days, setDays] = useState<ActivityDay[]>([])
  const [past, setPast] = useState<Session[]>([])

  useEffect(() => {
    void api<ActivityDay[]>(`/api/activity?year=${year}`).then(setDays)
    void api<Session[] | { sessions: Session[] }>('/api/past-workouts').then((data) => {
      setPast(Array.isArray(data) ? data : data.sessions)
    })
  }, [year])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center gap-4">
        {me?.identity.pictureUrl && (
          <img
            src={me.identity.pictureUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="font-display text-3xl font-bold">{me?.user.name}</h1>
          <p className="text-muted">
            {me?.user.email} · {me?.user.role}
          </p>
          {me?.trainer && (
            <p className="text-sm">
              Trainer code <span className="font-mono text-lime">{me.trainer.code}</span>
            </p>
          )}
          {me?.client?.trainerName && (
            <p className="text-sm text-muted">Trainer: {me.client.trainerName}</p>
          )}
        </div>
      </div>
      <Card>
        <h2 className="mb-4 font-semibold">{year} training time</h2>
        <Heatmap year={year} days={days} />
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Past workouts</h2>
        {past.length === 0 && <p className="text-sm text-muted">No completed workouts yet.</p>}
        <ul className="divide-y divide-line">
          {past.map((s) => (
            <li key={s.id} className="py-2">
              <Link to={`/sessions/${s.id}`} className="text-sm hover:text-lime">
                {s.scheduledDate} · {s.name} · {s.status}
                {s.loggedDurationSeconds
                  ? ` · ${Math.round(s.loggedDurationSeconds / 60)} min`
                  : ''}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
