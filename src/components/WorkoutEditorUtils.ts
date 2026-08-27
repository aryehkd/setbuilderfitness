import type {
  ExerciseCategory,
  SetMethod,
  SetPrescription,
  Tempo,
} from '../../shared/types.ts'

export const METHODS: { value: SetMethod; label: string }[] = [
  { value: 'straight', label: 'Straight reps' },
  { value: 'reps_range', label: 'Reps range' },
  { value: 'timed', label: 'Timed' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'rir', label: 'RIR' },
  { value: 'rpe', label: 'RPE' },
  { value: 'to_failure', label: 'To failure' },
]

export const CATEGORIES: { value: ExerciseCategory; label: string }[] = [
  { value: 'main_lift', label: 'Main lift' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'warmup', label: 'Warmup' },
  { value: 'finisher', label: 'Finisher' },
  { value: 'rehab', label: 'Rehab' },
  { value: 'plyo', label: 'Plyo' },
]

export function allowsPerRepTempo(method: SetMethod) {
  return method === 'straight' || method === 'reps_range'
}

export function showsRepsField(method: SetMethod) {
  return method !== 'amrap' && method !== 'rpe' && method !== 'to_failure'
}

export function quantityLabel(method: SetMethod) {
  if (method === 'rir') return 'RIR'
  if (method === 'timed') return 'Seconds'
  return 'Reps'
}

export function emptyTempo(): Tempo {
  return { eccentric: null, pauseBottom: null, concentric: null, pauseTop: null }
}

export function tempoRepCount(
  ex: { method: SetMethod; repsMin: number; repsMax?: number | null },
) {
  if (ex.method === 'reps_range') return Math.max(1, ex.repsMax ?? ex.repsMin ?? 1)
  return Math.max(1, ex.repsMin || 1)
}

export function resizeTempoPerRep(current: Tempo[] | undefined, count: number) {
  const next = (current ?? []).slice(0, count)
  while (next.length < count) next.push(emptyTempo())
  return next
}

export function fallbackSetPrescription(
  ex: { repsMin: number; repsMax?: number | null; loadPrescription?: string | null },
): SetPrescription {
  return {
    repsMin: ex.repsMin,
    repsMax: ex.repsMax,
    loadPrescription: ex.loadPrescription,
  }
}

export function resizeSetPrescriptions(
  current: SetPrescription[] | undefined,
  count: number,
  fallback: SetPrescription,
) {
  const safeCount = Math.max(0, count)
  const next = (current ?? []).slice(0, safeCount)
  while (next.length < safeCount) next.push({ ...fallback })
  return next
}
