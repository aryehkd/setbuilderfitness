import type { ReactNode } from 'react'
import { Card } from './ui.tsx'
import type { PrescribedExercise } from '../../shared/types.ts'

type SupersetItem = { supersetGroup?: string | null; supersetOrder?: number | null }

export function groupBySuperset<T extends SupersetItem>(exercises: T[]) {
  const membersByGroup = new Map<string, { exercise: T; index: number }[]>()
  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i]!
    const key = exercise.supersetGroup?.trim()
    if (!key) continue
    const list = membersByGroup.get(key) ?? []
    list.push({ exercise, index: i })
    membersByGroup.set(key, list)
  }
  for (const [key, members] of membersByGroup) {
    members.sort((a, b) => {
      const order = (a.exercise.supersetOrder ?? 0) - (b.exercise.supersetOrder ?? 0)
      if (order !== 0) return order
      return a.index - b.index
    })
    membersByGroup.set(key, members)
  }

  const seen = new Set<string>()
  const blocks: { group: string | null; items: { exercise: T; index: number }[] }[] = []
  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i]!
    const key = exercise.supersetGroup?.trim() || null
    if (!key) {
      blocks.push({ group: null, items: [{ exercise, index: i }] })
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    blocks.push({ group: key, items: membersByGroup.get(key) ?? [{ exercise, index: i }] })
  }
  return blocks
}

export function SupersetFrame({
  group,
  children,
}: {
  group: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-line p-3 sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Superset {group}</p>
      {children}
    </section>
  )
}

export function RestAfterMovement({ seconds }: { seconds: number | null | undefined }) {
  if (seconds == null) return null
  return (
    <p className="py-1 text-center text-sm text-muted">Rest {seconds}s</p>
  )
}

export function youtubeId(url: string) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
    return u.searchParams.get('v')
  } catch {
    return null
  }
}

function summary(ex: PrescribedExercise) {
  return [
    ex.category?.replace('_', ' '),
    ex.equipment,
    ex.method === 'amrap' || ex.method === 'rpe' || ex.method === 'to_failure'
      ? `${ex.setCount} sets`
      : ex.method === 'rir'
        ? `${ex.setCount} × RIR ${ex.repsMin}`
        : `${ex.setCount} × ${ex.repsMin}${ex.repsMax ? `–${ex.repsMax}` : ''}`,
    ex.method === 'reps_range' ? 'rep range' : ex.method.replace('_', ' '),
    ex.loadPrescription,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function PrescribedExerciseCard({
  exercise: ex,
  actions,
  children,
}: {
  exercise: PrescribedExercise
  actions?: ReactNode
  children?: ReactNode
}) {
  const vid = ex.youtubeUrl ? youtubeId(ex.youtubeUrl) : null
  const tempo = [ex.tempo?.eccentric, ex.tempo?.pauseBottom, ex.tempo?.concentric, ex.tempo?.pauseTop]
    .filter((v) => v != null)
    .join(' / ')

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">
            {ex.supersetGroup ? `${ex.supersetGroup}${ex.supersetOrder ?? ''} · ` : ''}
            {ex.movementName}
          </div>
          <p className="text-sm text-muted">{summary(ex)}</p>
          {ex.tempoMode === 'per_rep' && (ex.tempoPerRep?.length ?? 0) > 0 ? (
            <div className="mt-1 space-y-0.5 text-xs text-muted">
              {ex.tempoPerRep!.map((t, i) => {
                const line = [t.eccentric, t.pauseBottom, t.concentric, t.pauseTop]
                  .filter((v) => v != null)
                  .join(' / ')
                return line ? (
                  <p key={i}>
                    Rep {i + 1} tempo: {line}
                  </p>
                ) : null
              })}
            </div>
          ) : (
            tempo && <p className="text-xs text-muted">Tempo (down / bottom / up / top): {tempo}</p>
          )}
          {ex.restAfterSetSeconds != null && (
            <p className="text-xs text-muted">Rest {ex.restAfterSetSeconds}s between sets</p>
          )}
          {ex.notes && <p className="text-sm">{ex.notes}</p>}
        </div>
        {actions}
      </div>
      {vid && (
        <iframe
          className="aspect-video w-full rounded-xl"
          src={`https://www.youtube.com/embed/${vid}`}
          title={ex.movementName}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
      {children}
    </Card>
  )
}
