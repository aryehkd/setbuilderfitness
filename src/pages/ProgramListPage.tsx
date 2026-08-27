import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type { Program } from '../../shared/types.ts'

export function ProgramListPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const navigate = useNavigate()

  const load = () => {
    void api<Program[]>('/api/programs').then(setPrograms)
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    const created = await api<Program>('/api/programs', {
      method: 'POST',
      body: JSON.stringify({ name: 'New program' }),
    })
    navigate(`/programs/${created.id}`)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Programs</h1>
        <Button className="w-full sm:w-auto" onClick={() => void create()}>
          Create program
        </Button>
      </div>
      <div className="grid gap-3">
        {programs.map((program) => (
          <Card key={program.id} className="flex items-center justify-between gap-3">
            <Link
              to={`/programs/${program.id}`}
              className="min-w-0 break-words font-medium hover:text-lime"
            >
              {program.name}
              <span className="ml-2 text-sm font-normal text-muted">
                {program.weekCount} week{program.weekCount === 1 ? '' : 's'}
              </span>
            </Link>
            <button
              type="button"
              className="min-h-11 shrink-0 text-xs text-red-300 sm:min-h-0"
              onClick={async () => {
                await api(`/api/programs/${program.id}`, { method: 'DELETE' })
                load()
              }}
            >
              Delete
            </button>
          </Card>
        ))}
        {programs.length === 0 && (
          <p className="text-sm text-muted">
            No programs yet. Build a week-by-week plan from your saved workouts.
          </p>
        )}
      </div>
    </div>
  )
}
