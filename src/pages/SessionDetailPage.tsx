import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Field, TextInput } from '../components/ui.tsx'
import { PrescribedExerciseCard, RestAfterMovement, SupersetFrame, groupBySuperset } from '../components/PrescribedExerciseCard.tsx'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type { ExerciseHistoryEntry, Session, SetLog } from '../../shared/types.ts'
import { warmupToText } from '../../shared/types.ts'

export function SessionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { me } = useAuth()
  const isClient = me?.user.role === 'client'
  const [session, setSession] = useState<Session | null>(null)
  const [duration, setDuration] = useState('')
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([])

  const logMap = useMemo(() => {
    const map = new Map<string, SetLog>()
    for (const log of session?.logs ?? []) {
      map.set(`${log.exerciseIndex}-${log.setIndex}`, log)
    }
    return map
  }, [session])

  const load = async () => {
    if (!id) return
    const data = await api<Session>(`/api/sessions/${id}`)
    setSession(data)
    setDuration(
      data.loggedDurationSeconds ? String(Math.round(data.loggedDurationSeconds / 60)) : '',
    )
  }

  useEffect(() => {
    void load()
  }, [id])

  const updateLog = (exerciseIndex: number, setIndex: number, patch: Partial<SetLog>) => {
    if (!session) return
    const key = `${exerciseIndex}-${setIndex}`
    const current = logMap.get(key) ?? {
      exerciseIndex,
      setIndex,
      weight: null,
      reps: null,
      completed: false,
    }
    const next = { ...current, ...patch }
    const others = session.logs.filter(
      (l) => !(l.exerciseIndex === exerciseIndex && l.setIndex === setIndex),
    )
    setSession({ ...session, logs: [...others, next] })
  }

  const save = async (status?: Session['status']) => {
    if (!id || !session) return
    const updated = await api<Session>(`/api/sessions/${id}/logs`, {
      method: 'PUT',
      body: JSON.stringify({
        logs: session.logs,
        durationSeconds: duration ? Number(duration) * 60 : null,
        status,
      }),
    })
    setSession(updated)
  }

  const openHistory = async (movementId: string) => {
    setHistoryFor(movementId)
    const rows = await api<ExerciseHistoryEntry[]>(
      `/api/exercise-history?movementId=${movementId}`,
    )
    setHistory(rows)
  }

  if (!session) return <p className="p-6 text-muted">Loading session…</p>

  const warmup = warmupToText(session.prescription.warmup)

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{session.scheduledDate}</p>
          <h1 className="font-display text-3xl font-bold">{session.name}</h1>
          <p className="text-xs uppercase text-muted">{session.status}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate(isClient ? '/' : `/clients/${session.clientId}`)}
        >
          Exit
        </Button>
      </div>

      {warmup ? (
        <Card>
          <h2 className="mb-2 font-semibold">Warmup</h2>
          <p className="whitespace-pre-wrap text-sm">{warmup}</p>
        </Card>
      ) : null}

      {groupBySuperset(session.prescription.exercises).map((block) => {
        const cards = block.items.map(({ exercise: ex, index: exerciseIndex }) => (
          <Fragment key={exerciseIndex}>
            <PrescribedExerciseCard
              exercise={ex}
              actions={
                isClient && (
                  <Button variant="ghost" onClick={() => void openHistory(ex.movementId)}>
                    History
                  </Button>
                )
              }
            >
              {isClient && (
                <div className="space-y-2">
                  {Array.from({ length: ex.setCount }, (_, setIndex) => {
                    const log = logMap.get(`${exerciseIndex}-${setIndex}`)
                    return (
                      <div key={setIndex} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                        <span className="text-xs text-muted">Set {setIndex + 1}</span>
                        <TextInput
                          placeholder="Weight"
                          value={log?.weight ?? ''}
                          onChange={(e) =>
                            updateLog(exerciseIndex, setIndex, {
                              weight: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                        <TextInput
                          placeholder="Reps"
                          value={log?.reps ?? ''}
                          onChange={(e) =>
                            updateLog(exerciseIndex, setIndex, {
                              reps: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={Boolean(log?.completed)}
                            onChange={(e) =>
                              updateLog(exerciseIndex, setIndex, { completed: e.target.checked })
                            }
                          />
                          Done
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}
              {historyFor === ex.movementId && (
                <div className="rounded-xl bg-ink p-3 text-sm">
                  <div className="mb-2 font-medium">Past results</div>
                  {history.length === 0 && <p className="text-muted">No logged sets yet.</p>}
                  {history.map((h, i) => (
                    <div key={i} className="text-muted">
                      {h.date} · set {h.setIndex + 1}: {h.weight ?? '—'} × {h.reps ?? '—'}
                    </div>
                  ))}
                </div>
              )}
            </PrescribedExerciseCard>
            <RestAfterMovement seconds={ex.restAfterExerciseSeconds} />
          </Fragment>
        ))
        if (!block.group) {
          return <Fragment key={block.items[0]!.index}>{cards}</Fragment>
        }
        return (
          <SupersetFrame key={`superset-${block.group}`} group={block.group}>
            {cards}
          </SupersetFrame>
        )
      })}

      {isClient && (
        <Card className="space-y-3">
          <Field label="Total workout time (minutes)">
            <TextInput value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void save()}>
              Save log
            </Button>
            <Button onClick={() => void save('completed')}>Mark completed</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
