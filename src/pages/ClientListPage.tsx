import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type { TrainerClient } from '../../shared/types.ts'

export function ClientListPage() {
  const [clients, setClients] = useState<TrainerClient[]>([])

  useEffect(() => {
    void api<TrainerClient[]>('/api/clients').then(setClients)
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Clients</h1>
      <p className="text-sm text-muted">Share your trainer code so new clients can join.</p>
      <div className="grid gap-3">
        {clients.map((client) => (
          <Card key={client.id} className="flex items-center justify-between gap-3">
            <Link
              to={`/clients/${client.id}`}
              className="min-w-0 break-words font-medium hover:text-lime"
            >
              {client.name || client.email}
              {client.name ? (
                <span className="mt-0.5 block break-all text-sm font-normal text-muted">
                  {client.email}
                </span>
              ) : null}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              {client.upcomingCount} upcoming
            </span>
          </Card>
        ))}
        {clients.length === 0 && (
          <p className="text-sm text-muted">No clients yet. Share your code so they can join.</p>
        )}
      </div>
    </div>
  )
}
