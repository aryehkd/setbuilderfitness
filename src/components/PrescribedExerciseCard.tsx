import type { ReactNode } from 'react'
import { Card } from './ui.tsx'
import type { PrescribedExercise, Tempo } from '../../shared/types.ts'

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
  const quantity =
    ex.perSetEnabled
      ? `${ex.setCount} sets`
      : ex.method === 'amrap' || ex.method === 'rpe' || ex.method === 'to_failure'
      ? `${ex.setCount} sets`
      : ex.method === 'rir'
        ? `${ex.setCount} × RIR ${ex.repsMin}`
        : ex.method === 'timed'
          ? `${ex.setCount} × ${ex.repsMin}s`
          : `${ex.setCount} × ${ex.repsMin}${ex.repsMax ? `–${ex.repsMax}` : ''}`
  const methodLabel = ex.method === 'reps_range' ? 'rep range' : ex.method.replace('_', ' ')
  return [ex.category?.replace('_', ' '), ex.equipment, quantity, methodLabel, ex.perSetEnabled ? null : ex.loadPrescription]
    .filter(Boolean)
    .join(' · ')
}

export function setTarget(ex: PrescribedExercise, setIndex: number) {
  const set = ex.setPrescriptions?.[setIndex]
  if (!set) return null
  const qty =
    ex.method === 'timed'
      ? `${set.repsMin}s`
      : ex.method === 'rir'
        ? `RIR ${set.repsMin}`
        : `${set.repsMin}${set.repsMax != null ? `–${set.repsMax}` : ''} reps`
  return [qty, set.loadPrescription].filter(Boolean).join(' · ')
}

export function formatTempo(tempo?: Tempo | null) {
  if (!tempo) return ''
  const phases: [number | null | undefined, string][] = [
    [tempo.eccentric, 'down'],
    [tempo.pauseBottom, 'pause bottom'],
    [tempo.concentric, 'up'],
    [tempo.pauseTop, 'pause top'],
  ]
  return phases
    .filter(([seconds]) => seconds != null && seconds > 0)
    .map(([seconds, label]) => `${seconds}s ${label}`)
    .join(', ')
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
  const tempo = formatTempo(ex.tempo)

  return (
    <Card className="space-y-3">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold">
            {ex.supersetGroup ? `${ex.supersetGroup}${ex.supersetOrder ?? ''} · ` : ''}
            {ex.movementName}
          </div>
          <p className="text-sm text-muted">{summary(ex)}</p>
          {ex.perSetEnabled && !children && (
            <div className="mt-1 space-y-0.5 text-xs text-muted">
              {Array.from({ length: ex.setCount }, (_, setIndex) => {
                const target = setTarget(ex, setIndex)
                return target ? (
                  <p key={setIndex}>
                    Set {setIndex + 1}: {target}
                  </p>
                ) : null
              })}
            </div>
          )}
          {ex.tempoMode === 'per_rep' && (ex.tempoPerRep?.length ?? 0) > 0 ? (
            <div className="mt-1 space-y-0.5 text-xs text-muted">
              {ex.tempoPerRep!.map((t, i) => {
                const line = formatTempo(t)
                return line ? (
                  <p key={i}>
                    Rep {i + 1} tempo: {line}
                  </p>
                ) : null
              })}
            </div>
          ) : (
            tempo && <p className="text-xs text-muted">Tempo: {tempo}</p>
          )}
          {ex.restAfterSetSeconds != null && (
            <p className="text-xs text-muted">Rest {ex.restAfterSetSeconds}s between sets</p>
          )}
          {ex.notes && <p className="text-sm">{ex.notes}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
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
