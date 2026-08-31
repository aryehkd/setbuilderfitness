import type {
  Equipment,
  ExerciseCategory,
  Movement,
  MovementPrescriptionDefaults,
  PrescribedExercise,
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

export const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'other', label: 'Other' },
]

export function movementDefaults(movement: Movement) {
  const equipment = movement.defaultEquipment ?? movement.variants[0]?.equipment ?? null
  const variant =
    movement.variants.find((item) => item.equipment === equipment) ?? movement.variants[0]
  return {
    variantId: variant?.id ?? null,
    equipment,
    category: movement.defaultCategory ?? 'accessory',
  }
}

export function prescriptionDefaultsForMovement(
  movement: Movement,
): MovementPrescriptionDefaults {
  if (movement.savedDefaults) return movement.savedDefaults
  const defaults = movementDefaults(movement)
  return {
    variantId: defaults.variantId,
    equipment: defaults.equipment,
    setCount: 3,
    repsMin: 8,
    repsMax: null,
    perSetEnabled: false,
    setPrescriptions: [],
    method: 'straight',
    methodTarget: null,
    category: defaults.category,
    loadPrescription: null,
    tempo: {},
    tempoMode: 'default',
    tempoPerRep: [],
    restAfterSetSeconds: 90,
    restAfterExerciseSeconds: 90,
    notes: null,
    youtubeUrl: movement.youtubeUrl,
  }
}

export function movementDefaultsFromPrescription(
  exercise: PrescribedExercise,
): MovementPrescriptionDefaults {
  return {
    variantId: exercise.variantId ?? null,
    equipment: exercise.equipment ?? null,
    setCount: exercise.setCount,
    repsMin: exercise.repsMin,
    repsMax: exercise.repsMax ?? null,
    perSetEnabled: Boolean(exercise.perSetEnabled),
    setPrescriptions: exercise.setPrescriptions ?? [],
    method: exercise.method,
    methodTarget: exercise.methodTarget ?? null,
    category: exercise.category ?? 'accessory',
    loadPrescription: exercise.loadPrescription ?? null,
    tempo: exercise.tempo ?? {},
    tempoMode: exercise.tempoMode ?? 'default',
    tempoPerRep: exercise.tempoPerRep ?? [],
    restAfterSetSeconds: exercise.restAfterSetSeconds ?? null,
    restAfterExerciseSeconds: exercise.restAfterExerciseSeconds ?? null,
    notes: exercise.notes ?? null,
    youtubeUrl: exercise.youtubeUrl ?? null,
  }
}

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

export function quantityDefaultsForMethod(method: SetMethod) {
  if (method === 'timed') return { repsMin: 30, repsMax: null as number | null }
  if (method === 'reps_range') return { repsMin: 8, repsMax: 10 as number | null }
  return { repsMin: 8, repsMax: null as number | null }
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

type SupersetMember = { supersetGroup?: string | null; supersetOrder?: number | null }

/**
 * Renumbers one superset in list order, dissolving it when fewer than two
 * movements are left. Returns the original array when nothing changes so
 * callers can skip a save.
 */
export function resettleSuperset<T extends SupersetMember>(exercises: T[], group: string): T[] {
  const inGroup = (exercise: SupersetMember) => exercise.supersetGroup?.trim() === group
  const memberCount = exercises.filter(inGroup).length
  if (memberCount === 0) return exercises

  let order = 0
  const next = exercises.map((exercise) => {
    if (!inGroup(exercise)) return exercise
    if (memberCount < 2) return { ...exercise, supersetGroup: null, supersetOrder: null }
    order += 1
    return { ...exercise, supersetGroup: group, supersetOrder: order }
  })
  const changed = next.some((exercise, index) => {
    const current = exercises[index]!
    return (
      (current.supersetGroup ?? null) !== (exercise.supersetGroup ?? null) ||
      (current.supersetOrder ?? null) !== (exercise.supersetOrder ?? null)
    )
  })
  return changed ? next : exercises
}
