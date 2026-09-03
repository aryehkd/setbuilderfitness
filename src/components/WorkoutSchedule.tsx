import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdHocLog, AdHocType, Session } from '../../shared/types.ts'
import { api } from '../lib/api.ts'
import { localDateKey, type MonthCursor } from '../lib/workoutSchedule.ts'
import { SearchSelect, type SearchSelectOption } from './SearchSelect.tsx'
import { Button, Card, DateInput, Field, TextInput } from './ui.tsx'

const dayAddButtonClass =
  'flex h-7 w-full items-center justify-center rounded-md border border-transparent text-muted hover:border-lime hover:bg-ink hover:text-white'

function dayCellBorder(date: string | null, todayKey: string) {
  return date === todayKey ? 'border-lime' : 'border-line/70'
}

function monthMatrix(year: number, month: number) {
  const start = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < start; i++) cells.push(null)
  for (let day = 1; day <= days; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function moveMonth(cursor: MonthCursor, amount: number): MonthCursor {
  const next = new Date(cursor.year, cursor.month + amount, 1)
  return { year: next.getFullYear(), month: next.getMonth() }
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - start.getDay())
  return start
}

function moveDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function assigneeLabel(session: Session) {
  return session.isTrainerWorkout ? 'Myself' : session.clientName
}

function SessionCompleteMark({ completed }: { completed: boolean }) {
  return (
    <span
      className={`mt-px inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${
        completed ? 'bg-lime text-accent-contrast' : 'border border-current bg-transparent'
      }`}
      aria-hidden="true"
    >
      {completed ? (
        <svg viewBox="0 0 12 12" className="h-2 w-2" fill="none" aria-hidden="true">
          <path
            d="M2.5 6.2 5 8.5 9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  )
}

function activityLabel(activity: AdHocLog) {
  return `${activity.activityType[0]!.toUpperCase()}${activity.activityType.slice(1)} · ${Math.round(activity.durationSeconds / 60)} min`
}

function ExtraActivityEditor({
  activity,
  onSaved,
  onCancel,
}: {
  activity: AdHocLog
  onSaved: () => void | Promise<void>
  onCancel: () => void
}) {
  const [activityType, setActivityType] = useState(activity.activityType)
  const [minutes, setMinutes] = useState(String(Math.round(activity.durationSeconds / 60)))
  const [loggedOn, setLoggedOn] = useState(activity.loggedOn)
  const [notes, setNotes] = useState(activity.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const durationMinutes = Number(minutes)

  const save = async () => {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || !loggedOn) return
    setSaving(true)
    setError(null)
    try {
      await api(`/api/ad-hoc/${activity.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activityType, durationMinutes, loggedOn, notes }),
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update activity')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">Edit extra activity</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Type">
          <select
            className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
            value={activityType}
            onChange={(event) => setActivityType(event.target.value as AdHocType)}
          >
            <option value="cardio">Cardio</option>
            <option value="sport">Sport</option>
            <option value="mobility">Mobility</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Minutes">
          <TextInput value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </Field>
        <Field label="Date">
          <DateInput value={loggedOn} onChange={(event) => setLoggedOn(event.target.value)} />
        </Field>
        <Field label="Notes">
          <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={saving || !Number.isFinite(durationMinutes) || durationMinutes <= 0 || !loggedOn}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save activity'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </Card>
  )
}

export type ScheduleAssignOptions = {
  people: SearchSelectOption[]
  workouts: SearchSelectOption[]
  defaultPersonId?: string
  onAssigned: () => void | Promise<void>
}

function AssignToDayForm({
  date,
  people,
  workouts,
  defaultPersonId,
  onAssigned,
  onCancel,
}: {
  date: string
  people: SearchSelectOption[]
  workouts: SearchSelectOption[]
  defaultPersonId?: string
  onAssigned: () => void | Promise<void>
  onCancel: () => void
}) {
  const [personId, setPersonId] = useState(defaultPersonId ?? '')
  const [templateId, setTemplateId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const assign = async () => {
    if (!personId || !templateId) return
    setSaving(true)
    setError(null)
    try {
      await api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ clientId: personId, templateId, date }),
      })
      await onAssigned()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign workout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-4">
      <h3 className="font-semibold">Add workout · {dateLabel}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SearchSelect
          label="Person"
          placeholder="Search yourself or a client…"
          options={people}
          valueId={personId}
          onChange={setPersonId}
        />
        <SearchSelect
          label="Workout"
          placeholder="Search workouts…"
          options={workouts}
          valueId={templateId}
          onChange={setTemplateId}
        />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={saving || !personId || !templateId} onClick={() => void assign()}>
          {saving ? 'Adding…' : 'Add workout'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

function DayAddButton({ date, onClick }: { date: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Add workout on ${date}`}
      className={dayAddButtonClass}
      onClick={onClick}
    >
      +
    </button>
  )
}

export function WorkoutSchedule({
  sessions,
  activities = [],
  cursor,
  onCursorChange,
  onActivityUpdated,
  showAssignee = false,
  assign,
}: {
  sessions: Session[]
  activities?: AdHocLog[]
  cursor: MonthCursor
  onCursorChange: (cursor: MonthCursor) => void
  onActivityUpdated?: () => void | Promise<void>
  showAssignee?: boolean
  assign?: ScheduleAssignOptions
}) {
  const [view, setView] = useState<'week' | 'month' | 'list'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
      ? 'list'
      : 'week',
  )
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [editingActivity, setEditingActivity] = useState<AdHocLog | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const todayKey = localDateKey(new Date())
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          a.scheduledDate.localeCompare(b.scheduledDate) || a.name.localeCompare(b.name),
      ),
    [sessions],
  )
  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const session of sortedSessions) {
      const list = map.get(session.scheduledDate) ?? []
      list.push(session)
      map.set(session.scheduledDate, list)
    }
    return map
  }, [sortedSessions])
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`
  const monthSessions = sortedSessions.filter((session) =>
    session.scheduledDate.startsWith(monthPrefix),
  )
  const monthActivities = activities.filter((activity) =>
    activity.loggedOn.startsWith(monthPrefix),
  )
  const listItems = [
    ...monthSessions.map((session) => ({
      kind: 'session' as const,
      date: session.scheduledDate,
      session,
    })),
    ...monthActivities.map((activity) => ({
      kind: 'activity' as const,
      date: activity.loggedOn,
      activity,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const weekDates = Array.from({ length: 7 }, (_, index) => moveDays(weekStart, index))
  const cells = monthMatrix(cursor.year, cursor.month)
  const monthTitle = new Date(cursor.year, cursor.month, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const weekTitle = `${weekStart.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${weekDates[6]!.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`

  const chooseView = (nextView: typeof view) => {
    if (nextView === 'week' && view !== 'week') {
      const today = new Date()
      const date =
        today.getFullYear() === cursor.year && today.getMonth() === cursor.month
          ? today
          : new Date(cursor.year, cursor.month, 1)
      setWeekStart(startOfWeek(date))
    }
    setView(nextView)
  }

  const movePeriod = (amount: number) => {
    if (view === 'week') {
      const next = moveDays(weekStart, amount * 7)
      setWeekStart(next)
      onCursorChange({ year: next.getFullYear(), month: next.getMonth() })
      return
    }
    onCursorChange(moveMonth(cursor, amount))
  }

  const openAdd = (date: string) => {
    setAddingFor(date)
    setEditingActivity(null)
  }

  const assignForm =
    assign && addingFor ? (
      <div className="mt-4">
        <AssignToDayForm
          key={addingFor}
          date={addingFor}
          people={assign.people}
          workouts={assign.workouts}
          defaultPersonId={assign.defaultPersonId}
          onAssigned={async () => {
            await assign.onAssigned()
            setAddingFor(null)
          }}
          onCancel={() => setAddingFor(null)}
        />
      </div>
    ) : null

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">Workout schedule</h2>
        <div className="flex rounded-xl border border-line p-1 text-sm">
          {([
            { value: 'week', label: '7 days' },
            { value: 'month', label: 'Month' },
            { value: 'list', label: 'List' },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              className={`min-h-11 rounded-lg px-3 py-1 ${
                view === option.value ? 'bg-lime text-accent-contrast' : 'text-muted'
              }`}
              onClick={() => chooseView(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            className="min-h-11 text-sm text-muted"
            onClick={() => movePeriod(-1)}
          >
            Previous
          </button>
          <h3 className="text-center font-semibold">
            {view === 'week' ? weekTitle : monthTitle}
          </h3>
          <button
            type="button"
            className="min-h-11 text-sm text-muted"
            onClick={() => movePeriod(1)}
          >
            Next
          </button>
        </div>

        {view === 'week' ? (
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((date) => {
              const dateKey = localDateKey(date)
              const daySessions = byDay.get(dateKey) ?? []
              const dayActivities = activities.filter(
                (activity) => activity.loggedOn === dateKey,
              )
              return (
                <div
                  key={dateKey}
                  className={`flex min-h-36 min-w-0 flex-col rounded-xl border p-2 sm:min-h-48 ${dayCellBorder(dateKey, todayKey)}`}
                >
                  <div className="mb-2 text-center">
                    <div className="text-xs font-medium text-muted">
                      {date.toLocaleDateString(undefined, { weekday: 'short' })}
                    </div>
                    <div className="text-sm font-semibold">
                      {date.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2">
                    {daySessions.map((session) => (
                      <Link
                        key={session.id}
                        to={`/sessions/${session.id}`}
                        title={
                          showAssignee
                            ? `${session.name} · ${assigneeLabel(session) ?? 'Unknown'}`
                            : session.name
                        }
                        className="block rounded-lg bg-lime/15 p-2 text-xs text-lime"
                      >
                        <span className="flex items-start gap-1.5">
                          {showAssignee ? null : (
                            <SessionCompleteMark completed={session.status === 'completed'} />
                          )}
                          <span className="min-w-0 break-words font-medium">{session.name}</span>
                        </span>
                        {showAssignee && assigneeLabel(session) ? (
                          <span className="mt-1 flex items-center gap-1.5 break-words text-[10px] opacity-80">
                            <SessionCompleteMark completed={session.status === 'completed'} />
                            <span className="min-w-0">{assigneeLabel(session)}</span>
                          </span>
                        ) : null}
                      </Link>
                    ))}
                    {dayActivities.map((activity) => (
                      <button
                        key={activity.id}
                        type="button"
                        className="block w-full rounded-lg border border-lime/40 p-2 text-left text-xs text-lime hover:bg-lime/10"
                        onClick={() => setEditingActivity(activity)}
                      >
                        <span className="block break-words font-medium">
                          {activityLabel(activity)}
                        </span>
                        {activity.notes ? (
                          <span className="mt-1 block break-words text-[10px] opacity-80">
                            {activity.notes}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {assign ? (
                    <DayAddButton date={dateKey} onClick={() => openAdd(dateKey)} />
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : view === 'month' ? (
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="py-1">
                <span className="sm:hidden">{day.slice(0, 1)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
            {cells.map((day, index) => {
              const date =
                day == null
                  ? null
                  : `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const daySessions = date ? byDay.get(date) ?? [] : []
              const dayActivities = date
                ? activities.filter((activity) => activity.loggedOn === date)
                : []
              return (
                <div
                  key={index}
                  className={`flex min-h-14 min-w-0 flex-col rounded-lg border p-1 text-left sm:min-h-20 ${dayCellBorder(date, todayKey)}`}
                >
                  <div className="text-xs text-muted">{day ?? ''}</div>
                  <div className="min-h-0 flex-1">
                    {daySessions.map((session) => (
                      <Link
                        key={session.id}
                        to={`/sessions/${session.id}`}
                        title={
                          showAssignee
                            ? `${session.name} · ${assigneeLabel(session) ?? 'Unknown'}`
                            : session.name
                        }
                        className="mt-1 block min-w-0 rounded bg-lime/15 px-1 py-0.5 text-[11px] text-lime"
                      >
                        {showAssignee && assigneeLabel(session) ? (
                          <>
                            <span className="block truncate">{session.name}</span>
                            <span className="mt-0.5 flex items-center gap-1 opacity-80">
                              <SessionCompleteMark completed={session.status === 'completed'} />
                              <span className="min-w-0 truncate">{assigneeLabel(session)}</span>
                            </span>
                          </>
                        ) : (
                          <span className="flex items-center gap-1">
                            <SessionCompleteMark completed={session.status === 'completed'} />
                            <span className="min-w-0 truncate">{session.name}</span>
                          </span>
                        )}
                      </Link>
                    ))}
                    {dayActivities.map((activity) => (
                      <button
                        key={activity.id}
                        type="button"
                        title={`${activityLabel(activity)}${activity.notes ? ` · ${activity.notes}` : ''}`}
                        className="mt-1 block w-full truncate rounded border border-lime/40 px-1 py-0.5 text-left text-[11px] text-lime hover:bg-lime/10"
                        onClick={() => setEditingActivity(activity)}
                      >
                        {activityLabel(activity)}
                      </button>
                    ))}
                  </div>
                  {assign && date ? (
                    <DayAddButton date={date} onClick={() => openAdd(date)} />
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <>
            {listItems.length === 0 && (
              <p className="text-sm text-muted">No workouts or extra activity this month.</p>
            )}
            <ul className="divide-y divide-line">
              {listItems.map((item) =>
                item.kind === 'session' ? (
                  <li key={`session-${item.session.id}`} className="py-3">
                    <Link
                      to={`/sessions/${item.session.id}`}
                      className="flex flex-col items-start gap-1 hover:text-lime sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="flex min-w-0 items-start gap-2 break-words">
                        {showAssignee ? null : (
                          <SessionCompleteMark completed={item.session.status === 'completed'} />
                        )}
                        <span>
                          {item.session.scheduledDate} · {item.session.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                        {showAssignee && assigneeLabel(item.session) ? (
                          <>
                            <SessionCompleteMark completed={item.session.status === 'completed'} />
                            <span>{assigneeLabel(item.session)} · </span>
                          </>
                        ) : null}
                        <span className="uppercase">{item.session.status}</span>
                      </span>
                    </Link>
                  </li>
                ) : (
                  <li key={`activity-${item.activity.id}`} className="py-3">
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-1 text-left hover:text-lime sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => setEditingActivity(item.activity)}
                    >
                      <span className="break-words">
                        {item.activity.loggedOn} · {activityLabel(item.activity)}
                        {item.activity.notes ? ` · ${item.activity.notes}` : ''}
                      </span>
                      <span className="shrink-0 text-xs uppercase text-muted">Extra activity</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </>
        )}
        {assignForm}
      </Card>
      {editingActivity ? (
        <ExtraActivityEditor
          key={editingActivity.id}
          activity={editingActivity}
          onCancel={() => setEditingActivity(null)}
          onSaved={async () => {
            await onActivityUpdated?.()
            setEditingActivity(null)
          }}
        />
      ) : null}
    </section>
  )
}
