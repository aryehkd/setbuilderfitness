import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, ConfirmLink, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type { WorkoutTemplate } from '../../shared/types.ts'

export function WorkoutListPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const load = () => {
    void api<WorkoutTemplate[]>('/api/templates').then(setTemplates)
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    const created = await api<WorkoutTemplate>('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'New workout' }),
    })
    navigate(`/workouts/${created.id}`)
  }

  const copy = async (id: string) => {
    if (copyingId) return
    setCopyingId(id)
    try {
      const created = await api<WorkoutTemplate>(`/api/templates/${id}/copy`, {
        method: 'POST',
      })
      navigate(`/workouts/${created.id}`)
    } finally {
      setCopyingId(null)
    }
  }

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return templates
    return templates.filter((template) => template.name.toLowerCase().includes(search))
  }, [templates, query])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display shrink-0 text-3xl font-bold">Workouts</h1>
        <TextInput
          type="search"
          aria-label="Search workouts"
          placeholder="Search workouts…"
          className="min-w-40 flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button className="w-full sm:w-auto" onClick={() => void create()}>
          Create workout
        </Button>
      </div>
      <div className="grid gap-3">
        {filtered.map((t) => (
          <Card key={t.id} className="flex items-center justify-between gap-3">
            <Link to={`/workouts/${t.id}`} className="min-w-0 break-words font-medium hover:text-lime">
              {t.name}
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              {t.updatedAt ? (
                <span className="hidden text-xs text-zinc-500 lg:inline">
                  last modified:{' '}
                  {new Date(t.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              ) : null}
              <button
                type="button"
                className="min-h-11 shrink-0 text-xs text-muted hover:text-white disabled:opacity-50 sm:min-h-0"
                disabled={copyingId === t.id}
                onClick={() => void copy(t.id)}
              >
                Copy
              </button>
              <ConfirmLink
                className="min-h-11 shrink-0 text-xs text-red-300 sm:min-h-0"
                confirmLabel="Confirm delete"
                onConfirm={async () => {
                  await api(`/api/templates/${t.id}`, { method: 'DELETE' })
                  load()
                }}
              >
                Delete
              </ConfirmLink>
            </div>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-muted">No templates yet. Build your first program.</p>
        )}
        {templates.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted">No workouts match that search.</p>
        )}
      </div>
    </div>
  )
}
