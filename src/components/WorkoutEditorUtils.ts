import type {
  Equipment,
  ExerciseCategory,
  Movement,
  MovementPrescriptionDefaults,
  PrescribedExercise,
  SetMethod,
  SetPrescription,
  TemplateExercise,
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
  { value: 'band', label: 'Band' },
  { value: 'box', label: 'Box' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'other', label: 'Other' },
]

/** Flattens a saved workout row into the shape the read-only client view renders. */
export function toPrescribedExercise(ex: TemplateExercise): PrescribedExercise {
  return {
    movementId: ex.movementId,
    movementName: ex.movementName ?? '',
    variantId: ex.variantId,
    equipment: ex.equipment,
    setCount: ex.setCount,
    repsMin: ex.repsMin,
    repsMax: ex.repsMax,
    perSetEnabled: ex.perSetEnabled,
    setPrescriptions: ex.setPrescriptions,
    method: ex.method,
    methodTarget: ex.methodTarget,
    category: ex.category,
    loadPrescription: ex.loadPrescription,
    tempo: {
      eccentric: ex.tempoEccentric,
      pauseBottom: ex.tempoPauseBottom,
      concentric: ex.tempoConcentric,
      pauseTop: ex.tempoPauseTop,
    },
    tempoMode: ex.tempoMode,
    tempoPerRep: ex.tempoPerRep,
    restAfterSetSeconds: ex.restAfterSetSeconds,
    restAfterExerciseSeconds: ex.restAfterExerciseSeconds,
    supersetGroup: ex.supersetGroup,
    supersetOrder: ex.supersetOrder,
    notes: ex.notes,
    youtubeUrl: ex.youtubeUrl,
  }
}

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

export function supersetGroupKey(exercise: SupersetMember) {
  const key = exercise.supersetGroup?.trim()
  return key || null
}

export function nextSupersetGroup(exercises: SupersetMember[]) {
  const used = new Set(
    exercises
      .map((exercise) => exercise.supersetGroup?.trim())
      .filter((key): key is string => Boolean(key)),
  )
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i)
    if (!used.has(letter)) return letter
  }
  let n = 2
  while (used.has(`A${n}`)) n += 1
  return `A${n}`
}

export function exerciseBlocks<T extends SupersetMember>(exercises: T[]): T[][] {
  const membersByGroup = new Map<string, T[]>()
  for (let index = 0; index < exercises.length; index++) {
    const exercise = exercises[index]!
    const key = supersetGroupKey(exercise)
    if (!key) continue
    const list = membersByGroup.get(key) ?? []
    list.push(exercise)
    membersByGroup.set(key, list)
  }
  for (const [key, members] of membersByGroup) {
    members.sort((a, b) => {
      const order = (a.supersetOrder ?? 0) - (b.supersetOrder ?? 0)
      if (order !== 0) return order
      return exercises.indexOf(a) - exercises.indexOf(b)
    })
    membersByGroup.set(key, members)
  }

  const seenGroups = new Set<string>()
  const blocks: T[][] = []
  for (const exercise of exercises) {
    const key = supersetGroupKey(exercise)
    if (!key) {
      blocks.push([exercise])
      continue
    }
    if (seenGroups.has(key)) continue
    seenGroups.add(key)
    blocks.push(membersByGroup.get(key) ?? [exercise])
  }
  return blocks
}

export type ExerciseDropTarget = { kind: 'line'; index: number } | { kind: 'row'; index: number }

export function normalizeSupersets<T extends SupersetMember>(exercises: T[]): T[] {
  const groupCounts = new Map<string, number>()
  for (const exercise of exercises) {
    const group = supersetGroupKey(exercise)
    if (group) groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1)
  }
  const groupOrders = new Map<string, number>()
  return exercises.map((exercise) => {
    const group = supersetGroupKey(exercise)
    if (!group || (groupCounts.get(group) ?? 0) < 2) {
      return { ...exercise, supersetGroup: null, supersetOrder: null }
    }
    const order = (groupOrders.get(group) ?? 0) + 1
    groupOrders.set(group, order)
    return { ...exercise, supersetGroup: group, supersetOrder: order }
  })
}

function moveExercisesToLine<T>(exercises: T[], movingIndexes: number[], lineIndex: number) {
  const movingSet = new Set(movingIndexes)
  const moving = movingIndexes
    .slice()
    .sort((a, b) => a - b)
    .map((index) => exercises[index]!)
  const removedBeforeLine = exercises
    .slice(0, lineIndex)
    .filter((_, index) => movingSet.has(index)).length
  const remaining = exercises.filter((_, index) => !movingSet.has(index))
  const insertionIndex = Math.max(0, Math.min(remaining.length, lineIndex - removedBeforeLine))
  remaining.splice(insertionIndex, 0, ...moving)
  return remaining
}

function moveExercisesAfter<T>(exercises: T[], movingIndexes: number[], targetIndex: number) {
  const movingSet = new Set(movingIndexes)
  const target = exercises[targetIndex]
  if (!target || movingSet.has(targetIndex)) return exercises
  const moving = movingIndexes
    .slice()
    .sort((a, b) => a - b)
    .map((index) => exercises[index]!)
  const remaining = exercises.filter((_, index) => !movingSet.has(index))
  const nextTargetIndex = remaining.indexOf(target)
  if (nextTargetIndex === -1) return exercises
  remaining.splice(nextTargetIndex + 1, 0, ...moving)
  return remaining
}

export function arrangeExerciseDrop<T extends SupersetMember>(
  exercises: T[],
  draggedIndex: number,
  target: ExerciseDropTarget,
  newGroup: string,
) {
  const dragged = exercises[draggedIndex]
  if (!dragged) return exercises
  if (target.kind === 'row' && target.index === draggedIndex) return exercises

  const arranged = exercises.map((exercise) => ({ ...exercise }))
  const sourceGroup = supersetGroupKey(arranged[draggedIndex]!)
  const sourceMembers = sourceGroup
    ? arranged
        .map((exercise, index) => ({ exercise, index }))
        .filter(({ exercise }) => supersetGroupKey(exercise) === sourceGroup)
    : [{ exercise: arranged[draggedIndex]!, index: draggedIndex }]
  const sourceIsFirst = Boolean(sourceGroup && sourceMembers[0]?.index === draggedIndex)
  let movingIndexes = sourceIsFirst ? sourceMembers.map(({ index }) => index) : [draggedIndex]

  if (target.kind === 'line') {
    const leftGroup = target.index > 0 ? supersetGroupKey(arranged[target.index - 1]!) : null
    const rightGroup =
      target.index < arranged.length ? supersetGroupKey(arranged[target.index]!) : null
    const targetGroup = leftGroup && leftGroup === rightGroup ? leftGroup : null

    if (targetGroup === sourceGroup) {
      movingIndexes = [draggedIndex]
    } else if (targetGroup) {
      const movingSet = new Set(movingIndexes)
      for (let index = 0; index < arranged.length; index++) {
        if (movingSet.has(index)) arranged[index] = { ...arranged[index]!, supersetGroup: targetGroup }
      }
    } else if (!sourceIsFirst) {
      arranged[draggedIndex] = {
        ...arranged[draggedIndex]!,
        supersetGroup: null,
        supersetOrder: null,
      }
    }

    return normalizeSupersets(moveExercisesToLine(arranged, movingIndexes, target.index))
  }

  const targetExercise = arranged[target.index]
  if (!targetExercise) return exercises
  const targetGroup = supersetGroupKey(targetExercise)

  if (targetGroup === sourceGroup && sourceGroup) {
    return normalizeSupersets(moveExercisesAfter(arranged, [draggedIndex], target.index))
  }

  const destinationGroup = targetGroup ?? newGroup
  const movingSet = new Set(movingIndexes)
  for (let index = 0; index < arranged.length; index++) {
    if (index === target.index || movingSet.has(index)) {
      arranged[index] = { ...arranged[index]!, supersetGroup: destinationGroup }
    }
  }
  return normalizeSupersets(moveExercisesAfter(arranged, movingIndexes, target.index))
}

export function moveExerciseBlock<T extends SupersetMember>(
  exercises: T[],
  blockIndex: number,
  direction: -1 | 1,
) {
  const blocks = exerciseBlocks(exercises)
  const target = blockIndex + direction
  if (target < 0 || target >= blocks.length) return exercises
  const nextBlocks = [...blocks]
  const [moving] = nextBlocks.splice(blockIndex, 1)
  if (!moving) return exercises
  nextBlocks.splice(target, 0, moving)
  return normalizeSupersets(nextBlocks.flat())
}

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

/**
 * Moves one superset member to `nextOrder` (1-based) and shifts the rest.
 * Changing C from 3 to 1 yields C=1, A=2, B=3. The group is kept together
 * in the list in that new order.
 */
export function placeInSupersetOrder<T extends SupersetMember>(
  exercises: T[],
  index: number,
  nextOrder: number,
): T[] {
  const current = exercises[index]
  const group = current?.supersetGroup?.trim()
  if (!current || !group) return exercises

  const members = exercises
    .map((exercise, memberIndex) => ({ exercise, memberIndex }))
    .filter(({ exercise }) => exercise.supersetGroup?.trim() === group)
    .sort(
      (a, b) =>
        (a.exercise.supersetOrder ?? 0) - (b.exercise.supersetOrder ?? 0) ||
        a.memberIndex - b.memberIndex,
    )

  const from = members.findIndex((member) => member.memberIndex === index)
  if (from < 0) return exercises
  const to = Math.min(Math.max(nextOrder, 1), members.length) - 1
  if (from === to) return exercises

  const reordered = members.map((member) => member.exercise)
  const [moved] = reordered.splice(from, 1)
  reordered.splice(to, 0, moved!)

  const memberIndexSet = new Set(members.map((member) => member.memberIndex))
  const next: T[] = []
  let inserted = false
  for (let i = 0; i < exercises.length; i++) {
    if (!memberIndexSet.has(i)) {
      next.push(exercises[i]!)
      continue
    }
    if (inserted) continue
    inserted = true
    reordered.forEach((exercise, position) => {
      next.push({ ...exercise, supersetGroup: group, supersetOrder: position + 1 })
    })
  }
  return next
}

export function supersetOrderOptions(groupSize: number, current: number | null) {
  const size = Math.max(groupSize, current ?? 1, 1)
  return Array.from({ length: size }, (_, index) => index + 1)
}
