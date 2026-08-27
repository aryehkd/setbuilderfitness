import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Field } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { timezoneLabel } from '../lib/timezones.ts'
import type { PublicTrainerProfile } from '../../shared/types.ts'

function DisplayValue({ children }: { children: string }) {
  return <p className="break-words text-sm sm:text-base">{children}</p>
}

export function TrainerPublicProfilePage() {
  const [trainer, setTrainer] = useState<PublicTrainerProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api<PublicTrainerProfile>('/api/trainer')
      .then(setTrainer)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load trainer')
      })
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <p className="text-sm text-red-300">{error}</p>
        <Link to="/" className="text-sm text-lime">
          Back to home
        </Link>
      </div>
    )
  }

  if (!trainer) {
    return <p className="p-6 text-muted">Loading trainer…</p>
  }

  const websiteHref =
    trainer.website && /^https?:\/\//i.test(trainer.website)
      ? trainer.website
      : trainer.website
        ? `https://${trainer.website}`
        : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Your trainer</p>
        <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">{trainer.name}</h1>
        <p className="text-sm">
          Trainer code <span className="font-mono text-lime">{trainer.code}</span>
        </p>
      </div>
      <Card className="space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <DisplayValue>{trainer.name}</DisplayValue>
          </Field>
          <Field label="Email">
            <a className="break-all text-sm text-lime sm:text-base" href={`mailto:${trainer.email}`}>
              {trainer.email}
            </a>
          </Field>
          {trainer.phone && (
            <Field label="Phone">
              <a className="text-sm text-lime sm:text-base" href={`tel:${trainer.phone}`}>
                {trainer.phone}
              </a>
            </Field>
          )}
          {trainer.location && (
            <Field label="Location">
              <DisplayValue>{trainer.location}</DisplayValue>
            </Field>
          )}
          {websiteHref && (
            <Field label="Website">
              <a
                className="break-all text-sm text-lime sm:text-base"
                href={websiteHref}
                target="_blank"
                rel="noreferrer"
              >
                {trainer.website}
              </a>
            </Field>
          )}
          {trainer.timezone && (
            <Field label="Timezone">
              <DisplayValue>{timezoneLabel(trainer.timezone) ?? trainer.timezone}</DisplayValue>
            </Field>
          )}
          {trainer.bio && (
            <div className="sm:col-span-2">
              <Field label="Bio">
                <DisplayValue>{trainer.bio}</DisplayValue>
              </Field>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
