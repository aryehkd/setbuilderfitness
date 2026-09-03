import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  SessionPrescriptionEditor,
  SessionPrescriptionTable,
} from '../components/SessionPrescriptionEditor.tsx'
import { WorkoutPrescriptionPreview } from '../components/WorkoutPrescriptionPreview.tsx'
import { VersionHistory } from '../components/VersionHistory.tsx'
import {
  ClientHistorySelector,
  historyContextName,
  useSelfClientId,
} from '../components/MovementHistoryContext.tsx'
import { ModeToggle } from '../components/WorkoutEditorControls.tsx'
import { useMovementHistoryContext } from '../hooks/useMovementHistoryContext.ts'
import { Button, Card, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type {
  Movement,
  Prescription,
  ProgramSession,
  TrainerClient,
} from '../../shared/types.ts'
import { warmupToText } from '../../shared/types.ts'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type EditorView = 'edit' | 'compact' | 'preview'

export function ProgramSessionEditorPage() {
  const { id, sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<ProgramSession | null>(null)
  const [draft, setDraft] = useState<{ name: string; prescription: Prescription } | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [clients, setClients] = useState<TrainerClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [requestedView, setView] = useState<EditorView>('edit')
  const [tableAllowed, setTableAllowed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !sessionId) return
    void api<ProgramSession>(`/api/programs/${id}/sessions/${sessionId}`).then((data) => {
      setSession(data)
      setDraft({
        name: data.name,
        prescription: structuredClone(data.prescription),
      })
      setDirty(false)
    })
  }, [id, sessionId])

  useEffect(() => {
    void api<Movement[]>('/api/movements?q=').then(setMovements)
    void api<TrainerClient[]>('/api/clients').then(setClients)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setTableAllowed(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const view: EditorView = requestedView === 'compact' && !tableAllowed ? 'edit' : requestedView

  // Table and client view each start wherever they land; only the build view
  // returns the trainer to where they left off.
  const editScrollY = useRef(0)
  const restoreEditScroll = useRef(false)

  const changeView = (next: EditorView) => {
    if (next === view) return
    if (view === 'edit') editScrollY.current = window.scrollY
    if (next === 'edit') restoreEditScroll.current = true
    setView(next)
  }

  useLayoutEffect(() => {
    if (view !== 'edit' || !restoreEditScroll.current) return
    restoreEditScroll.current = false
    window.scrollTo(0, editScrollY.current)
  }, [view])

  const selfClientId = useSelfClientId()
  const selectedClientName = historyContextName(clients, selectedClientId, selfClientId)
  const movementHistory = useMovementHistoryContext(
    selectedClientId,
    draft?.prescription.exercises.map((exercise) => exercise.movementId) ?? [],
  )

  const editDraft = (next: { name: string; prescription: Prescription }) => {
    setDirty(true)
    setDraft(next)
  }

  const save = async () => {
    if (!id || !sessionId || !draft) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api<ProgramSession>(`/api/programs/${id}/sessions/${sessionId}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      })
      setSession(updated)
      setDraft({
        name: updated.name,
        prescription: structuredClone(updated.prescription),
      })
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save program workout')
    } finally {
      setSaving(false)
    }
  }

  if (!session || !draft) return <p className="p-6 text-muted">Loading program workout…</p>

  const saveButton = (
    <Button disabled={saving || !draft.name.trim()} onClick={() => void save()}>
      {saving ? 'Saving…' : 'Save changes'}
    </Button>
  )

  const header = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to={`/programs/${id}`}
          className="inline-flex items-center justify-center rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm font-semibold text-muted hover:border-muted hover:text-white"
        >
          Back to program
        </Link>
        <p className="text-sm text-muted">
          Week {session.weekIndex + 1} · {WEEKDAYS[session.weekday]} · changes stay in this program
          only
        </p>
      </div>
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:px-6">
        {view === 'preview' ? (
          <h1 className="min-w-0 flex-1 font-display text-2xl font-bold">{draft.name}</h1>
        ) : (
          <TextInput
            value={draft.name}
            onChange={(event) => editDraft({ ...draft, name: event.target.value })}
            className="min-w-0 flex-1 font-display text-2xl font-bold"
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:shrink-0 sm:justify-start">
          <ModeToggle
            value={view}
            options={[
              { value: 'edit' as const, label: 'Build' },
              ...(tableAllowed ? [{ value: 'compact' as const, label: 'Table' }] : []),
              { value: 'preview' as const, label: 'Client view' },
            ]}
            onChange={changeView}
          />
          <span className="text-xs text-muted">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          {saveButton}
        </div>
      </div>
    </>
  )

  const footer = (
    <>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Card className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => navigate(`/programs/${id}`)}>
          Done
        </Button>
        {saveButton}
      </Card>
      <VersionHistory events={session.versionHistory} />
    </>
  )

  return (
    <div
      className={`mx-auto space-y-6 px-4 py-6 sm:px-6 ${
        view === 'compact' ? 'max-w-[90rem]' : 'max-w-5xl'
      }`}
    >
      {header}

      {view === 'edit' ? (
        <>
          <Card className="space-y-2">
            <ClientHistorySelector
              clients={clients}
              value={selectedClientId}
              onChange={setSelectedClientId}
            />
            <p className="text-xs text-muted">
              This selection only adds coaching context. It does not assign the workout.
            </p>
          </Card>
          <SessionPrescriptionEditor
            name={draft.name}
            prescription={draft.prescription}
            movements={movements}
            clientName={selectedClientName}
            movementHistory={movementHistory.history}
            movementHistoryLoading={movementHistory.loading}
            movementHistoryError={movementHistory.error}
            showName={false}
            onChange={editDraft}
          />
        </>
      ) : null}

      {view === 'compact' ? (
        <SessionPrescriptionTable
          name={draft.name}
          prescription={draft.prescription}
          showName={false}
          onChange={editDraft}
        />
      ) : null}

      {view === 'preview' ? (
        <>
          <p className="text-sm text-muted">
            This is how the workout looks to a client. Logging is disabled in the preview.
          </p>
          <WorkoutPrescriptionPreview
            warmup={warmupToText(draft.prescription.warmup)}
            exercises={draft.prescription.exercises}
            showSetRows
          />
        </>
      ) : null}

      {footer}
    </div>
  )
}
