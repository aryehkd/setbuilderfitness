import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  ConfirmButton,
  Field,
  NumericTextInput,
  Select,
  TextArea,
  TextInput,
} from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { materializeMovement, replaceCatalogMovement } from '../lib/movements.ts'
import type {
  Equipment,
  ExerciseCategory,
  Movement,
  MovementPrescriptionDefaults,
  TrainerClient,
  SetMethod,
  Tempo,
  TempoMode,
  PrescribedExercise,
  SetPrescription,
  TemplateExercise,
  WorkoutTemplate,
} from '../../shared/types.ts'
import { warmupToText } from '../../shared/types.ts'
import { AddMovementSlot } from '../components/AddMovementSlot.tsx'
import { AssignWorkoutToDate } from '../components/AssignWorkoutToDate.tsx'
import { VersionHistory } from '../components/VersionHistory.tsx'
import {
  ClientHistorySelector,
  historyContextName,
  MovementHistoryContext,
  useSelfClientId,
} from '../components/MovementHistoryContext.tsx'
import { useMovementHistoryContext } from '../hooks/useMovementHistoryContext.ts'
import {
  PrescribedExerciseCard,
  RestAfterMovement,
  SupersetFrame,
  groupBySuperset,
  setTarget,
} from '../components/PrescribedExerciseCard.tsx'
import {
  ModeToggle,
  SaveDefaultButton,
  TempoFields,
  Toggle,
  InfoTip,
  clearCompletedDefaultSaves,
  type SaveDefaultStatus,
} from '../components/WorkoutEditorControls.tsx'
import {
  CATEGORIES,
  EQUIPMENT,
  METHODS,
  allowsPerRepTempo,
  fallbackSetPrescription,
  quantityLabel,
  quantityDefaultsForMethod,
  prescriptionDefaultsForMovement,
  resettleSuperset,
  resizeSetPrescriptions,
  resizeTempoPerRep,
  showsRepsField,
  tempoRepCount,
  placeInSupersetOrder,
  supersetOrderOptions,
} from '../components/WorkoutEditorUtils.ts'

function emptyExercise(movement: Movement): Partial<TemplateExercise> {
  const defaults = prescriptionDefaultsForMovement(movement)
  return {
    movementId: movement.id,
    movementName: movement.name,
    variantId: defaults.variantId,
    equipment: defaults.equipment,
    setCount: defaults.setCount,
    repsMin: defaults.repsMin,
    repsMax: defaults.repsMax ?? null,
    perSetEnabled: Boolean(defaults.perSetEnabled),
    setPrescriptions: defaults.setPrescriptions ?? [],
    method: defaults.method,
    methodTarget: defaults.methodTarget ?? null,
    category: defaults.category,
    loadPrescription: defaults.loadPrescription ?? null,
    tempoEccentric: defaults.tempo?.eccentric ?? null,
    tempoPauseBottom: defaults.tempo?.pauseBottom ?? null,
    tempoConcentric: defaults.tempo?.concentric ?? null,
    tempoPauseTop: defaults.tempo?.pauseTop ?? null,
    tempoMode: defaults.tempoMode ?? 'default',
    tempoPerRep: defaults.tempoPerRep ?? [],
    supersetGroup: null,
    supersetOrder: null,
    restAfterSetSeconds: defaults.restAfterSetSeconds ?? null,
    restAfterExerciseSeconds: defaults.restAfterExerciseSeconds ?? null,
    notes: defaults.notes ?? null,
    youtubeUrl: defaults.youtubeUrl ?? null,
  }
}

function defaultsFromTemplateExercise(exercise: TemplateExercise): MovementPrescriptionDefaults {
  return {
    variantId: exercise.variantId,
    equipment: exercise.equipment,
    setCount: exercise.setCount,
    repsMin: exercise.repsMin,
    repsMax: exercise.repsMax,
    perSetEnabled: exercise.perSetEnabled,
    setPrescriptions: exercise.setPrescriptions,
    method: exercise.method,
    methodTarget: exercise.methodTarget,
    category: exercise.category,
    loadPrescription: exercise.loadPrescription,
    tempo: {
      eccentric: exercise.tempoEccentric,
      pauseBottom: exercise.tempoPauseBottom,
      concentric: exercise.tempoConcentric,
      pauseTop: exercise.tempoPauseTop,
    },
    tempoMode: exercise.tempoMode,
    tempoPerRep: exercise.tempoPerRep,
    restAfterSetSeconds: exercise.restAfterSetSeconds,
    restAfterExerciseSeconds: exercise.restAfterExerciseSeconds,
    notes: exercise.notes,
    youtubeUrl: exercise.youtubeUrl,
  }
}

function supersetGroupKey(ex: TemplateExercise) {
  const key = ex.supersetGroup?.trim()
  return key || null
}

function nextSupersetGroup(exercises: TemplateExercise[]) {
  const used = new Set(
    exercises
      .map((ex) => ex.supersetGroup?.trim())
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

function exerciseBlocks(exercises: TemplateExercise[]): TemplateExercise[][] {
  const indexById = new Map(exercises.map((ex, i) => [ex.id, i]))
  const membersByGroup = new Map<string, TemplateExercise[]>()
  for (const ex of exercises) {
    const key = supersetGroupKey(ex)
    if (!key) continue
    const list = membersByGroup.get(key) ?? []
    list.push(ex)
    membersByGroup.set(key, list)
  }
  for (const [key, members] of membersByGroup) {
    members.sort((a, b) => {
      const order = (a.supersetOrder ?? 0) - (b.supersetOrder ?? 0)
      if (order !== 0) return order
      return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0)
    })
    membersByGroup.set(key, members)
  }

  const seenGroups = new Set<string>()
  const blocks: TemplateExercise[][] = []
  for (const ex of exercises) {
    const key = supersetGroupKey(ex)
    if (!key) {
      blocks.push([ex])
      continue
    }
    if (seenGroups.has(key)) continue
    seenGroups.add(key)
    blocks.push(membersByGroup.get(key) ?? [ex])
  }
  return blocks
}

function toPrescribed(ex: TemplateExercise): PrescribedExercise {
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

type InsertSlot = { key: string; flatIndex: number; group: string | null }
type EditorView = 'compact' | 'edit' | 'preview'
type ExerciseDropTarget =
  | { kind: 'line'; index: number }
  | { kind: 'row'; exerciseId: string }

function normalizeSupersets(exercises: TemplateExercise[]) {
  const groupCounts = new Map<string, number>()
  for (const exercise of exercises) {
    const group = supersetGroupKey(exercise)
    if (group) groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1)
  }

  const groupOrders = new Map<string, number>()
  return exercises.map((exercise, sortOrder) => {
    const group = supersetGroupKey(exercise)
    if (!group || (groupCounts.get(group) ?? 0) < 2) {
      return { ...exercise, sortOrder, supersetGroup: null, supersetOrder: null }
    }
    const order = (groupOrders.get(group) ?? 0) + 1
    groupOrders.set(group, order)
    return { ...exercise, sortOrder, supersetGroup: group, supersetOrder: order }
  })
}

function moveExercisesToLine(
  exercises: TemplateExercise[],
  movingIds: string[],
  lineIndex: number,
) {
  const movingSet = new Set(movingIds)
  const moving = movingIds
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is TemplateExercise => Boolean(exercise))
  const removedBeforeLine = exercises
    .slice(0, lineIndex)
    .filter((exercise) => movingSet.has(exercise.id)).length
  const remaining = exercises.filter((exercise) => !movingSet.has(exercise.id))
  const insertionIndex = Math.max(
    0,
    Math.min(remaining.length, lineIndex - removedBeforeLine),
  )
  remaining.splice(insertionIndex, 0, ...moving)
  return remaining
}

function moveExercisesAfter(
  exercises: TemplateExercise[],
  movingIds: string[],
  targetId: string,
) {
  const movingSet = new Set(movingIds)
  const moving = movingIds
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is TemplateExercise => Boolean(exercise))
  const remaining = exercises.filter((exercise) => !movingSet.has(exercise.id))
  const targetIndex = remaining.findIndex((exercise) => exercise.id === targetId)
  if (targetIndex === -1) return exercises
  remaining.splice(targetIndex + 1, 0, ...moving)
  return remaining
}

function arrangeExerciseDrop(
  exercises: TemplateExercise[],
  draggedId: string,
  target: ExerciseDropTarget,
  newGroup: string,
) {
  const dragged = exercises.find((exercise) => exercise.id === draggedId)
  if (!dragged) return exercises
  if (target.kind === 'row' && target.exerciseId === draggedId) return exercises

  const sourceGroup = supersetGroupKey(dragged)
  const sourceMembers = sourceGroup
    ? exercises.filter((exercise) => supersetGroupKey(exercise) === sourceGroup)
    : [dragged]
  const sourceIsFirst = Boolean(sourceGroup && sourceMembers[0]?.id === draggedId)

  let moving = sourceIsFirst ? sourceMembers : [dragged]
  let arranged = exercises.map((exercise) => ({ ...exercise }))

  if (target.kind === 'line') {
    const leftGroup =
      target.index > 0 ? supersetGroupKey(exercises[target.index - 1]!) : null
    const rightGroup =
      target.index < exercises.length ? supersetGroupKey(exercises[target.index]!) : null
    const targetGroup = leftGroup && leftGroup === rightGroup ? leftGroup : null

    if (targetGroup === sourceGroup) {
      moving = [dragged]
    } else if (targetGroup) {
      const movingIds = new Set(moving.map((exercise) => exercise.id))
      arranged = arranged.map((exercise) =>
        movingIds.has(exercise.id) ? { ...exercise, supersetGroup: targetGroup } : exercise,
      )
    } else if (!sourceIsFirst) {
      arranged = arranged.map((exercise) =>
        exercise.id === draggedId
          ? { ...exercise, supersetGroup: null, supersetOrder: null }
          : exercise,
      )
    }

    arranged = moveExercisesToLine(
      arranged,
      moving.map((exercise) => exercise.id),
      target.index,
    )
    return normalizeSupersets(arranged)
  }

  const targetExercise = exercises.find((exercise) => exercise.id === target.exerciseId)
  if (!targetExercise) return exercises
  const targetGroup = supersetGroupKey(targetExercise)

  if (targetGroup === sourceGroup && sourceGroup) {
    moving = [dragged]
    arranged = moveExercisesAfter(arranged, [draggedId], target.exerciseId)
    return normalizeSupersets(arranged)
  }

  const destinationGroup = targetGroup ?? newGroup
  const movingIds = new Set(moving.map((exercise) => exercise.id))
  arranged = arranged.map((exercise) => {
    if (exercise.id === target.exerciseId || movingIds.has(exercise.id)) {
      return { ...exercise, supersetGroup: destinationGroup }
    }
    return exercise
  })
  arranged = moveExercisesAfter(
    arranged,
    moving.map((exercise) => exercise.id),
    target.exerciseId,
  )
  return normalizeSupersets(arranged)
}

function formatTempoPart(value: number | null | undefined) {
  return value == null ? '–' : String(value)
}

function defaultTempoParts(ex: TemplateExercise) {
  return [ex.tempoEccentric, ex.tempoPauseBottom, ex.tempoConcentric, ex.tempoPauseTop]
}

function hasConfiguredTempo(ex: TemplateExercise) {
  if (ex.tempoMode === 'per_rep') return true
  return defaultTempoParts(ex).some((part) => part != null)
}

function tempoSummary(ex: TemplateExercise) {
  if (ex.tempoMode === 'per_rep') return 'Per rep'
  const parts = defaultTempoParts(ex)
  if (parts.every((part) => part == null)) return 'Default'
  return parts.map(formatTempoPart).join('-')
}

function repsSummary(ex: TemplateExercise) {
  if (!showsRepsField(ex.method)) {
    return METHODS.find((method) => method.value === ex.method)?.label ?? ex.method
  }
  if (ex.perSetEnabled) {
    const sets = resizeSetPrescriptions(
      ex.setPrescriptions,
      ex.setCount,
      fallbackSetPrescription(ex),
    )
    const targets = sets.map((set) =>
      set.repsMax != null && set.repsMax !== set.repsMin
        ? `${set.repsMin}-${set.repsMax}`
        : String(set.repsMin),
    )
    return new Set(targets).size === 1
      ? `${ex.setCount} × ${targets[0] ?? '–'}`
      : `${ex.setCount} custom sets`
  }
  const reps =
    ex.repsMax != null && ex.repsMax !== ex.repsMin
      ? `${ex.repsMin}-${ex.repsMax}`
      : String(ex.repsMin)
  return `${ex.setCount} × ${reps}`
}

function loadSummary(ex: TemplateExercise) {
  if (!ex.perSetEnabled) return ex.loadPrescription ?? ''
  const loads = resizeSetPrescriptions(
    ex.setPrescriptions,
    ex.setCount,
    fallbackSetPrescription(ex),
  )
    .map((set) => set.loadPrescription?.trim())
    .filter((load): load is string => Boolean(load))
  if (loads.length === 0) return ''
  if (new Set(loads).size === 1) return loads[0]!
  return 'Custom sets'
}

function BlockDragHelp() {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)

  const show = (event: { currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setAnchor({ left: rect.left, top: rect.bottom + 8 })
  }

  return (
    <span className="inline-flex">
      <button
        type="button"
        aria-label="How dragging blocks works"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted hover:border-muted hover:text-white"
        onMouseEnter={show}
        onMouseLeave={() => setAnchor(null)}
        onFocus={show}
        onBlur={() => setAnchor(null)}
      >
        i
      </button>
      {anchor ? (
        <span
          role="tooltip"
          style={{ left: anchor.left, top: anchor.top }}
          className="pointer-events-none fixed z-30 w-72 rounded-xl border border-line bg-ink p-3 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted shadow-lg"
        >
          Drag a movement by its handle, then drop it on:
          <span className="mt-2 block">
            <span className="block">
              <strong className="text-white">A line</strong> to move it there. Dragging a
              superset&rsquo;s first movement moves the whole group.
            </span>
            <span className="mt-1 block">
              <strong className="text-white">Another movement</strong> to superset them; the
              highlighted letter previews the result.
            </span>
            <span className="mt-1 block">
              Leaving a superset drops the movement out of it, and a group left with one
              movement becomes a single again.
            </span>
          </span>
        </span>
      ) : null}
    </span>
  )
}

export function TemplateEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [clients, setClients] = useState<TrainerClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [assignClientId, setAssignClientId] = useState('')
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [requestedView, setView] = useState<EditorView>('edit')
  const [tableAllowed, setTableAllowed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<ExerciseDropTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [defaultSaveStatus, setDefaultSaveStatus] = useState<Record<string, SaveDefaultStatus>>(
    {},
  )

  const noteWorkoutEdited = () => {
    setDefaultSaveStatus(clearCompletedDefaultSaves)
  }

  const load = async () => {
    if (!id) return
    const data = await api<WorkoutTemplate>(`/api/templates/${id}`)
    setTemplate(data)
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    void api<Movement[]>('/api/movements?q=').then(setMovements)
    void api<TrainerClient[]>('/api/clients').then(setClients)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setTableAllowed(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const view: EditorView =
    requestedView === 'compact' && !tableAllowed ? 'edit' : requestedView

  // Table and client view each start wherever they land; only the edit view
  // returns the trainer to where they left off.
  const editScrollY = useRef(0)
  const restoreEditScroll = useRef(false)

  const changeView = (next: EditorView) => {
    if (next === view) return
    if (view === 'edit') editScrollY.current = window.scrollY
    if (next === 'edit') restoreEditScroll.current = true
    setView(next)
  }

  useLayoutEffect(() => {
    if (view !== 'edit' || !restoreEditScroll.current) return
    restoreEditScroll.current = false
    window.scrollTo(0, editScrollY.current)
  }, [view])

  const exercises = useMemo(() => template?.exercises ?? [], [template])
  const selfClientId = useSelfClientId()
  const selectedClientName = historyContextName(clients, selectedClientId, selfClientId)
  const movementHistory = useMovementHistoryContext(
    selectedClientId,
    exercises.map((exercise) => exercise.movementId),
  )
  const blocks = useMemo(() => exerciseBlocks(exercises), [exercises])
  const visibleExercises = useMemo(() => blocks.flat(), [blocks])
  const nextGroup = useMemo(() => nextSupersetGroup(exercises), [exercises])
  const existingGroups = useMemo(() => {
    const list: string[] = []
    for (const block of blocks) {
      const key = supersetGroupKey(block[0]!)
      if (key && !list.includes(key)) list.push(key)
    }
    return list
  }, [blocks])

  const saveMeta = async (patch: Partial<WorkoutTemplate>) => {
    if (!id || !template) return
    setSaving(true)
    const updated = await api<WorkoutTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: patch.name ?? template.name,
        notes: patch.notes ?? template.notes,
        warmup: patch.warmup ?? template.warmup,
      }),
    })
    setTemplate(updated)
    setSaving(false)
  }

  const removeTemplate = async () => {
    if (!id) return
    await api(`/api/templates/${id}`, { method: 'DELETE' })
    navigate('/workouts')
  }

  const assignSuperset = async (exerciseId: string, group: string | null) => {
    if (!id || !template) return
    const current = exercises.find((item) => item.id === exerciseId)
    if (!current) return
    const oldGroup = supersetGroupKey(current)
    if (oldGroup === group) return

    noteWorkoutEdited()
    setSaving(true)
    try {
      const members = exerciseBlocks(exercises)
        .flat()
        .filter((item) => item.id !== exerciseId && supersetGroupKey(item) === group)
      const order = group ? members.length + 1 : null
      await api(`/api/templates/${id}/exercises/${exerciseId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...current,
          supersetGroup: group,
          supersetOrder: order,
        }),
      })

      const ids = exercises.map((item) => item.id).filter((itemId) => itemId !== exerciseId)
      if (group && members.length > 0) {
        const last = members[members.length - 1]!
        ids.splice(ids.indexOf(last.id) + 1, 0, exerciseId)
      } else {
        ids.splice(
          exercises.findIndex((item) => item.id === exerciseId),
          0,
          exerciseId,
        )
      }

      let updated = await api<WorkoutTemplate>(`/api/templates/${id}/exercises/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ exerciseIds: ids }),
      })
      if (group) updated = await renumberSuperset(updated, group)
      if (oldGroup && oldGroup !== group) updated = await renumberSuperset(updated, oldGroup)
      setTemplate(updated)
    } finally {
      setSaving(false)
    }
  }

  const renumberSuperset = async (tpl: WorkoutTemplate, group: string) => {
    const members = (tpl.exercises ?? []).filter((ex) => supersetGroupKey(ex) === group)
    let changed = false
    for (let i = 0; i < members.length; i++) {
      const member = members[i]!
      if (member.supersetOrder === i + 1) continue
      changed = true
      await api(`/api/templates/${id}/exercises/${member.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...member, supersetOrder: i + 1 }),
      })
    }
    if (!changed) return tpl
    return api<WorkoutTemplate>(`/api/templates/${id}`)
  }

  const addExerciseAt = async (movement: Movement, slot: InsertSlot) => {
    if (!id) return
    noteWorkoutEdited()
    setSaving(true)
    try {
      const selectedMovement = await materializeMovement(movement)
      if (selectedMovement.id !== movement.id) {
        setMovements((current) =>
          current.map((item) => (item.id === movement.id ? selectedMovement : item)),
        )
      }
      const created = await api<TemplateExercise>(`/api/templates/${id}/exercises`, {
        method: 'POST',
        body: JSON.stringify({
          ...emptyExercise(selectedMovement),
          supersetGroup: slot.group,
          supersetOrder: slot.group ? 1 : null,
        }),
      })
      const exerciseIds = exercises.map((ex) => ex.id)
      exerciseIds.splice(slot.flatIndex, 0, created.id)
      let updated = await api<WorkoutTemplate>(`/api/templates/${id}/exercises/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ exerciseIds }),
      })
      if (slot.group) updated = await renumberSuperset(updated, slot.group)
      setTemplate(updated)
      setOpenSlot(null)
    } finally {
      setSaving(false)
    }
  }

  const createAndAdd = async (
    name: string,
    category: ExerciseCategory,
    equipment: Equipment,
    slot: InsertSlot,
  ) => {
    const movement = await api<Movement>('/api/movements', {
      method: 'POST',
      body: JSON.stringify({ name, category, equipment }),
    })
    setMovements((prev) => {
      if (prev.some((item) => item.id === movement.id)) return prev
      return [...prev, movement].sort((a, b) => a.name.localeCompare(b.name))
    })
    await addExerciseAt(movement, slot)
  }

  const saveExercise = async (ex: TemplateExercise) => {
    if (!id) return
    await api(`/api/templates/${id}/exercises/${ex.id}`, {
      method: 'PUT',
      body: JSON.stringify(ex),
    })
    await load()
  }

  const saveMovementDefault = async (ex: TemplateExercise) => {
    setDefaultSaveStatus((current) => ({ ...current, [ex.id]: 'saving' }))
    try {
      const claimed = await api<Movement>(
        `/api/movements/${ex.movementId}/defaults`,
        {
          method: 'PUT',
          body: JSON.stringify(defaultsFromTemplateExercise(ex)),
        },
      )
      setMovements((current) =>
        replaceCatalogMovement(current, { id: ex.movementId, sourceExerciseId: claimed.sourceExerciseId }, claimed),
      )
      if (
        claimed.id !== ex.movementId ||
        (claimed.savedDefaults?.variantId && claimed.savedDefaults.variantId !== ex.variantId)
      ) {
        await saveExercise({
          ...ex,
          movementId: claimed.id,
          variantId: claimed.savedDefaults?.variantId ?? ex.variantId,
        })
      }
      setDefaultSaveStatus((current) => ({ ...current, [ex.id]: 'saved' }))
    } catch {
      setDefaultSaveStatus((current) => {
        const next = { ...current }
        delete next[ex.id]
        return next
      })
    }
  }

  const patchExercise = (exerciseId: string, patch: Partial<TemplateExercise>, persist = false) => {
    if (!template) return
    noteWorkoutEdited()
    const nextExercises = (template.exercises ?? []).map((item) =>
      item.id === exerciseId ? { ...item, ...patch } : item,
    )
    setTemplate({ ...template, exercises: nextExercises })
    if (persist) {
      const next = nextExercises.find((item) => item.id === exerciseId)
      if (next) void saveExercise(next)
    }
  }

  const removeExercise = async (exerciseId: string) => {
    if (!id) return
    const removed = exercises.find((exercise) => exercise.id === exerciseId)
    if (!removed) return
    noteWorkoutEdited()
    const removedGroup = supersetGroupKey(removed)
    setSaving(true)
    try {
      await api(`/api/templates/${id}/exercises/${exerciseId}`, { method: 'DELETE' })
      const data = await api<WorkoutTemplate>(`/api/templates/${id}`)
      const remaining = exerciseBlocks(data.exercises ?? []).flat()
      const resettled = removedGroup ? resettleSuperset(remaining, removedGroup) : remaining
      if (resettled === remaining) {
        setTemplate(data)
        return
      }
      setTemplate(
        await api<WorkoutTemplate>(`/api/templates/${id}/exercises/reorder`, {
          method: 'PUT',
          body: JSON.stringify({
            exerciseIds: resettled.map((exercise) => exercise.id),
            supersetAssignments: resettled.map((exercise) => ({
              exerciseId: exercise.id,
              group: exercise.supersetGroup,
              order: exercise.supersetOrder,
            })),
          }),
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  const moveBlockTo = async (blockIndex: number, target: number) => {
    if (!id || !template) return
    if (target < 0 || target >= blocks.length || target === blockIndex) return
    noteWorkoutEdited()
    const nextBlocks = [...blocks]
    const [moving] = nextBlocks.splice(blockIndex, 1)
    if (!moving) return
    nextBlocks.splice(target, 0, moving)
    const exerciseIds = nextBlocks.flat().map((ex) => ex.id)
    setSaving(true)
    try {
      const updated = await api<WorkoutTemplate>(`/api/templates/${id}/exercises/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ exerciseIds }),
      })
      setTemplate(updated)
    } finally {
      setSaving(false)
    }
  }

  const moveBlock = (blockIndex: number, direction: -1 | 1) =>
    moveBlockTo(blockIndex, blockIndex + direction)

  const saveExerciseArrangement = async (nextExercises: TemplateExercise[]) => {
    if (!id || !template) return
    const unchanged = nextExercises.every((exercise, index) => {
      const current = visibleExercises[index]
      return (
        current?.id === exercise.id &&
        supersetGroupKey(current) === supersetGroupKey(exercise) &&
        current.supersetOrder === exercise.supersetOrder
      )
    })
    if (unchanged) return

    noteWorkoutEdited()
    setSaving(true)
    try {
      const updated = await api<WorkoutTemplate>(`/api/templates/${id}/exercises/reorder`, {
        method: 'PUT',
        body: JSON.stringify({
          exerciseIds: nextExercises.map((exercise) => exercise.id),
          supersetAssignments: nextExercises.map((exercise) => ({
            exerciseId: exercise.id,
            group: exercise.supersetGroup,
            order: exercise.supersetOrder,
          })),
        }),
      })
      setTemplate(updated)
    } finally {
      setSaving(false)
    }
  }

  const finishExerciseDrop = (target: ExerciseDropTarget) => {
    if (!draggedExerciseId) return
    const nextExercises = arrangeExerciseDrop(
      visibleExercises,
      draggedExerciseId,
      target,
      nextGroup,
    )
    void saveExerciseArrangement(nextExercises)
    setDraggedExerciseId(null)
    setDropTarget(null)
  }

  const changeSupersetOrder = (exerciseId: string, order: number) => {
    const index = visibleExercises.findIndex((item) => item.id === exerciseId)
    if (index < 0) return
    const nextExercises = placeInSupersetOrder(visibleExercises, index, order)
    setTemplate((current) =>
      current ? { ...current, exercises: nextExercises } : current,
    )
    void saveExerciseArrangement(nextExercises)
  }

  const renderSlot = (slot: InsertSlot, label: string) => (
    <AddMovementSlot
      key={slot.key}
      label={label}
      movements={movements}
      open={openSlot === slot.key}
      onOpen={() => setOpenSlot(slot.key)}
      onCancel={() => setOpenSlot(null)}
      onSelect={(movement) => void addExerciseAt(movement, slot)}
      onCreate={(name, category, equipment) =>
        void createAndAdd(name, category, equipment, slot)
      }
    />
  )

  if (!template) return <p className="p-6 text-muted">Loading workout…</p>

  const warmup = warmupToText(template.warmup)
  const assignBlock = (
    <AssignWorkoutToDate
      clients={clients}
      clientId={assignClientId}
      onClientIdChange={setAssignClientId}
      templateId={template.id}
    />
  )
  const clientHistoryControls = (
    <Card className="space-y-2">
      <ClientHistorySelector
        clients={clients}
        value={selectedClientId}
        onChange={setSelectedClientId}
      />
      <p className="text-xs text-muted">
        This selection only adds coaching context. It does not assign the workout.
      </p>
    </Card>
  )
  const historyContextFor = (exercise: TemplateExercise) => (
    <MovementHistoryContext
      movementName={exercise.movementName || 'movement'}
      clientName={selectedClientName}
      entries={movementHistory.history[exercise.movementId]}
      loading={movementHistory.loading}
      error={movementHistory.error}
    />
  )

  const header = (
    <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:px-6">
      {view === 'preview' ? (
        <h1 className="min-w-0 flex-1 font-display text-2xl font-bold">{template.name}</h1>
      ) : (
        <TextInput
          value={template.name}
          onChange={(e) => {
            noteWorkoutEdited()
            setTemplate({ ...template, name: e.target.value })
          }}
          onBlur={() => void saveMeta({ name: template.name })}
          className="min-w-0 flex-1 font-display text-2xl font-bold"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:shrink-0 sm:justify-start">
        <ModeToggle
          value={view}
          options={[
            { value: 'edit' as const, label: 'Build' },
            ...(tableAllowed ? [{ value: 'compact' as const, label: 'Table' }] : []),
            { value: 'preview' as const, label: 'Client view' },
          ]}
          onChange={changeView}
        />
        <span className="text-xs text-muted">{saving ? 'Saving…' : 'Saved'}</span>
        <ConfirmButton
          className="w-full sm:w-auto"
          confirmLabel="Confirm delete"
          onConfirm={() => void removeTemplate()}
        >
          Delete
        </ConfirmButton>
      </div>
    </div>
  )

  if (view === 'preview') {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        {header}
        <p className="text-sm text-muted">
          This is how the workout looks to a client. Logging is disabled in the preview.
        </p>

        {warmup ? (
          <Card>
            <h2 className="mb-2 font-semibold">Warmup</h2>
            <p className="whitespace-pre-wrap text-sm">{warmup}</p>
          </Card>
        ) : null}

        {exercises.length === 0 ? (
          <p className="text-muted">No movements yet.</p>
        ) : (
          groupBySuperset(exercises).map((block) => {
            const cards = block.items.map(({ exercise: ex }) => (
              <Fragment key={ex.id}>
                <PrescribedExerciseCard exercise={toPrescribed(ex)}>
                  <div className="space-y-2">
                    {Array.from({ length: Math.max(0, ex.setCount) }, (_, setIndex) => {
                      const target = ex.perSetEnabled ? setTarget(toPrescribed(ex), setIndex) : null
                      return (
                        <div key={setIndex} className="space-y-1">
                          {target ? (
                            <p className="text-xs text-muted">
                              Set {setIndex + 1}: {target}
                            </p>
                          ) : null}
                          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 opacity-60 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
                            <span className="text-xs text-muted">Set {setIndex + 1}</span>
                            <TextInput placeholder="Weight" disabled value="" readOnly />
                            <TextInput
                              className="col-start-2 sm:col-start-auto"
                              placeholder={
                                ex.perSetEnabled
                                  ? (setTarget(toPrescribed(ex), setIndex) ??
                                    (ex.method === 'timed' ? 'Seconds' : 'Reps'))
                                  : ex.method === 'timed'
                                    ? 'Seconds'
                                    : 'Reps'
                              }
                              disabled
                              value=""
                              readOnly
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </PrescribedExerciseCard>
                <RestAfterMovement seconds={ex.restAfterExerciseSeconds} />
              </Fragment>
            ))
            if (!block.group) {
              return <Fragment key={block.items[0]!.exercise.id}>{cards}</Fragment>
            }
            return (
              <SupersetFrame key={`superset-${block.group}`} group={block.group}>
                {cards}
              </SupersetFrame>
            )
          })
        )}
      {assignBlock}
      <VersionHistory events={template.versionHistory} />
      </div>
    )
  }

  if (view === 'compact') {
    const previewExercises =
      draggedExerciseId && dropTarget?.kind === 'row'
        ? arrangeExerciseDrop(visibleExercises, draggedExerciseId, dropTarget, nextGroup)
        : null
    const previewById = new Map(previewExercises?.map((exercise) => [exercise.id, exercise]))
    const previewTarget =
      dropTarget?.kind === 'row' ? previewById.get(dropTarget.exerciseId) : null
    const previewGroup = previewTarget ? supersetGroupKey(previewTarget) : null

    const renderDropLine = (index: number) => {
      const active = dropTarget?.kind === 'line' && dropTarget.index === index
      return (
        <tr key={`drop-line-${index}`} className="h-2">
          <td
            colSpan={8}
            className="p-0"
            onDragOver={(event) => {
              if (!draggedExerciseId) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropTarget({ kind: 'line', index })
            }}
            onDrop={(event) => {
              event.preventDefault()
              finishExerciseDrop({ kind: 'line', index })
            }}
          >
            <div className="flex h-2 items-center px-2">
              <div
                className={`w-full transition-colors ${
                  active ? 'h-0.5 bg-lime' : 'h-px bg-line'
                }`}
              />
            </div>
          </td>
        </tr>
      )
    }

    return (
      <div className="mx-auto max-w-[90rem] space-y-5 py-6">
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6">
          {header}

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Workout / Warmup Notes</h2>
              <span className="text-xs text-muted">Workout-level notes</span>
            </div>
            <TextArea
              rows={3}
              value={warmup}
              onChange={(e) => {
                noteWorkoutEdited()
                setTemplate({ ...template, warmup: e.target.value })
              }}
              onBlur={() => void saveMeta({ warmup })}
            />
          </Card>
        </div>

        <div className="mx-4 overflow-hidden rounded-2xl border border-line bg-panel sm:mx-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
              <thead className="bg-ink text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="relative w-28 px-3 py-3 font-medium">
                    <span className="flex items-center gap-1.5">
                      Block
                      <BlockDragHelp />
                    </span>
                  </th>
                  <th className="min-w-56 px-3 py-3 font-medium">Movement</th>
                  <th className="w-36 px-3 py-3 font-medium">Summary</th>
                  <th className="w-72 px-3 py-3 font-medium">Load</th>
                  <th className="w-32 px-3 py-3 font-medium">Tempo</th>
                  <th className="w-28 px-3 py-3 font-medium">Rest (s)</th>
                  <th className="min-w-56 px-3 py-3 font-medium">Notes</th>
                  <th className="w-24 px-3 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((block, blockIndex) => {
                  const group = supersetGroupKey(block[0]!)
                  const blockStart = blocks
                    .slice(0, blockIndex)
                    .reduce((sum, item) => sum + item.length, 0)

                  return block.map((ex, offset) => {
                    const expanded = expandedExerciseId === ex.id
                    const category =
                      CATEGORIES.find((item) => item.value === ex.category)?.label ?? 'Accessory'
                    const rowTargeted =
                      dropTarget?.kind === 'row' && dropTarget.exerciseId === ex.id
                    const previewExercise = previewById.get(ex.id)
                    const previewed =
                      Boolean(previewGroup) &&
                      supersetGroupKey(previewExercise ?? ex) === previewGroup
                    const displayGroup = previewed
                      ? supersetGroupKey(previewExercise!)
                      : group
                    const displayOrder = previewed
                      ? previewExercise!.supersetOrder
                      : ex.supersetOrder
                    return (
                      <Fragment key={ex.id}>
                        {renderDropLine(blockStart + offset)}
                        <tr
                          className={`align-middle hover:bg-ink/40 ${
                            rowTargeted ? 'bg-lime/5 outline outline-1 -outline-offset-1 outline-lime' : ''
                          } ${draggedExerciseId === ex.id ? 'opacity-50' : ''}`}
                          onDragOver={(event) => {
                            if (!draggedExerciseId || draggedExerciseId === ex.id) return
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                            setDropTarget({ kind: 'row', exerciseId: ex.id })
                          }}
                          onDragLeave={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setDropTarget((current) =>
                                current?.kind === 'row' && current.exerciseId === ex.id
                                  ? null
                                  : current,
                              )
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            finishExerciseDrop({ kind: 'row', exerciseId: ex.id })
                          }}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                draggable={!saving}
                                className="cursor-grab select-none rounded-lg px-2 py-2 text-base leading-none text-muted hover:bg-panel hover:text-white active:cursor-grabbing"
                                aria-label={`Drag ${ex.movementName}`}
                                title="Drag movement to reorder or create a superset"
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = 'move'
                                  event.dataTransfer.setData('text/plain', ex.id)
                                  setDraggedExerciseId(ex.id)
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                                  event.preventDefault()
                                  const direction = event.key === 'ArrowUp' ? -1 : 1
                                  void moveBlock(blockIndex, direction)
                                }}
                                onDragEnd={() => {
                                  setDraggedExerciseId(null)
                                  setDropTarget(null)
                                }}
                              >
                                ⋮⋮
                              </button>
                              <span className={`font-medium ${previewed ? 'text-lime' : ''}`}>
                                {displayGroup
                                  ? `${displayGroup}${displayOrder ?? offset + 1}`
                                  : blockIndex + 1}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold">{ex.movementName}</p>
                            <p className="text-xs text-muted">
                              {category}
                              {ex.equipment ? ` · ${ex.equipment}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="rounded-lg px-2 py-1 font-medium hover:bg-panel"
                              onClick={() => setExpandedExerciseId(expanded ? null : ex.id)}
                            >
                              {repsSummary(ex)}
                            </button>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="space-y-2">
                              {ex.perSetEnabled ? (
                                <button
                                  type="button"
                                  className="w-full rounded-lg border border-transparent px-2 py-2 text-left text-muted hover:border-line"
                                  onClick={() => setExpandedExerciseId(ex.id)}
                                >
                                  {loadSummary(ex) || 'Set-specific'}
                                </button>
                              ) : (
                                <TextInput
                                  value={ex.loadPrescription ?? ''}
                                  placeholder="—"
                                  onChange={(e) =>
                                    patchExercise(ex.id, {
                                      loadPrescription: e.target.value || null,
                                    })
                                  }
                                  onBlur={(e) =>
                                    patchExercise(
                                      ex.id,
                                      { loadPrescription: e.target.value || null },
                                      true,
                                    )
                                  }
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="w-full rounded-lg border border-transparent px-2 py-2 text-left hover:border-line"
                              onClick={() => setExpandedExerciseId(expanded ? null : ex.id)}
                            >
                              {tempoSummary(ex)}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <NumericTextInput
                              value={ex.restAfterSetSeconds ?? ''}
                              placeholder="—"
                              onChange={(e) =>
                                patchExercise(ex.id, {
                                  restAfterSetSeconds: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              onBlur={(e) =>
                                patchExercise(
                                  ex.id,
                                  {
                                    restAfterSetSeconds: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  },
                                  true,
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <TextInput
                              value={ex.notes ?? ''}
                              placeholder="Add notes"
                              onChange={(e) =>
                                patchExercise(ex.id, { notes: e.target.value || null })
                              }
                              onBlur={(e) =>
                                patchExercise(
                                  ex.id,
                                  { notes: e.target.value || null },
                                  true,
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-xs"
                                aria-expanded={expanded}
                                onClick={() => setExpandedExerciseId(expanded ? null : ex.id)}
                              >
                                {expanded ? 'Close' : 'Details'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-line bg-ink/25">
                            <td colSpan={8} className="p-3 sm:p-4">
                              <ExerciseCard
                                exercise={ex}
                                index={blockStart + offset}
                                nextGroup={nextGroup}
                                existingGroups={existingGroups}
                                groupSize={block.length}
                                reorderControls={null}
                                onPatch={patchExercise}
                                onAssignSuperset={(groupName) =>
                                  void assignSuperset(ex.id, groupName)
                                }
                                onSupersetOrder={(order) => changeSupersetOrder(ex.id, order)}
                                onSaveDefault={() => void saveMovementDefault(ex)}
                                saveDefaultStatus={defaultSaveStatus[ex.id] ?? 'idle'}
                                onRemove={() => void removeExercise(ex.id)}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                })}
                {exercises.length > 0 ? renderDropLine(visibleExercises.length) : null}
                {exercises.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted">
                      No movements yet. Add the first movement below.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6">
          {renderSlot(
            { key: 'compact-end', flatIndex: exercises.length, group: null },
            exercises.length === 0 ? 'Add first movement' : 'Add movement',
          )}
          <p className="text-xs text-muted">
            Edit common fields in the table. Open Details for methods, set-specific targets,
            per-rep tempo, supersets, equipment, links, and removal.
          </p>
          {assignBlock}
      <VersionHistory events={template.versionHistory} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      {header}
      {clientHistoryControls}

      <Card className="space-y-3">
        <h2 className="font-semibold">Workout / Warmup Notes</h2>
        <TextArea
          rows={3}
          value={warmup}
          onChange={(e) => {
            noteWorkoutEdited()
            setTemplate({ ...template, warmup: e.target.value })
          }}
          onBlur={() => void saveMeta({ warmup })}
        />
      </Card>

      <div className="space-y-4">
        <p className="text-sm text-muted">
          Use the plus buttons to add a movement in that spot. Use Move up and Move down to change
          order. Movements that share a superset letter stay together as one block.
        </p>
        {renderSlot({ key: 'start', flatIndex: 0, group: null }, 'Add movement at the start')}
        {blocks.map((block, blockIndex) => {
          const group = supersetGroupKey(block[0]!)
          const canMoveUp = blockIndex > 0
          const canMoveDown = blockIndex < blocks.length - 1
          const blockStart = blocks
            .slice(0, blockIndex)
            .reduce((sum, item) => sum + item.length, 0)
          const blockEnd = blockStart + block.length
          const reorderButtons = (
            <>
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                disabled={!canMoveUp}
                aria-label={group ? 'Move superset up' : 'Move movement up'}
                onClick={() => void moveBlock(blockIndex, -1)}
              >
                Move up
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                disabled={!canMoveDown}
                aria-label={group ? 'Move superset down' : 'Move movement down'}
                onClick={() => void moveBlock(blockIndex, 1)}
              >
                Move down
              </Button>
            </>
          )
          const cards = block.map((ex, offset) => (
            <Fragment key={ex.id}>
              <ExerciseCard
                exercise={ex}
                index={blockStart + offset}
                nextGroup={nextGroup}
                existingGroups={existingGroups}
                groupSize={block.length}
                reorderControls={
                  group ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        disabled={offset === 0}
                        aria-label={`Move ${ex.movementName} up within superset ${group}`}
                        onClick={() => changeSupersetOrder(ex.id, offset)}
                      >
                        Move up
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        disabled={offset === block.length - 1}
                        aria-label={`Move ${ex.movementName} down within superset ${group}`}
                        onClick={() => changeSupersetOrder(ex.id, offset + 2)}
                      >
                        Move down
                      </Button>
                    </>
                  ) : (
                    reorderButtons
                  )
                }
                historyContext={
                  <>
                    {historyContextFor(ex)}
                    {selectedClientName ? null : (
                      <p className="text-xs text-muted">
                        Select a client to view logged history for{' '}
                        {ex.movementName || 'movement'}
                      </p>
                    )}
                  </>
                }
                onPatch={patchExercise}
                onAssignSuperset={(groupName) => void assignSuperset(ex.id, groupName)}
                onSupersetOrder={(order) => changeSupersetOrder(ex.id, order)}
                onSaveDefault={() => void saveMovementDefault(ex)}
                saveDefaultStatus={defaultSaveStatus[ex.id] ?? 'idle'}
                onRemove={() => void removeExercise(ex.id)}
              />
              {group &&
                renderSlot(
                  {
                    key: `group-${group}-${blockStart + offset + 1}`,
                    flatIndex: blockStart + offset + 1,
                    group,
                  },
                  `Add movement to superset ${group}`,
                )}
            </Fragment>
          ))
          return (
            <Fragment key={group ? `superset-${group}` : block[0]!.id}>
              {group ? (
                <section className="space-y-3 rounded-2xl border border-line p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Superset {group}
                    </p>
                    <div className="flex flex-wrap gap-2">{reorderButtons}</div>
                  </div>
                  {cards}
                </section>
              ) : (
                cards
              )}
              {renderSlot(
                { key: `after-${blockEnd}`, flatIndex: blockEnd, group: null },
                canMoveDown ? 'Add movement here' : 'Add movement at the end',
              )}
            </Fragment>
          )
        })}
      </div>
      {assignBlock}
      <VersionHistory events={template.versionHistory} />
    </div>
  )
}

function ExerciseCard({
  exercise: ex,
  index,
  nextGroup,
  existingGroups,
  groupSize,
  reorderControls,
  historyContext,
  onPatch,
  onAssignSuperset,
  onSupersetOrder,
  onSaveDefault,
  saveDefaultStatus = 'idle',
  onRemove,
}: {
  exercise: TemplateExercise
  index: number
  nextGroup: string
  existingGroups: string[]
  groupSize: number
  reorderControls: ReactNode
  historyContext?: ReactNode
  onPatch: (id: string, patch: Partial<TemplateExercise>, persist?: boolean) => void
  onAssignSuperset: (group: string | null) => void
  onSupersetOrder: (order: number) => void
  onSaveDefault: () => void
  saveDefaultStatus?: SaveDefaultStatus
  onRemove: () => void
}) {
  const [tempoOpen, setTempoOpen] = useState(() => hasConfiguredTempo(ex))
  const isRange = ex.method === 'reps_range'
  const showReps = showsRepsField(ex.method)
  const allowPerRep = allowsPerRepTempo(ex.method)
  const isSuperset = Boolean(ex.supersetGroup?.trim())
  const tempoMode: TempoMode =
    allowPerRep && ex.tempoMode === 'per_rep' ? 'per_rep' : 'default'

  const patchReps = (patch: Partial<TemplateExercise>, persist = false) => {
    const next = { ...ex, ...patch }
    if (tempoMode === 'per_rep') {
      patch = { ...patch, tempoPerRep: resizeTempoPerRep(ex.tempoPerRep, tempoRepCount(next)) }
    }
    onPatch(ex.id, patch, persist)
  }

  const patchSetPrescription = (
    setIndex: number,
    patch: Partial<SetPrescription>,
    persist = false,
  ) => {
    const next = resizeSetPrescriptions(
      ex.setPrescriptions,
      ex.setCount,
      fallbackSetPrescription(ex),
    )
    next[setIndex] = { ...next[setIndex]!, ...patch }
    onPatch(ex.id, { setPrescriptions: next }, persist)
  }

  const setPerSetEnabled = (enabled: boolean) => {
    onPatch(
      ex.id,
      {
        perSetEnabled: enabled,
        setPrescriptions: enabled
          ? resizeSetPrescriptions(ex.setPrescriptions, ex.setCount, fallbackSetPrescription(ex))
          : [],
      },
      true,
    )
  }

  const changeMethod = (method: SetMethod) => {
    const quantities = quantityDefaultsForMethod(method)
    const patch: Partial<TemplateExercise> = { method, ...quantities }
    if (!allowsPerRepTempo(method)) {
      patch.tempoMode = 'default'
      patch.tempoPerRep = []
    } else if (ex.tempoMode === 'per_rep') {
      patch.tempoPerRep = resizeTempoPerRep(ex.tempoPerRep, tempoRepCount({ ...ex, ...patch }))
    }
    if (!showsRepsField(method)) {
      patch.perSetEnabled = false
      patch.setPrescriptions = []
    } else if (ex.perSetEnabled) {
      patch.setPrescriptions = Array.from({ length: ex.setCount }, () => ({
        repsMin: quantities.repsMin,
        repsMax: quantities.repsMax,
        loadPrescription: ex.loadPrescription,
      }))
    }
    onPatch(ex.id, patch, true)
  }

  const setTempoMode = (mode: TempoMode) => {
    if (mode === 'per_rep') {
      onPatch(
        ex.id,
        { tempoMode: 'per_rep', tempoPerRep: resizeTempoPerRep(ex.tempoPerRep, tempoRepCount(ex)) },
        true,
      )
      return
    }
    onPatch(ex.id, { tempoMode: 'default', tempoPerRep: [] }, true)
  }

  const defaultTempo: Tempo = {
    eccentric: ex.tempoEccentric,
    pauseBottom: ex.tempoPauseBottom,
    concentric: ex.tempoConcentric,
    pauseTop: ex.tempoPauseTop,
  }

  const equipmentUnset = !ex.equipment
  const equipmentField = (
    <Field label={equipmentUnset ? 'Equipment' : 'Equipment override'}>
      <select
        className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
        value={ex.equipment ?? ''}
        onChange={(e) =>
          onPatch(ex.id, { equipment: (e.target.value || null) as Equipment | null }, true)
        }
      >
        <option value="">None</option>
        {EQUIPMENT.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </Field>
  )

  return (
    <Card className="space-y-3">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold">
            {ex.supersetGroup
              ? `${ex.supersetGroup}${ex.supersetOrder ?? index + 1} · `
              : ''}
            {ex.movementName}
          </div>
          <div className="text-xs uppercase text-muted">
            {CATEGORIES.find((c) => c.value === ex.category)?.label ?? 'Accessory'}
            {ex.equipment ? ` · ${ex.equipment}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {reorderControls}
          <SaveDefaultButton status={saveDefaultStatus} onClick={onSaveDefault} />
          <ConfirmButton onConfirm={onRemove} question="Remove this movement?">
            Remove
          </ConfirmButton>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select
            className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
            value={ex.category ?? 'accessory'}
            onChange={(e) =>
              onPatch(ex.id, { category: e.target.value as ExerciseCategory }, true)
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Method">
          <select
            className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
            value={ex.method}
            onChange={(e) => changeMethod(e.target.value as SetMethod)}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {equipmentUnset ? equipmentField : null}
      <div
        className={
          showReps
            ? `grid items-end gap-3 ${
                ex.perSetEnabled
                  ? 'grid-cols-[1fr_auto]'
                  : isRange
                    ? 'sm:grid-cols-[1fr_1fr_1fr_auto]'
                    : 'sm:grid-cols-[1fr_1fr_auto]'
              }`
            : ''
        }
      >
        <Field label="Sets">
          <NumericTextInput
            value={ex.setCount}
            onChange={(e) => {
              const setCount = Number(e.target.value)
              onPatch(ex.id, {
                setCount,
                ...(ex.perSetEnabled
                  ? {
                      setPrescriptions: resizeSetPrescriptions(
                        ex.setPrescriptions,
                        setCount,
                        fallbackSetPrescription(ex),
                      ),
                    }
                  : {}),
              })
            }}
            onBlur={(e) => {
              const setCount = Number(e.target.value)
              onPatch(
                ex.id,
                {
                  setCount,
                  ...(ex.perSetEnabled
                    ? {
                        setPrescriptions: resizeSetPrescriptions(
                          ex.setPrescriptions,
                          setCount,
                          fallbackSetPrescription(ex),
                        ),
                      }
                    : {}),
                },
                true,
              )
            }}
          />
        </Field>
        {showReps && !ex.perSetEnabled && isRange && (
          <>
            <Field label="Reps min">
              <NumericTextInput
                key={`${ex.method}-min`}
                value={ex.repsMin}
                onChange={(e) => patchReps({ repsMin: Number(e.target.value) })}
                onBlur={(e) => patchReps({ repsMin: Number(e.target.value) }, true)}
              />
            </Field>
            <Field label="Reps max">
              <NumericTextInput
                key={`${ex.method}-max`}
                value={ex.repsMax ?? ''}
                onChange={(e) =>
                  patchReps({ repsMax: e.target.value ? Number(e.target.value) : null })
                }
                onBlur={(e) =>
                  patchReps({ repsMax: e.target.value ? Number(e.target.value) : null }, true)
                }
              />
            </Field>
          </>
        )}
        {showReps && !ex.perSetEnabled && !isRange && (
          <Field label={quantityLabel(ex.method)}>
            <NumericTextInput
              key={ex.method}
              value={ex.repsMin}
              onChange={(e) => patchReps({ repsMin: Number(e.target.value), repsMax: null })}
              onBlur={(e) => patchReps({ repsMin: Number(e.target.value), repsMax: null }, true)}
            />
          </Field>
        )}
        {showReps && (
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Customize Sets
              <InfoTip label="Customize reps and prescription per set">
                Customize reps and prescription per set
              </InfoTip>
            </span>
            <Toggle value={ex.perSetEnabled} onChange={setPerSetEnabled} />
          </div>
        )}
      </div>
      {showReps && ex.perSetEnabled && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Each set</p>
          {resizeSetPrescriptions(
            ex.setPrescriptions,
            ex.setCount,
            fallbackSetPrescription(ex),
          ).map((set, setIndex) => (
            <div
              key={setIndex}
              className={`grid grid-cols-2 items-end gap-3 ${
                isRange ? 'sm:grid-cols-[auto_1fr_1fr_1fr]' : 'sm:grid-cols-[auto_1fr_1fr]'
              }`}
            >
              <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:pb-2.5">
                Set {setIndex + 1}
              </span>
              <Field label={isRange ? 'Min reps' : quantityLabel(ex.method)}>
                <NumericTextInput
                  key={`${ex.method}-${setIndex}-min`}
                  value={set.repsMin}
                  onChange={(e) =>
                    patchSetPrescription(setIndex, { repsMin: Number(e.target.value) })
                  }
                  onBlur={(e) =>
                    patchSetPrescription(setIndex, { repsMin: Number(e.target.value) }, true)
                  }
                />
              </Field>
              {isRange && (
                <Field label="Max reps">
                  <NumericTextInput
                    key={`${ex.method}-${setIndex}-max`}
                    value={set.repsMax ?? ''}
                    onChange={(e) =>
                      patchSetPrescription(setIndex, {
                        repsMax: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    onBlur={(e) =>
                      patchSetPrescription(
                        setIndex,
                        { repsMax: e.target.value ? Number(e.target.value) : null },
                        true,
                      )
                    }
                  />
                </Field>
              )}
              <div className={isRange ? 'col-span-2 sm:col-span-1' : ''}>
                <Field label="Prescribed load">
                  <TextInput
                    value={set.loadPrescription ?? ''}
                    onChange={(e) =>
                      patchSetPrescription(setIndex, {
                        loadPrescription: e.target.value || null,
                      })
                    }
                    onBlur={(e) =>
                      patchSetPrescription(
                        setIndex,
                        { loadPrescription: e.target.value || null },
                        true,
                      )
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
      {!ex.perSetEnabled && (
        <Field label="Prescribed load">
          <TextInput
            value={ex.loadPrescription ?? ''}
            onChange={(e) => onPatch(ex.id, { loadPrescription: e.target.value || null })}
            onBlur={(e) =>
              onPatch(ex.id, { loadPrescription: e.target.value || null }, true)
            }
          />
        </Field>
      )}
      {historyContext}
      <div className="space-y-2">
        {!tempoOpen ? (
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            onClick={() => setTempoOpen(true)}
          >
            Configure tempo
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Tempo</p>
                {allowPerRep && (
                  <ModeToggle
                    value={tempoMode}
                    options={[
                      { value: 'default' as const, label: 'Default' },
                      { value: 'per_rep' as const, label: 'Per rep' },
                    ]}
                    onChange={setTempoMode}
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  setTempoOpen(false)
                  onPatch(
                    ex.id,
                    {
                      tempoEccentric: null,
                      tempoPauseBottom: null,
                      tempoConcentric: null,
                      tempoPauseTop: null,
                      tempoMode: 'default',
                      tempoPerRep: [],
                    },
                    true,
                  )
                }}
              >
                Remove tempo
              </Button>
            </div>
            {tempoMode === 'per_rep' && allowPerRep ? (
              <div className="space-y-4">
                {resizeTempoPerRep(ex.tempoPerRep, tempoRepCount(ex)).map((tempo, repIndex) => (
                  <div key={repIndex} className="space-y-2">
                    <p className="text-xs text-muted">Rep {repIndex + 1}</p>
                    <TempoFields
                      value={tempo}
                      onChange={(next, persist) => {
                        const nextList = resizeTempoPerRep(ex.tempoPerRep, tempoRepCount(ex))
                        nextList[repIndex] = next
                        onPatch(ex.id, { tempoPerRep: nextList }, persist)
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <TempoFields
                value={defaultTempo}
                onChange={(next, persist) =>
                  onPatch(
                    ex.id,
                    {
                      tempoEccentric: next.eccentric ?? null,
                      tempoPauseBottom: next.pauseBottom ?? null,
                      tempoConcentric: next.concentric ?? null,
                      tempoPauseTop: next.pauseTop ?? null,
                    },
                    persist,
                  )
                }
              />
            )}
          </>
        )}
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Superset
          </span>
          <Toggle
            value={isSuperset}
            onChange={(next) => onAssignSuperset(next ? nextGroup : null)}
          />
        </div>
        {isSuperset && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Superset group">
              <Select
                value={ex.supersetGroup ?? nextGroup}
                onChange={(e) => onAssignSuperset(e.target.value || null)}
              >
                {[
                  ...existingGroups,
                  ...(ex.supersetGroup && !existingGroups.includes(ex.supersetGroup)
                    ? [ex.supersetGroup]
                    : []),
                  ...(!existingGroups.includes(nextGroup) &&
                  nextGroup !== ex.supersetGroup
                    ? [nextGroup]
                    : []),
                ].map((groupName) => (
                  <option key={groupName} value={groupName}>
                    {groupName}
                    {groupName === nextGroup && !existingGroups.includes(groupName)
                      ? ' (new)'
                      : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Order in group">
              <Select
                value={String(ex.supersetOrder ?? 1)}
                onChange={(e) => onSupersetOrder(Number(e.target.value))}
              >
                {supersetOrderOptions(groupSize, ex.supersetOrder).map((order) => (
                  <option key={order} value={order}>
                    {order}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rest between sets">
          <NumericTextInput
            value={ex.restAfterSetSeconds ?? ''}
            onChange={(e) =>
              onPatch(ex.id, {
                restAfterSetSeconds: e.target.value ? Number(e.target.value) : null,
              })
            }
            onBlur={(e) =>
              onPatch(
                ex.id,
                { restAfterSetSeconds: e.target.value ? Number(e.target.value) : null },
                true,
              )
            }
          />
        </Field>
        <Field label="Rest after movement">
          <NumericTextInput
            value={ex.restAfterExerciseSeconds ?? ''}
            onChange={(e) =>
              onPatch(ex.id, {
                restAfterExerciseSeconds: e.target.value ? Number(e.target.value) : null,
              })
            }
            onBlur={(e) =>
              onPatch(
                ex.id,
                {
                  restAfterExerciseSeconds: e.target.value ? Number(e.target.value) : null,
                },
                true,
              )
            }
          />
        </Field>
      </div>
      <Field label="YouTube link">
        <TextInput
          value={ex.youtubeUrl ?? ''}
          onChange={(e) => onPatch(ex.id, { youtubeUrl: e.target.value || null })}
          onBlur={(e) => onPatch(ex.id, { youtubeUrl: e.target.value || null }, true)}
        />
      </Field>
      <Field label="Notes">
        <TextArea
          autoGrow
          value={ex.notes ?? ''}
          onChange={(e) => onPatch(ex.id, { notes: e.target.value || null })}
          onBlur={(e) => onPatch(ex.id, { notes: e.target.value || null }, true)}
        />
      </Field>
      {equipmentUnset ? null : equipmentField}
    </Card>
  )
}
