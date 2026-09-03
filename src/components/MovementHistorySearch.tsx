import { useEffect, useMemo, useState } from 'react'
import { movementMatchesQuery } from '../../shared/search.ts'
import { Card, TextInput } from './ui.tsx'
import { api } from '../lib/api.ts'
import type { ExerciseHistoryEntry, LoggedMovement } from '../../shared/types.ts'

export function MovementHistorySearch({
  clientId,
  description = 'Search movements this client has logged.',
}: {
  clientId: string
  description?: string
}) {
  const [movements, setMovements] = useState<LoggedMovement[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<LoggedMovement | null>(null)
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void api<LoggedMovement[]>(`/api/logged-movements?clientId=${clientId}`)
      .then(setMovements)
      .finally(() => setLoading(false))
  }, [clientId])

  const matches = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return []
    return movements.filter((movement) => movementMatchesQuery(movement, search)).slice(0, 8)
  }, [movements, query])

  const chooseMovement = async (movement: LoggedMovement) => {
    setSelected(movement)
    setQuery(movement.name)
    setHistory([])
    const rows = await api<ExerciseHistoryEntry[]>(
      `/api/exercise-history?clientId=${clientId}&movementId=${movement.id}`,
    )
    setHistory(rows)
  }

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, ExerciseHistoryEntry[]>()
    for (const entry of history) {
      const key = entry.sessionId
      const entries = groups.get(key) ?? []
      entries.push(entry)
      groups.set(key, entries)
    }
    return [...groups.values()]
  }, [history])

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Movement history</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="relative">
        <TextInput
          type="search"
          placeholder="Search logged movements"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(null)
            setHistory([])
          }}
        />
        {query.trim() && !selected && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-xl">
            {matches.map((movement) => (
              <button
                key={movement.id}
                type="button"
                className="block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-ink"
                onClick={() => void chooseMovement(movement)}
              >
                {movement.name}
              </button>
            ))}
            {matches.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">No logged movements match.</p>
            )}
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-muted">Loading movement history…</p>
      ) : movements.length === 0 ? (
        <p className="text-sm text-muted">This client has no logged movement data yet.</p>
      ) : selected ? (
        groupedHistory.length > 0 ? (
          <div className="divide-y divide-line">
            {groupedHistory.map((entries) => (
              <div
                key={`${entries[0]!.date}-${entries[0]!.sessionName}`}
                className="space-y-1 py-3 first:pt-0 last:pb-0"
              >
                <p className="text-sm font-medium">
                  {entries[0]!.date} · {entries[0]!.sessionName}
                </p>
                {entries.map((entry) => (
                  <p key={entry.setIndex} className="text-sm text-muted">
                    Set {entry.setIndex + 1}: {entry.weight ?? '—'} lb × {entry.reps ?? '—'}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No completed sets found.</p>
        )
      ) : (
        <p className="text-sm text-muted">Choose a movement to view its history.</p>
      )}
    </Card>
  )
}
