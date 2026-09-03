import type {
  ExerciseHistoryEntry,
  TrainerClient,
} from '../../shared/types.ts'
import { useAuth } from '../lib/auth.tsx'
import { Field, Select } from './ui.tsx'

export function useSelfClientId() {
  const { me } = useAuth()
  return me?.client?.isSelf ? me.client.id : ''
}

export function historyContextName(
  clients: TrainerClient[],
  selectedClientId: string,
  selfClientId: string,
) {
  if (selfClientId && selectedClientId === selfClientId) return 'You'
  return clients.find((client) => client.id === selectedClientId)?.name
}

export function ClientHistorySelector({
  clients,
  value,
  onChange,
}: {
  clients: TrainerClient[]
  value: string
  onChange: (clientId: string) => void
}) {
  const selfClientId = useSelfClientId()
  return (
    <Field label="Client history context">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a client</option>
        {selfClientId ? <option value={selfClientId}>Myself</option> : null}
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export function MovementHistoryContext({
  movementName,
  clientName,
  entries = [],
  loading = false,
  error = null,
  showSelectPrompt = false,
}: {
  movementName: string
  clientName?: string
  entries?: ExerciseHistoryEntry[]
  loading?: boolean
  error?: string | null
  showSelectPrompt?: boolean
}) {
  if (!clientName) {
    if (!showSelectPrompt) return null
    return (
      <p className="text-xs text-muted">
        Select a client to view logged history for {movementName}
      </p>
    )
  }
  if (loading) return <p className="text-xs text-muted">Loading logged history…</p>
  if (error) return <p className="text-xs text-red-300">{error}</p>
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted">
        {clientName} {clientName === 'You' ? 'have' : 'has'} no logged history for {movementName}
      </p>
    )
  }

  const groups = groupHistory(entries)
  const latest = groups[0]!

  return (
    <div className="space-y-2 rounded-xl border border-line bg-ink/40 px-3 py-2.5">
      <div className="space-y-1">
        <p className="text-xs font-medium">
          Latest logged: {latest.date} · {latest.sessionName}
        </p>
        <SetHistory entries={latest.entries} />
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-white">
          View full history ({groups.length} {groups.length === 1 ? 'workout' : 'workouts'})
        </summary>
        <div className="mt-2 divide-y divide-line border-t border-line">
          {groups.map((group) => (
            <div key={group.key} className="space-y-1 py-2 last:pb-0">
              <p className="text-xs font-medium">
                {group.date} · {group.sessionName}
              </p>
              <SetHistory entries={group.entries} />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function SetHistory({ entries }: { entries: ExerciseHistoryEntry[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {entries.map((entry, index) => (
        <span key={`${entry.sessionId}-${entry.setIndex}-${index}`}>
          Set {entry.setIndex + 1}: {entry.weight ?? '—'} lb × {entry.reps ?? '—'}
        </span>
      ))}
    </div>
  )
}

function groupHistory(entries: ExerciseHistoryEntry[]) {
  const groups = new Map<
    string,
    { key: string; date: string; sessionName: string; entries: ExerciseHistoryEntry[] }
  >()
  for (const entry of entries) {
    const key = entry.sessionId
    const group = groups.get(key) ?? {
      key,
      date: entry.date,
      sessionName: entry.sessionName,
      entries: [],
    }
    group.entries.push(entry)
    groups.set(key, group)
  }
  return [...groups.values()]
}
