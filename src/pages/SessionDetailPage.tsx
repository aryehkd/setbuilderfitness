import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Field, TextInput } from '../components/ui.tsx'
import {
  PrescribedExerciseCard,
  RestAfterMovement,
  SupersetFrame,
  groupBySuperset,
  setTarget,
} from '../components/PrescribedExerciseCard.tsx'
import { SessionPrescriptionEditor } from '../components/SessionPrescriptionEditor.tsx'
import { VersionHistory } from '../components/VersionHistory.tsx'
import { useMovementHistoryContext } from '../hooks/useMovementHistoryContext.ts'
import { api } from '../lib/api.ts'
import { useAuth } from '../lib/auth.tsx'
import type {
  ExerciseHistoryEntry,
  Movement,
  Prescription,
  Session,
  SetLog,
} from '../../shared/types.ts'
import { setLogIsCompleted, warmupToText } from '../../shared/types.ts'

export function SessionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { me } = useAuth()
  const isClient = me?.user.role === 'client'
  const [session, setSession] = useState<Session | null>(null)
  const [duration, setDuration] = useState('')
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ name: string; prescription: Prescription } | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const assignmentHistory = useMovementHistoryContext(
    !isClient && editing ? (session?.clientId ?? '') : '',
    draft?.prescription.exercises.map((exercise) => exercise.movementId) ?? [],
  )

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
    next.completed = setLogIsCompleted(next)
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

  const startEditing = async () => {
    if (!session) return
    setEditError(null)
    setDraft({
      name: session.name,
      prescription: structuredClone(session.prescription),
    })
    setEditing(true)
    if (movements.length === 0) {
      try {
        setMovements(await api<Movement[]>('/api/movements?q='))
      } catch (err) {
        setEditError(err instanceof Error ? err.message : 'Could not load movements')
      }
    }
  }

  const saveAssignment = async () => {
    if (!id || !session || !draft) return
    setSavingAssignment(true)
    setEditError(null)
    try {
      const updated = await api<Session>(`/api/sessions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      })
      setSession({
        ...updated,
        clientName: session.clientName,
      })
      setEditing(false)
      setDraft(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save assigned workout')
      await load()
      setEditing(false)
      setDraft(null)
    } finally {
      setSavingAssignment(false)
    }
  }

  const cancelEditing = () => {
    setEditing(false)
    setDraft(null)
    setEditError(null)
  }

  if (!session) return <p className="p-6 text-muted">Loading session…</p>

  const assignmentEditable =
    !isClient && session.status === 'assigned' && session.logs.length === 0

  if (editing && draft) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">
              {session.scheduledDate}
              {session.clientName ? ` · ${session.clientName}` : ''}
            </p>
            <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">
              Edit assigned workout
            </h1>
            <p className="text-sm text-muted">
              These changes apply only to this client&apos;s assigned workout.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={savingAssignment}
              onClick={cancelEditing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingAssignment || !draft.name.trim()}
              onClick={() => void saveAssignment()}
            >
              {savingAssignment ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>

        <SessionPrescriptionEditor
          name={draft.name}
          prescription={draft.prescription}
          movements={movements}
          clientName={session.clientName || 'Client'}
          movementHistory={assignmentHistory.history}
          movementHistoryLoading={assignmentHistory.loading}
          movementHistoryError={assignmentHistory.error}
          onChange={setDraft}
        />

        {editError && <p className="text-sm text-red-300">{editError}</p>}
        <Card className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={savingAssignment}
            onClick={cancelEditing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={savingAssignment || !draft.name.trim()}
            onClick={() => void saveAssignment()}
          >
            {savingAssignment ? 'Saving…' : 'Save changes'}
          </Button>
        </Card>
        <VersionHistory events={session.versionHistory} />
      </div>
    )
  }

  const warmup = warmupToText(session.prescription.warmup)

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{session.scheduledDate}</p>
          <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">{session.name}</h1>
          <p className="text-xs uppercase text-muted">{session.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {assignmentEditable && (
            <Button type="button" onClick={() => void startEditing()}>
              Edit assigned workout
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(isClient ? '/' : `/clients/${session.clientId}`)}
          >
            Exit
          </Button>
        </div>
      </div>

      {!isClient && !assignmentEditable && (
        <Card>
          <p className="text-sm text-muted">
            This assigned workout is locked because client logging has started or the session is
            no longer assigned.
          </p>
        </Card>
      )}
      {!editing && editError && <p className="text-sm text-red-300">{editError}</p>}

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
              <div className="space-y-2">
                {Array.from({ length: ex.setCount }, (_, setIndex) => {
                  const log = logMap.get(`${exerciseIndex}-${setIndex}`)
                  const target = ex.perSetEnabled ? setTarget(ex, setIndex) : null
                  return (
                    <div key={setIndex} className="space-y-1">
                      {target ? (
                        <p className="text-xs text-muted">
                          Set {setIndex + 1}: {target}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
                        <span className="text-xs text-muted">Set {setIndex + 1}</span>
                        <TextInput
                          disabled={!isClient}
                          placeholder="Weight"
                          value={log?.weight ?? ''}
                          onChange={(e) =>
                            updateLog(exerciseIndex, setIndex, {
                              weight: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                        <TextInput
                          disabled={!isClient}
                          className="col-start-2 sm:col-start-auto"
                          placeholder={
                            ex.perSetEnabled
                              ? (setTarget(ex, setIndex) ??
                                (ex.method === 'timed' ? 'Seconds' : 'Reps'))
                              : ex.method === 'timed'
                                ? 'Seconds'
                                : 'Reps'
                          }
                          value={log?.reps ?? ''}
                          onChange={(e) =>
                            updateLog(exerciseIndex, setIndex, {
                              reps: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" variant="ghost" onClick={() => void save()}>
              Save log
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => void save('completed')}>Mark completed</Button>
          </div>
        </Card>
      )}
      {!isClient ? <VersionHistory events={session.versionHistory} /> : null}
    </div>
  )
}
