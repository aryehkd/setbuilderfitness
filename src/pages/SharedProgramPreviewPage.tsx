import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../components/ui.tsx'
import { WorkoutPrescriptionPreview } from '../components/WorkoutPrescriptionPreview.tsx'
import { api } from '../lib/api.ts'
import type { LibraryShareAcceptResult, LibrarySharePreview } from '../../shared/types.ts'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function SharedProgramPreviewPage() {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<LibrarySharePreview | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!shareId) return
    void api<LibrarySharePreview>(`/api/library-shares/${shareId}`)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load share'))
  }, [shareId])

  const program = preview?.program
  const byCell = useMemo(() => {
    const map = new Map<string, NonNullable<typeof program>['sessions']>()
    for (const session of program?.sessions ?? []) {
      const key = `${session.weekIndex}-${session.weekday}`
      const list = map.get(key) ?? []
      list.push(session)
      map.set(key, list)
    }
    return map
  }, [program])

  const openSession = program?.sessions?.find((session) => session.id === openSessionId)

  const addToLibrary = async () => {
    if (!shareId) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<LibraryShareAcceptResult>(`/api/library-shares/${shareId}/accept`, {
        method: 'POST',
      })
      if (result.programId) navigate(`/programs/${result.programId}`)
      else navigate('/programs')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to library')
      setBusy(false)
    }
  }

  const dismiss = async () => {
    if (!shareId) return
    setBusy(true)
    try {
      await api(`/api/library-shares/${shareId}`, { method: 'DELETE' })
      navigate('/programs')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss')
      setBusy(false)
    }
  }

  if (error && !preview) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <p className="text-sm text-red-300">{error}</p>
        <Link to="/programs" className="text-sm text-lime">
          Back to programs
        </Link>
      </div>
    )
  }
  if (!preview || !program) return <p className="p-6 text-muted">Loading shared program…</p>

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted">
            Shared by {preview.share.ownerName}
          </p>
          <h1 className="font-display text-2xl font-bold">{program.name}</h1>
          <p className="text-sm text-muted">
            {program.weekCount} week{program.weekCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void addToLibrary()}>
            {busy ? 'Adding…' : 'Add to my library'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void dismiss()}>
            Dismiss
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <p className="text-sm text-muted">
        Preview only. Adding this program copies it, its workouts, and any custom movements into
        your library.
      </p>

      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          <div className="grid grid-cols-8 gap-2 text-xs uppercase text-muted">
            <div className="px-1 py-2">Week</div>
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-1 py-2 text-center">
                {day}
              </div>
            ))}
          </div>
          {Array.from({ length: program.weekCount }, (_, weekIndex) => (
            <div key={weekIndex} className="mb-2 grid grid-cols-8 gap-2">
              <div className="flex items-center px-1 text-sm font-semibold">W{weekIndex + 1}</div>
              {WEEKDAYS.map((_, weekday) => {
                const items = byCell.get(`${weekIndex}-${weekday}`) ?? []
                return (
                  <div
                    key={weekday}
                    className="min-h-24 space-y-1 rounded-xl border border-line bg-panel p-1.5"
                  >
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        title={item.name}
                        className={`block w-full truncate rounded-lg px-1.5 py-1 text-left text-xs font-medium hover:text-lime ${
                          openSessionId === item.id
                            ? 'border border-lime bg-ink'
                            : 'border border-transparent bg-ink'
                        }`}
                        onClick={() =>
                          setOpenSessionId((current) => (current === item.id ? null : item.id))
                        }
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {openSession ? (
        <Card className="space-y-4">
          <h2 className="font-semibold">{openSession.name}</h2>
          <WorkoutPrescriptionPreview
            warmup={openSession.prescription.warmup}
            exercises={openSession.prescription.exercises}
          />
        </Card>
      ) : (
        <p className="text-sm text-muted">Select a workout on the calendar to preview it.</p>
      )}
    </div>
  )
}
