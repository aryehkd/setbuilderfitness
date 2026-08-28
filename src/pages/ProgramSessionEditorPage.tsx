import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SessionPrescriptionEditor } from '../components/SessionPrescriptionEditor.tsx'
import { VersionHistory } from '../components/VersionHistory.tsx'
import {
  ClientHistorySelector,
} from '../components/MovementHistoryContext.tsx'
import { useMovementHistoryContext } from '../hooks/useMovementHistoryContext.ts'
import { Button, Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type {
  Movement,
  Prescription,
  ProgramSession,
  TrainerClient,
} from '../../shared/types.ts'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function ProgramSessionEditorPage() {
  const { id, sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<ProgramSession | null>(null)
  const [draft, setDraft] = useState<{ name: string; prescription: Prescription } | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [clients, setClients] = useState<TrainerClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
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
    })
  }, [id, sessionId])

  useEffect(() => {
    void api<Movement[]>('/api/movements?q=').then(setMovements)
    void api<TrainerClient[]>('/api/clients').then(setClients)
  }, [])

  const selectedClient = clients.find((client) => client.id === selectedClientId)
  const movementHistory = useMovementHistoryContext(
    selectedClientId,
    draft?.prescription.exercises.map((exercise) => exercise.movementId) ?? [],
  )

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save program workout')
    } finally {
      setSaving(false)
    }
  }

  if (!session || !draft) return <p className="p-6 text-muted">Loading program workout…</p>

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/programs/${id}`}
            className="mb-2 inline-flex items-center justify-center rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm font-semibold text-muted hover:border-muted hover:text-white"
          >
            Back to program
          </Link>
          <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">
            Edit program workout
          </h1>
          <p className="text-sm text-muted">
            Week {session.weekIndex + 1} · {WEEKDAYS[session.weekday]} · changes stay in this
            program only
          </p>
        </div>
        <Button disabled={saving || !draft.name.trim()} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
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
        clientName={selectedClient?.name}
        movementHistory={movementHistory.history}
        movementHistoryLoading={movementHistory.loading}
        movementHistoryError={movementHistory.error}
        onChange={setDraft}
      />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Card className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => navigate(`/programs/${id}`)}>
          Done
        </Button>
        <Button disabled={saving || !draft.name.trim()} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </Card>
      <VersionHistory events={session.versionHistory} />
    </div>
  )
}
