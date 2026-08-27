import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, Field, Select, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type { Program, WorkoutTemplate } from '../../shared/types.ts'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ProgramEditorPage() {
  const { id } = useParams()
  const [program, setProgram] = useState<Program | null>(null)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [addingFor, setAddingFor] = useState<{ weekIndex: number; weekday: number } | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [programSessionId, setProgramSessionId] = useState('')
  const [repeatDays, setRepeatDays] = useState<number[]>([])
  const [allWeeks, setAllWeeks] = useState(true)
  const [weekCountDraft, setWeekCountDraft] = useState('')
  const savedWeekCount = useRef(1)
  const weekCountTimer = useRef<number | null>(null)
  const programRef = useRef<Program | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    programRef.current = program
  }, [program])

  useEffect(
    () => () => {
      if (weekCountTimer.current) window.clearTimeout(weekCountTimer.current)
    },
    [],
  )

  const load = async () => {
    if (!id) return
    const data = await api<Program>(`/api/programs/${id}`)
    setProgram(data)
    programRef.current = data
    setWeekCountDraft(String(data.weekCount))
    savedWeekCount.current = data.weekCount
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    void api<WorkoutTemplate[]>('/api/templates').then((rows) => {
      setTemplates(rows)
      if (rows[0]) setTemplateId(rows[0].id)
    })
  }, [])

  const byCell = useMemo(() => {
    const map = new Map<string, NonNullable<Program['sessions']>>()
    for (const session of program?.sessions ?? []) {
      const key = `${session.weekIndex}-${session.weekday}`
      const list = map.get(key) ?? []
      list.push(session)
      map.set(key, list)
    }
    return map
  }, [program])

  const saveMeta = async (patch: Partial<Program>) => {
    const current = programRef.current
    if (!id || !current) return
    setSaving(true)
    try {
      const updated = await api<Program>(`/api/programs/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: patch.name ?? current.name,
          notes: patch.notes ?? current.notes,
          weekCount: patch.weekCount ?? current.weekCount,
        }),
      })
      setProgram(updated)
      programRef.current = updated
      setWeekCountDraft(String(updated.weekCount))
      savedWeekCount.current = updated.weekCount
    } finally {
      setSaving(false)
    }
  }

  const changeWeekCountDraft = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, 2)
    setWeekCountDraft(next)
    const parsed = Number.parseInt(next, 10)
    if (!program || !(parsed >= 1 && parsed <= 16)) return
    setProgram({ ...program, weekCount: parsed })
    if (weekCountTimer.current) window.clearTimeout(weekCountTimer.current)
    // Only auto-save growth. Shrinking deletes sessions in dropped weeks, and a
    // half-typed "1" on the way to "16" would look like a shrink, so wait for blur.
    if (parsed <= savedWeekCount.current) return
    weekCountTimer.current = window.setTimeout(() => {
      weekCountTimer.current = null
      void saveMeta({ weekCount: parsed })
    }, 700)
  }

  const commitWeekCount = () => {
    if (!program) return
    if (weekCountTimer.current) {
      window.clearTimeout(weekCountTimer.current)
      weekCountTimer.current = null
    }
    const parsed = Number.parseInt(weekCountDraft, 10)
    const weekCount = Number.isFinite(parsed)
      ? Math.min(16, Math.max(1, parsed))
      : savedWeekCount.current
    setWeekCountDraft(String(weekCount))
    if (weekCount === savedWeekCount.current) {
      setProgram({ ...program, weekCount })
      return
    }
    const dropped = (program.sessions ?? []).filter((s) => s.weekIndex >= weekCount).length
    if (
      dropped > 0 &&
      !window.confirm(
        `Shrinking to ${weekCount} week${weekCount === 1 ? '' : 's'} deletes ${dropped} workout${
          dropped === 1 ? '' : 's'
        } placed in the weeks you are removing. Continue?`,
      )
    ) {
      setWeekCountDraft(String(savedWeekCount.current))
      setProgram({ ...program, weekCount: savedWeekCount.current })
      return
    }
    void saveMeta({ weekCount })
  }

  const openAdd = (weekIndex: number, weekday: number) => {
    setAddingFor({ weekIndex, weekday })
    setProgramSessionId('')
    setRepeatDays([weekday])
    setAllWeeks(true)
    setError(null)
  }

  const addWorkout = async () => {
    if (!id || !addingFor || (!templateId && !programSessionId)) return
    setSaving(true)
    setError(null)
    try {
      await api(`/api/programs/${id}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          templateId: templateId || undefined,
          programSessionId: programSessionId || undefined,
          weekIndex: addingFor.weekIndex,
          weekday: addingFor.weekday,
          weekdays: repeatDays,
          allWeeks,
        }),
      })
      setAddingFor(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add workout')
    } finally {
      setSaving(false)
    }
  }

  const removeSession = async (sessionId: string) => {
    if (!id) return
    await api(`/api/programs/${id}/sessions/${sessionId}`, { method: 'DELETE' })
    await load()
  }

  if (!program) return <p className="p-6 text-muted">Loading program…</p>

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Field label="Program name">
            <TextInput
              value={program.name}
              onChange={(e) => setProgram({ ...program, name: e.target.value })}
              onBlur={() => void saveMeta({ name: program.name })}
              className="font-display text-2xl font-bold"
            />
          </Field>
        </div>
        <div className="flex items-end gap-3">
          <Field label="Weeks">
            <TextInput
              inputMode="numeric"
              value={weekCountDraft}
              onChange={(e) => changeWeekCountDraft(e.target.value)}
              onBlur={commitWeekCount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="w-20"
            />
          </Field>
          <span className="pb-3.5 text-xs text-muted">{saving ? 'Saving…' : 'Saved'}</span>
        </div>
      </div>
      <p className="text-sm text-muted">
        Place a saved workout on a day. Repeating copies it onto those weekdays as separate
        program workouts you can edit without changing the original.
      </p>

      {addingFor && (
        <Card className="space-y-4">
          <h2 className="font-semibold">
            Add workout · Week {addingFor.weekIndex + 1} · {WEEKDAYS[addingFor.weekday]}
          </h2>
          <Field label="Saved workouts">
            <Select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value)
                if (e.target.value) setProgramSessionId('')
              }}
            >
              <option value="">
                {templates.length === 0 ? 'No saved workouts yet' : 'Choose a saved workout…'}
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Program workouts">
            <Select
              value={programSessionId}
              onChange={(e) => {
                setProgramSessionId(e.target.value)
                if (e.target.value) setTemplateId('')
              }}
            >
              <option value="">
                {(program.sessions ?? []).length === 0
                  ? 'No program workouts yet'
                  : 'Choose a program workout…'}
              </option>
              {(program.sessions ?? []).map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-muted">
            Program workouts are independent copies and are never added to your saved workouts.
          </p>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Repeat on
            </p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((label, weekday) => {
                const on = repeatDays.includes(weekday)
                return (
                  <button
                    key={label}
                    type="button"
                    className={`min-h-11 rounded-lg px-3 text-sm ${
                      on ? 'bg-lime text-accent-contrast' : 'border border-line text-muted'
                    }`}
                    onClick={() =>
                      setRepeatDays((current) =>
                        on
                          ? current.filter((day) => day !== weekday)
                          : [...current, weekday].sort((a, b) => a - b),
                      )
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allWeeks}
              onChange={(e) => setAllWeeks(e.target.checked)}
            />
            Repeat across every week in this program
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                saving || (!templateId && !programSessionId) || repeatDays.length === 0
              }
              onClick={() => void addWorkout()}
            >
              {saving ? 'Adding…' : 'Add to program'}
            </Button>
            <Button variant="ghost" onClick={() => setAddingFor(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

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
                      <div
                        key={item.id}
                        className="rounded-lg border border-transparent bg-ink px-1.5 py-1 hover:border-lime"
                      >
                        <Link
                          to={`/programs/${program.id}/sessions/${item.id}`}
                          title={item.name}
                          className="block truncate text-xs font-medium hover:text-lime"
                        >
                          {item.name}
                        </Link>
                        <button
                          type="button"
                          className="text-[10px] text-red-300"
                          onClick={() => void removeSession(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="flex h-7 w-full items-center justify-center rounded-md border border-transparent text-muted hover:border-lime hover:bg-ink hover:text-white"
                      onClick={() => openAdd(weekIndex, weekday)}
                    >
                      +
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
