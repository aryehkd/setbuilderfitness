import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShareWithTrainer } from '../components/ShareWithTrainer.tsx'
import { SharedWithMe } from '../components/SharedWithMe.tsx'
import { Button, Card, ConfirmLink } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type { LibraryShare, Program } from '../../shared/types.ts'

export function ProgramListPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [shares, setShares] = useState<LibraryShare[]>([])
  const navigate = useNavigate()

  const load = () => {
    void api<Program[]>('/api/programs').then(setPrograms)
    void api<LibraryShare[]>('/api/library-shares?type=program').then(setShares)
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
      <SharedWithMe
        type="program"
        shares={shares}
        onDismiss={async (id) => {
          await api(`/api/library-shares/${id}`, { method: 'DELETE' })
          load()
        }}
      />
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
            <div className="flex shrink-0 items-center gap-3">
              <ShareWithTrainer compact path={`/api/programs/${program.id}/share`} />
              <ConfirmLink
                className="min-h-11 shrink-0 text-xs text-red-300 sm:min-h-0"
                confirmLabel="Confirm delete"
                onConfirm={async () => {
                  await api(`/api/programs/${program.id}`, { method: 'DELETE' })
                  load()
                }}
              >
                Delete
              </ConfirmLink>
            </div>
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
