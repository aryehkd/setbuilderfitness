import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heatmap } from '../components/Heatmap.tsx'
import { MovementHistorySearch } from '../components/MovementHistorySearch.tsx'
import { Button, Card } from '../components/ui.tsx'
import { ProfileFields, type ProfileDraft } from '../components/ProfileFields.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { ActivityDay, MeResponse, Session } from '../../shared/types.ts'

function draftFromMe(me: MeResponse): ProfileDraft {
  return {
    name: me.user.name,
    email: me.user.email,
    phone: me.user.phone ?? '',
    location: me.user.location ?? '',
    website: me.user.website ?? '',
    timezone: me.user.timezone ?? '',
    bio: me.user.bio ?? '',
    accentColor: me.user.accentColor,
  }
}

export function ProfilePage() {
  const { me, refreshMe } = useAuth()
  const year = new Date().getFullYear()
  const isClient = me?.user.role === 'client'
  const [days, setDays] = useState<ActivityDay[]>([])
  const [past, setPast] = useState<Session[]>([])
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!me) return
    setDraft(draftFromMe(me))
  }, [me])

  useEffect(() => {
    if (!isClient) return
    void api<ActivityDay[]>(`/api/activity?year=${year}`).then(setDays)
    void api<Session[] | { sessions: Session[] }>('/api/past-workouts').then((data) => {
      setPast(Array.isArray(data) ? data : data.sessions)
    })
  }, [year, isClient])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api<MeResponse>('/api/me', {
        method: 'PUT',
        body: JSON.stringify(draft),
      })
      await refreshMe()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3 sm:gap-4">
        {me?.identity.pictureUrl && (
          <img
            src={me.identity.pictureUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover sm:h-16 sm:w-16"
          />
        )}
        <div className="min-w-0">
          <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">{me?.user.name}</h1>
          <p className="break-all text-sm text-muted sm:text-base">
            {me?.user.email} <span aria-hidden="true">·</span> {me?.user.role}
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
      {!isClient ? (
        draft && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Profile</h2>
          <ProfileFields draft={draft} onChange={setDraft} />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                saving ||
                !draft.name.trim() ||
                !draft.email.includes('@') ||
                !/^#[0-9a-f]{6}$/i.test(draft.accentColor)
              }
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
            {saved && <span className="text-sm text-muted">Saved</span>}
          </div>
        </Card>
        )
      ) : (
        <>
          <Card>
            <h2 className="mb-4 font-semibold">{year} Completed sessions</h2>
            <Heatmap year={year} days={days} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Past workouts</h2>
            {past.length === 0 && <p className="text-sm text-muted">No completed workouts yet.</p>}
            <ul className="divide-y divide-line">
              {past.map((s) => (
                <li key={s.id} className="py-2">
                  <Link to={`/sessions/${s.id}`} className="block break-words py-1 text-sm hover:text-lime">
                    {s.scheduledDate} · {s.name} · {s.status}
                    {s.loggedDurationSeconds
                      ? ` · ${Math.round(s.loggedDurationSeconds / 60)} min`
                      : ''}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {me?.client?.id && (
            <MovementHistorySearch
              clientId={me.client.id}
              description="Search movements you have logged."
            />
          )}
        </>
      )}
    </div>
  )
}
