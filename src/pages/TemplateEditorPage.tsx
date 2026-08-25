import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Field, TextArea, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type {
  Equipment,
  ExerciseCategory,
  Movement,
  SetMethod,
  Tempo,
  TempoMode,
  PrescribedExercise,
  TemplateExercise,
  WorkoutTemplate,
} from '../../shared/types.ts'
import { warmupToText } from '../../shared/types.ts'
import { PrescribedExerciseCard, RestAfterMovement, SupersetFrame, groupBySuperset } from '../components/PrescribedExerciseCard.tsx'

const METHODS: { value: SetMethod; label: string }[] = [
  { value: 'straight', label: 'Straight reps' },
  { value: 'reps_range', label: 'Reps range' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'rir', label: 'RIR' },
  { value: 'rpe', label: 'RPE' },
  { value: 'to_failure', label: 'To failure' },
]

const CATEGORIES: { value: ExerciseCategory; label: string }[] = [
  { value: 'main_lift', label: 'Main lift' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'warmup', label: 'Warmup' },
  { value: 'finisher', label: 'Finisher' },
  { value: 'rehab', label: 'Rehab' },
  { value: 'plyo', label: 'Plyo' },
]

function allowsPerRepTempo(method: SetMethod) {
  return method === 'straight' || method === 'reps_range'
}

function showsRepsField(method: SetMethod) {
  return method !== 'amrap' && method !== 'rpe' && method !== 'to_failure'
}

function emptyTempo(): Tempo {
  return { eccentric: null, pauseBottom: null, concentric: null, pauseTop: null }
}

function tempoRepCount(ex: Pick<TemplateExercise, 'method' | 'repsMin' | 'repsMax'>) {
  if (ex.method === 'reps_range') return Math.max(1, ex.repsMax ?? ex.repsMin ?? 1)
  return Math.max(1, ex.repsMin || 1)
}

function resizeTempoPerRep(current: Tempo[] | undefined, count: number) {
  const next = (current ?? []).slice(0, count)
  while (next.length < count) next.push(emptyTempo())
  return next
}

function emptyExercise(movement: Movement): Partial<TemplateExercise> {
  return {
    movementId: movement.id,
    movementName: movement.name,
    variantId: movement.variants[0]?.id ?? null,
    equipment: movement.variants[0]?.equipment ?? null,
    setCount: 3,
    repsMin: 8,
    repsMax: null,
    method: 'straight',
    category: 'accessory',
    loadPrescription: null,
    tempoMode: 'default',
    tempoPerRep: [],
    supersetGroup: null,
    supersetOrder: null,
    restAfterSetSeconds: 90,
    restAfterExerciseSeconds: 120,
    youtubeUrl: movement.youtubeUrl,
  }
}

function supersetGroupKey(ex: TemplateExercise) {
  const key = ex.supersetGroup?.trim()
  return key || null
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
type EditorView = 'edit' | 'preview'

export function TemplateEditorPage() {
  const { id } = useParams()
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [view, setView] = useState<EditorView>('edit')
  const [saving, setSaving] = useState(false)

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
  }, [])

  const exercises = useMemo(() => template?.exercises ?? [], [template])
  const blocks = useMemo(() => exerciseBlocks(exercises), [exercises])

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
    setSaving(true)
    try {
      const created = await api<TemplateExercise>(`/api/templates/${id}/exercises`, {
        method: 'POST',
        body: JSON.stringify({
          ...emptyExercise(movement),
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

  const createAndAdd = async (name: string, slot: InsertSlot) => {
    const movement = await api<Movement>('/api/movements', {
      method: 'POST',
      body: JSON.stringify({ name }),
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

  const patchExercise = (exerciseId: string, patch: Partial<TemplateExercise>, persist = false) => {
    if (!template) return
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
    await api(`/api/templates/${id}/exercises/${exerciseId}`, { method: 'DELETE' })
    await load()
  }

  const moveBlock = async (blockIndex: number, direction: -1 | 1) => {
    if (!id || !template) return
    const target = blockIndex + direction
    if (target < 0 || target >= blocks.length) return
    const nextBlocks = [...blocks]
    const moving = nextBlocks[blockIndex]!
    nextBlocks[blockIndex] = nextBlocks[target]!
    nextBlocks[target] = moving
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

  const renderSlot = (slot: InsertSlot, label: string) => (
    <AddMovementSlot
      key={slot.key}
      label={label}
      movements={movements}
      open={openSlot === slot.key}
      onOpen={() => setOpenSlot(slot.key)}
      onCancel={() => setOpenSlot(null)}
      onSelect={(movement) => void addExerciseAt(movement, slot)}
      onCreate={(name) => void createAndAdd(name, slot)}
    />
  )

  if (!template) return <p className="p-6 text-muted">Loading workout…</p>

  const warmup = warmupToText(template.warmup)

  const header = (
    <div className="flex items-center gap-3">
      {view === 'edit' ? (
        <TextInput
          value={template.name}
          onChange={(e) => setTemplate({ ...template, name: e.target.value })}
          onBlur={() => void saveMeta({ name: template.name })}
          className="min-w-0 flex-1 font-display text-2xl font-bold"
        />
      ) : (
        <h1 className="min-w-0 flex-1 font-display text-2xl font-bold">{template.name}</h1>
      )}
      <div className="flex shrink-0 items-center gap-3">
        <ModeToggle
          value={view}
          options={[
            { value: 'edit' as const, label: 'Edit' },
            { value: 'preview' as const, label: 'Client view' },
          ]}
          onChange={setView}
        />
        <span className="text-xs text-muted">{saving ? 'Saving…' : 'Saved'}</span>
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
                    {Array.from({ length: Math.max(0, ex.setCount) }, (_, setIndex) => (
                      <div
                        key={setIndex}
                        className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 opacity-60"
                      >
                        <span className="text-xs text-muted">Set {setIndex + 1}</span>
                        <TextInput placeholder="Weight" disabled value="" readOnly />
                        <TextInput placeholder="Reps" disabled value="" readOnly />
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" disabled />
                          Done
                        </label>
                      </div>
                    ))}
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
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      {header}

      <Card className="space-y-3">
        <h2 className="font-semibold">Custom warmup</h2>
        <TextArea
          rows={3}
          value={warmup}
          onChange={(e) => setTemplate({ ...template, warmup: e.target.value })}
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
                reorderControls={group ? null : reorderButtons}
                onPatch={patchExercise}
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
    </div>
  )
}

function AddMovementSlot({
  label,
  movements,
  open,
  onOpen,
  onCancel,
  onSelect,
  onCreate,
}: {
  label: string
  movements: Movement[]
  open: boolean
  onOpen: () => void
  onCancel: () => void
  onSelect: (movement: Movement) => void
  onCreate: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? movements.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.aliases.some((alias) => alias.toLowerCase().includes(q)),
        )
      : movements
    return list.slice(0, 12)
  }, [movements, query])

  const exact = movements.some((m) => m.name.toLowerCase() === query.trim().toLowerCase())
  const canCreate = Boolean(query.trim()) && !exact

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          title={label}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-lg leading-none text-muted hover:border-muted hover:text-white"
          onClick={onOpen}
        >
          +
        </button>
      </div>
    )
  }

  const choose = (index: number) => {
    if (index < matches.length) {
      onSelect(matches[index]!)
      return
    }
    if (canCreate) onCreate(query.trim())
  }

  return (
    <Card className="space-y-3">
      <Field label={label}>
        <TextInput
          autoFocus
          placeholder="Search or add a movement…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            const optionCount = matches.length + (canCreate ? 1 : 0)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (optionCount ? (i + 1) % optionCount : 0))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (optionCount ? (i - 1 + optionCount) % optionCount : 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(active)
            } else if (e.key === 'Escape') {
              onCancel()
            }
          }}
        />
      </Field>
      <ul className="max-h-56 overflow-auto rounded-xl border border-line">
        {matches.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                i === active ? 'bg-lime/15 text-white' : 'text-muted hover:bg-ink'
              }`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onSelect(m)}
            >
              <span className="font-medium text-white">{m.name}</span>
              {m.muscleGroups.length > 0 && (
                <span className="text-xs text-muted">{m.muscleGroups.join(', ')}</span>
              )}
            </button>
          </li>
        ))}
        {canCreate && (
          <li>
            <button
              type="button"
              className={`w-full px-3 py-2 text-left text-sm ${
                active === matches.length ? 'bg-lime/15 text-white' : 'text-muted hover:bg-ink'
              }`}
              onMouseEnter={() => setActive(matches.length)}
              onClick={() => onCreate(query.trim())}
            >
              Add “{query.trim()}” to catalog
            </button>
          </li>
        )}
        {matches.length === 0 && !canCreate && (
          <li className="px-3 py-2 text-sm text-muted">No movements match.</li>
        )}
      </ul>
      <Button type="button" variant="ghost" className="text-xs" onClick={onCancel}>
        Cancel
      </Button>
    </Card>
  )
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-line p-1 text-sm">
      <button
        type="button"
        className={`rounded-lg px-4 py-1.5 ${!value ? 'bg-lime text-ink' : 'text-muted'}`}
        onClick={() => onChange(false)}
      >
        No
      </button>
      <button
        type="button"
        className={`rounded-lg px-4 py-1.5 ${value ? 'bg-lime text-ink' : 'text-muted'}`}
        onClick={() => onChange(true)}
      >
        Yes
      </button>
    </div>
  )
}

function ModeToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-line p-1 text-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-lg px-4 py-1.5 ${
            value === option.value ? 'bg-lime text-ink' : 'text-muted'
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function TempoFields({
  value,
  onChange,
}: {
  value: Tempo
  onChange: (next: Tempo, persist?: boolean) => void
}) {
  const num = (raw: string) => (raw ? Number(raw) : null)
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label="Time down (s)">
        <TextInput
          type="number"
          value={value.eccentric ?? ''}
          onChange={(e) => onChange({ ...value, eccentric: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, eccentric: num(e.target.value) }, true)}
        />
      </Field>
      <Field label="Pause (s)">
        <TextInput
          type="number"
          value={value.pauseBottom ?? ''}
          onChange={(e) => onChange({ ...value, pauseBottom: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, pauseBottom: num(e.target.value) }, true)}
        />
      </Field>
      <Field label="Time up (s)">
        <TextInput
          type="number"
          value={value.concentric ?? ''}
          onChange={(e) => onChange({ ...value, concentric: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, concentric: num(e.target.value) }, true)}
        />
      </Field>
      <Field label="Pause top (s)">
        <TextInput
          type="number"
          value={value.pauseTop ?? ''}
          onChange={(e) => onChange({ ...value, pauseTop: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, pauseTop: num(e.target.value) }, true)}
        />
      </Field>
    </div>
  )
}

function ExerciseCard({
  exercise: ex,
  index,
  reorderControls,
  onPatch,
  onRemove,
}: {
  exercise: TemplateExercise
  index: number
  reorderControls: ReactNode
  onPatch: (id: string, patch: Partial<TemplateExercise>, persist?: boolean) => void
  onRemove: () => void
}) {
  const [tempoOpen, setTempoOpen] = useState(false)
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

  const changeMethod = (method: SetMethod) => {
    const patch: Partial<TemplateExercise> = { method }
    if (method === 'reps_range') {
      patch.repsMax = ex.repsMax ?? ex.repsMin
    } else {
      patch.repsMax = null
    }
    if (!allowsPerRepTempo(method)) {
      patch.tempoMode = 'default'
      patch.tempoPerRep = []
    } else if (ex.tempoMode === 'per_rep') {
      patch.tempoPerRep = resizeTempoPerRep(ex.tempoPerRep, tempoRepCount({ ...ex, ...patch }))
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

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
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
        <div className="flex flex-wrap justify-end gap-2">
          {reorderControls}
          <Button variant="danger" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      <div className={showReps ? 'grid gap-3 sm:grid-cols-2' : ''}>
        <Field label="Sets">
          <TextInput
            type="number"
            value={ex.setCount}
            onChange={(e) => onPatch(ex.id, { setCount: Number(e.target.value) })}
            onBlur={(e) => onPatch(ex.id, { setCount: Number(e.target.value) }, true)}
          />
        </Field>
        {showReps &&
          (isRange ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reps min">
                <TextInput
                  type="number"
                  value={ex.repsMin}
                  onChange={(e) => patchReps({ repsMin: Number(e.target.value) })}
                  onBlur={(e) => patchReps({ repsMin: Number(e.target.value) }, true)}
                />
              </Field>
              <Field label="Reps max">
                <TextInput
                  type="number"
                  value={ex.repsMax ?? ''}
                  onChange={(e) =>
                    patchReps({ repsMax: e.target.value ? Number(e.target.value) : null })
                  }
                  onBlur={(e) =>
                    patchReps(
                      { repsMax: e.target.value ? Number(e.target.value) : null },
                      true,
                    )
                  }
                />
              </Field>
            </div>
          ) : (
            <Field label={ex.method === 'rir' ? 'RIR' : 'Reps'}>
              <TextInput
                type="number"
                value={ex.repsMin}
                onChange={(e) => patchReps({ repsMin: Number(e.target.value), repsMax: null })}
                onBlur={(e) =>
                  patchReps({ repsMin: Number(e.target.value), repsMax: null }, true)
                }
              />
            </Field>
          ))}
      </div>
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
        <Field label="Prescribed load">
          <TextInput
            value={ex.loadPrescription ?? ''}
            onChange={(e) => onPatch(ex.id, { loadPrescription: e.target.value || null })}
            onBlur={(e) =>
              onPatch(ex.id, { loadPrescription: e.target.value || null }, true)
            }
          />
        </Field>
      </div>
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
              <div className="flex items-center gap-3">
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
                {(ex.tempoPerRep ?? []).map((tempo, repIndex) => (
                  <div key={repIndex} className="space-y-2">
                    <p className="text-xs text-muted">Rep {repIndex + 1}</p>
                    <TempoFields
                      value={tempo}
                      onChange={(next, persist) => {
                        const nextList = [...(ex.tempoPerRep ?? [])]
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
            onChange={(next) =>
              onPatch(
                ex.id,
                next
                  ? { supersetGroup: ex.supersetGroup || 'A', supersetOrder: ex.supersetOrder ?? 1 }
                  : { supersetGroup: null, supersetOrder: null },
                true,
              )
            }
          />
        </div>
        {isSuperset && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Superset group">
              <TextInput
                placeholder="A"
                value={ex.supersetGroup ?? ''}
                onChange={(e) => onPatch(ex.id, { supersetGroup: e.target.value || null })}
                onBlur={(e) => onPatch(ex.id, { supersetGroup: e.target.value || null }, true)}
              />
            </Field>
            <Field label="Order in group">
              <TextInput
                type="number"
                value={ex.supersetOrder ?? ''}
                onChange={(e) =>
                  onPatch(ex.id, {
                    supersetOrder: e.target.value ? Number(e.target.value) : null,
                  })
                }
                onBlur={(e) =>
                  onPatch(
                    ex.id,
                    { supersetOrder: e.target.value ? Number(e.target.value) : null },
                    true,
                  )
                }
              />
            </Field>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rest after set (s)">
          <TextInput
            type="number"
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
        <Field label="Rest after movement (s)">
          <TextInput
            type="number"
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
        <TextInput
          value={ex.notes ?? ''}
          onChange={(e) => onPatch(ex.id, { notes: e.target.value || null })}
          onBlur={(e) => onPatch(ex.id, { notes: e.target.value || null }, true)}
        />
      </Field>
      <Field label="Equipment override">
        <select
          className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
          value={ex.equipment ?? ''}
          onChange={(e) =>
            onPatch(ex.id, { equipment: (e.target.value || null) as Equipment | null }, true)
          }
        >
          <option value="">—</option>
          <option value="barbell">Barbell</option>
          <option value="dumbbell">Dumbbell</option>
          <option value="machine">Machine</option>
          <option value="cable">Cable</option>
          <option value="kettlebell">Kettlebell</option>
          <option value="bodyweight">Bodyweight</option>
          <option value="other">Other</option>
        </select>
      </Field>
    </Card>
  )
}
