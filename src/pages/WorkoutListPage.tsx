import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type { WorkoutTemplate } from '../../shared/types.ts'

export function WorkoutListPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Workouts</h1>
        <Button onClick={() => void create()}>Create workout</Button>
      </div>
      <div className="grid gap-3">
        {templates.map((t) => (
          <Card key={t.id} className="flex items-center justify-between">
            <Link to={`/workouts/${t.id}`} className="font-medium hover:text-lime">
              {t.name}
            </Link>
            <button
              type="button"
              className="text-xs text-red-300"
              onClick={async () => {
                await api(`/api/templates/${t.id}`, { method: 'DELETE' })
                load()
              }}
            >
              Delete
            </button>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-muted">No templates yet. Build your first program.</p>
        )}
      </div>
    </div>
  )
}
