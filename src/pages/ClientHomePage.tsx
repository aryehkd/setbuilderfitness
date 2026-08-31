import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExtraActivityForm } from '../components/ExtraActivityForm.tsx'
import { WorkoutSchedule } from '../components/WorkoutSchedule.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import {
  currentMonthCursor,
  monthRange,
  type MonthCursor,
} from '../lib/workoutSchedule.ts'
import type { AdHocLog, Session } from '../../shared/types.ts'

export function ClientHomePage() {
  const { me } = useAuth()
  const [cursor, setCursor] = useState<MonthCursor>(currentMonthCursor)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activities, setActivities] = useState<AdHocLog[]>([])
  const { from, to } = monthRange(cursor)

  const reload = async () => {
    const [sessionRows, activityRows] = await Promise.all([
      api<Session[]>(`/api/sessions?from=${from}&to=${to}`),
      api<AdHocLog[]>(`/api/ad-hoc?from=${from}&to=${to}`),
    ])
    setSessions(sessionRows)
    setActivities(activityRows)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

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
      <WorkoutSchedule
        sessions={sessions}
        activities={activities}
        cursor={cursor}
        onCursorChange={setCursor}
        onActivityUpdated={reload}
      />
      <ExtraActivityForm onLogged={reload} />
    </div>
  )
}
