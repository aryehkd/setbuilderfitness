import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { AddMovementSlot } from './AddMovementSlot.tsx'
import {
  Button,
  Card,
  ConfirmButton,
  Field,
  NumericTextInput,
  Select,
  TextArea,
  TextInput,
} from './ui.tsx'
import {
  BlockDragHelp,
  ModeToggle,
  SaveDefaultButton,
  TempoFields,
  Toggle,
  clearCompletedDefaultSaves,
  type SaveDefaultStatus,
} from './WorkoutEditorControls.tsx'
import {
  CATEGORIES,
  EQUIPMENT,
  METHODS,
  allowsPerRepTempo,
  arrangeExerciseDrop,
  exerciseBlocks,
  fallbackSetPrescription,
  movementDefaultsFromPrescription,
  moveExerciseBlock,
  nextSupersetGroup,
  prescriptionDefaultsForMovement,
  quantityDefaultsForMethod,
  quantityLabel,
  resettleSuperset,
  placeInSupersetOrder,
  supersetGroupKey,
  supersetOrderOptions,
  resizeSetPrescriptions,
  resizeTempoPerRep,
  showsRepsField,
  tempoRepCount,
  type ExerciseDropTarget,
} from './WorkoutEditorUtils.ts'
import { api } from '../lib/api.ts'
import { materializeMovement, replaceCatalogMovement } from '../lib/movements.ts'
import { MovementHistoryContext } from './MovementHistoryContext.tsx'
import type {
  Equipment,
  ExerciseHistoryEntry,
  ExerciseCategory,
  Movement,
  MovementHistoryById,
  PrescribedExercise,
  Prescription,
  SetMethod,
  SetPrescription,
  Tempo,
  TempoMode,
} from '../../shared/types.ts'

function defaultTempoParts(tempo?: Tempo | null) {
  return [tempo?.eccentric, tempo?.pauseBottom, tempo?.concentric, tempo?.pauseTop]
}

function hasConfiguredTempo(ex: PrescribedExercise) {
  if (ex.tempoMode === 'per_rep') return true
  return defaultTempoParts(ex.tempo).some((part) => part != null)
}

function newExercise(movement: Movement): PrescribedExercise {
  const defaults = prescriptionDefaultsForMovement(movement)
  return {
    movementId: movement.id,
    movementName: movement.name,
    ...defaults,
    supersetGroup: null,
    supersetOrder: null,
  }
}

export function SessionPrescriptionEditor({
  name,
  prescription,
  movements,
  clientName,
  movementHistory = {},
  movementHistoryLoading = false,
  movementHistoryError = null,
  readOnly = false,
  onChange,
}: {
  name: string
  prescription: Prescription
  movements: Movement[]
  clientName?: string
  movementHistory?: MovementHistoryById
  movementHistoryLoading?: boolean
  movementHistoryError?: string | null
  readOnly?: boolean
  onChange: (next: { name: string; prescription: Prescription }) => void
}) {
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [catalog, setCatalog] = useState(movements)
  const [defaultSaveStatus, setDefaultSaveStatus] = useState<Record<string, SaveDefaultStatus>>(
    {},
  )
  const skipDefaultSaveClear = useRef(false)
  const sortedMovements = useMemo(
    () => [...catalog].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog],
  )

  useEffect(() => {
    setCatalog(movements)
  }, [movements])

  const setPrescription = (next: Prescription) => {
    if (!skipDefaultSaveClear.current) {
      setDefaultSaveStatus(clearCompletedDefaultSaves)
    }
    onChange({ name, prescription: next })
  }
  const patchExercise = (index: number, patch: Partial<PrescribedExercise>) => {
    const exercises = prescription.exercises.map((exercise, i) =>
      i === index ? { ...exercise, ...patch } : exercise,
    )
    setPrescription({ ...prescription, exercises })
  }
  const moveExercise = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= prescription.exercises.length) return
    const exercises = [...prescription.exercises]
    const moving = exercises[index]!
    exercises[index] = exercises[target]!
    exercises[target] = moving
    setPrescription({ ...prescription, exercises })
  }
  const removeExercise = (index: number) => {
    const removed = prescription.exercises[index]
    if (!removed) return
    const removedGroup = removed.supersetGroup?.trim() || null
    const remaining = prescription.exercises.filter((_, i) => i !== index)
    setPrescription({
      ...prescription,
      exercises: removedGroup ? resettleSuperset(remaining, removedGroup) : remaining,
    })
  }
  const saveMovementDefault = async (exercise: PrescribedExercise, index: number) => {
    const key = String(index)
    setDefaultSaveStatus((current) => ({ ...current, [key]: 'saving' }))
    try {
      const claimed = await api<Movement>(
        `/api/movements/${exercise.movementId}/defaults`,
        {
          method: 'PUT',
          body: JSON.stringify(movementDefaultsFromPrescription(exercise)),
        },
      )
      setCatalog((current) =>
        replaceCatalogMovement(
          current,
          { id: exercise.movementId, sourceExerciseId: claimed.sourceExerciseId },
          claimed,
        ),
      )
      if (
        claimed.id !== exercise.movementId ||
        (claimed.savedDefaults?.variantId && claimed.savedDefaults.variantId !== exercise.variantId)
      ) {
        skipDefaultSaveClear.current = true
        try {
          setPrescription({
            ...prescription,
            exercises: prescription.exercises.map((item) =>
              item === exercise
                ? {
                    ...item,
                    movementId: claimed.id,
                    movementName: claimed.name,
                    variantId: claimed.savedDefaults?.variantId ?? item.variantId,
                  }
                : item,
            ),
          })
        } finally {
          skipDefaultSaveClear.current = false
        }
      }
      setDefaultSaveStatus((current) => ({ ...current, [key]: 'saved' }))
    } catch {
      setDefaultSaveStatus((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
  }
  const insertExercise = async (index: number, movement: Movement) => {
    const selectedMovement = await materializeMovement(movement)
    const exercises = [...prescription.exercises]
    exercises.splice(index, 0, newExercise(selectedMovement))
    setPrescription({ ...prescription, exercises })
    setCatalog((current) =>
      current.map((item) => (item.id === movement.id ? selectedMovement : item)),
    )
    setOpenSlot(null)
  }
  const rememberMovement = (movement: Movement) => {
    setCatalog((prev) => {
      if (prev.some((item) => item.id === movement.id)) return prev
      return [...prev, movement]
    })
  }
  const createAndInsert = async (
    index: number,
    name: string,
    category: ExerciseCategory,
    equipment: Equipment,
  ) => {
    const movement = await api<Movement>('/api/movements', {
      method: 'POST',
      body: JSON.stringify({ name, category, equipment }),
    })
    rememberMovement(movement)
    await insertExercise(index, movement)
  }
  const renderSlot = (key: string, index: number, label: string) => (
    <AddMovementSlot
      key={key}
      label={label}
      movements={sortedMovements}
      open={openSlot === key}
      onOpen={() => setOpenSlot(key)}
      onCancel={() => setOpenSlot(null)}
      onSelect={(movement) => void insertExercise(index, movement)}
      onCreate={(name, category, equipment) =>
        void createAndInsert(index, name, category, equipment)
      }
    />
  )

  return (
    <fieldset disabled={readOnly} className="space-y-4">
      <Card className="space-y-4">
        <Field label="Workout name">
          <TextInput
            value={name}
            onChange={(event) => {
              setDefaultSaveStatus(clearCompletedDefaultSaves)
              onChange({ name: event.target.value, prescription })
            }}
          />
        </Field>
        <Field label="Workout / Warmup Notes">
          <TextArea
            rows={3}
            value={prescription.warmup}
            onChange={(event) =>
              setPrescription({ ...prescription, warmup: event.target.value })
            }
          />
        </Field>
      </Card>

      <div className="space-y-4">
        {!readOnly ? (
          <>
            <p className="text-sm text-muted">
              Use the plus buttons to add a movement in that spot. Use Move up and Move down to
              change order.
            </p>
            {renderSlot('start', 0, 'Add movement at the start')}
          </>
        ) : null}
        {prescription.exercises.map((exercise, index) => (
          <div key={`${exercise.movementId}-${index}`} className="space-y-4">
            <SessionExerciseEditor
              exercise={exercise}
              index={index}
              count={prescription.exercises.length}
              clientName={clientName}
              history={movementHistory[exercise.movementId]}
              historyLoading={movementHistoryLoading}
              historyError={movementHistoryError}
              onPatch={(patch) => patchExercise(index, patch)}
              onMove={(direction) => moveExercise(index, direction)}
              onSaveDefault={() => void saveMovementDefault(exercise, index)}
              saveDefaultStatus={defaultSaveStatus[String(index)] ?? 'idle'}
              readOnly={readOnly}
              groupSize={
                exercise.supersetGroup?.trim()
                  ? prescription.exercises.filter(
                      (item) => item.supersetGroup?.trim() === exercise.supersetGroup?.trim(),
                    ).length
                  : 1
              }
              onSupersetOrder={(order) =>
                setPrescription({
                  ...prescription,
                  exercises: placeInSupersetOrder(prescription.exercises, index, order),
                })
              }
              onRemove={() => removeExercise(index)}
            />
            {!readOnly
              ? renderSlot(
                  `after-${index}`,
                  index + 1,
                  index === prescription.exercises.length - 1
                    ? 'Add movement at the end'
                    : 'Add movement here',
                )
              : null}
          </div>
        ))}
      </div>
    </fieldset>
  )
}

export function SessionPrescriptionTable({
  name,
  prescription,
  readOnly = false,
  onChange,
}: {
  name: string
  prescription: Prescription
  readOnly?: boolean
  onChange: (next: { name: string; prescription: Prescription }) => void
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<ExerciseDropTarget | null>(null)
  const setExercises = (exercises: PrescribedExercise[]) => {
    onChange({ name, prescription: { ...prescription, exercises } })
  }
  const patchExercise = (index: number, patch: Partial<PrescribedExercise>) => {
    const exercises = prescription.exercises.map((exercise, exerciseIndex) =>
      exerciseIndex === index ? { ...exercise, ...patch } : exercise,
    )
    setExercises(exercises)
  }
  const changeMethod = (index: number, method: SetMethod) => {
    const exercise = prescription.exercises[index]
    if (!exercise) return
    const quantities = quantityDefaultsForMethod(method)
    patchExercise(index, {
      method,
      ...quantities,
      ...(!allowsPerRepTempo(method) ? { tempoMode: 'default' as const, tempoPerRep: [] } : {}),
      ...(!showsRepsField(method) ? { perSetEnabled: false, setPrescriptions: [] } : {}),
    })
  }
  const finishDrop = (target: ExerciseDropTarget) => {
    if (draggedIndex == null) return
    setExercises(
      arrangeExerciseDrop(
        prescription.exercises,
        draggedIndex,
        target,
        nextSupersetGroup(prescription.exercises),
      ),
    )
    setDraggedIndex(null)
    setDropTarget(null)
    setExpandedIndex(null)
  }

  const blocks = exerciseBlocks(prescription.exercises)
  const nextGroup = nextSupersetGroup(prescription.exercises)
  type Tagged = PrescribedExercise & { dragId: number }
  const tagged = prescription.exercises.map((exercise, index) => ({
    ...exercise,
    dragId: index,
  }))
  const previewExercises =
    !readOnly && draggedIndex != null && dropTarget?.kind === 'row'
      ? arrangeExerciseDrop(tagged, draggedIndex, dropTarget, nextGroup)
      : null
  const previewById = new Map(
    (previewExercises as Tagged[] | null)?.map((exercise) => [exercise.dragId, exercise]) ?? [],
  )
  const previewTarget =
    dropTarget?.kind === 'row' ? previewById.get(dropTarget.index) : null
  const previewGroup = previewTarget ? supersetGroupKey(previewTarget) : null
  const columnCount = readOnly ? 9 : 10
  const canDrag = !readOnly

  const renderDropLine = (index: number) => {
    if (!canDrag) return null
    const active = dropTarget?.kind === 'line' && dropTarget.index === index
    return (
      <tr key={`drop-line-${index}`} className="h-2">
        <td
          colSpan={columnCount}
          className="p-0"
          onDragOver={(event) => {
            if (draggedIndex == null) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropTarget({ kind: 'line', index })
          }}
          onDrop={(event) => {
            event.preventDefault()
            finishDrop({ kind: 'line', index })
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
    <fieldset disabled={readOnly} className="space-y-4">
      <Card className="space-y-4">
        <Field label="Workout name">
          <TextInput
            value={name}
            onChange={(event) => onChange({ name: event.target.value, prescription })}
          />
        </Field>
        <Field label="Workout / Warmup Notes">
          <TextArea
            rows={3}
            value={prescription.warmup}
            onChange={(event) =>
              onChange({
                name,
                prescription: { ...prescription, warmup: event.target.value },
              })
            }
          />
        </Field>
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[68rem] border-collapse text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="relative w-28 px-3 py-3 font-medium">
                <span className="flex items-center gap-1.5">
                  Block
                  {canDrag ? <BlockDragHelp /> : null}
                </span>
              </th>
              <th className="min-w-52 px-3 py-3 font-medium">Movement</th>
              <th className="w-36 px-3 py-3 font-medium">Category</th>
              <th className="w-40 px-3 py-3 font-medium">Method</th>
              <th className="w-20 px-3 py-3 font-medium">Sets</th>
              <th className="w-24 px-3 py-3 font-medium">Target</th>
              <th className="w-40 px-3 py-3 font-medium">Load</th>
              <th className="w-24 px-3 py-3 font-medium">Rest</th>
              <th className="min-w-48 px-3 py-3 font-medium">Notes</th>
              {!readOnly ? <th className="w-24 px-3 py-3 font-medium">Details</th> : null}
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, blockIndex) => {
              const group = supersetGroupKey(block[0]!)
              const blockStart = blocks
                .slice(0, blockIndex)
                .reduce((sum, item) => sum + item.length, 0)

              return block.map((exercise, offset) => {
                const index = prescription.exercises.indexOf(exercise)
                const rowTargeted = dropTarget?.kind === 'row' && dropTarget.index === index
                const previewExercise = previewById.get(index)
                const previewed =
                  Boolean(previewGroup) &&
                  supersetGroupKey(previewExercise ?? exercise) === previewGroup
                const displayGroup = previewed ? supersetGroupKey(previewExercise!) : group
                const displayOrder = previewed
                  ? previewExercise!.supersetOrder
                  : exercise.supersetOrder
                return (
                  <Fragment key={`${exercise.movementId}-${index}`}>
                    {renderDropLine(blockStart + offset)}
                    <tr
                      className={`border-b border-line align-top last:border-b-0 ${
                        rowTargeted
                          ? 'bg-lime/5 outline outline-1 -outline-offset-1 outline-lime'
                          : ''
                      } ${draggedIndex === index ? 'opacity-50' : ''}`}
                      onDragOver={(event) => {
                        if (!canDrag || draggedIndex == null || draggedIndex === index) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        setDropTarget({ kind: 'row', index })
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setDropTarget((current) =>
                            current?.kind === 'row' && current.index === index ? null : current,
                          )
                        }
                      }}
                      onDrop={(event) => {
                        if (!canDrag) return
                        event.preventDefault()
                        finishDrop({ kind: 'row', index })
                      }}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {canDrag ? (
                            <button
                              type="button"
                              draggable
                              className="cursor-grab select-none rounded-lg px-2 py-2 text-base leading-none text-muted hover:bg-panel hover:text-white active:cursor-grabbing"
                              aria-label={`Drag ${exercise.movementName}`}
                              title="Drag movement to reorder or create a superset"
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', String(index))
                                setDraggedIndex(index)
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                                event.preventDefault()
                                const direction = event.key === 'ArrowUp' ? -1 : 1
                                setExercises(
                                  moveExerciseBlock(prescription.exercises, blockIndex, direction),
                                )
                              }}
                              onDragEnd={() => {
                                setDraggedIndex(null)
                                setDropTarget(null)
                              }}
                            >
                              ⋮⋮
                            </button>
                          ) : null}
                          <span className={`font-medium ${previewed ? 'text-lime' : ''}`}>
                            {displayGroup
                              ? `${displayGroup}${displayOrder ?? offset + 1}`
                              : blockIndex + 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium">{exercise.movementName}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={exercise.category ?? 'accessory'}
                      onChange={(event) =>
                        patchExercise(index, {
                          category: event.target.value as ExerciseCategory,
                        })
                      }
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={exercise.method}
                      onChange={(event) => changeMethod(index, event.target.value as SetMethod)}
                    >
                      {METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <NumericTextInput
                      value={exercise.setCount}
                      onChange={(event) =>
                        patchExercise(index, {
                          setCount: event.target.value ? Number(event.target.value) : 0,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {showsRepsField(exercise.method) ? (
                      <NumericTextInput
                        aria-label={quantityLabel(exercise.method)}
                        value={exercise.repsMin ?? ''}
                        onChange={(event) =>
                          patchExercise(index, {
                            repsMin: event.target.value ? Number(event.target.value) : 0,
                          })
                        }
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TextInput
                      value={exercise.loadPrescription ?? ''}
                      onChange={(event) =>
                        patchExercise(index, {
                          loadPrescription: event.target.value || null,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <NumericTextInput
                      aria-label="Rest after set"
                      value={exercise.restAfterSetSeconds ?? ''}
                      onChange={(event) =>
                        patchExercise(index, {
                          restAfterSetSeconds: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TextInput
                      value={exercise.notes ?? ''}
                      onChange={(event) =>
                        patchExercise(index, { notes: event.target.value || null })
                      }
                    />
                  </td>
                  {!readOnly ? (
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setExpandedIndex(expandedIndex === index ? null : index)
                        }
                      >
                        {expandedIndex === index ? 'Close' : 'Open'}
                      </Button>
                    </td>
                  ) : null}
                </tr>
                    {!readOnly && expandedIndex === index ? (
                      <tr className="border-b border-line bg-ink/25">
                        <td colSpan={columnCount} className="p-3">
                          <SessionExerciseEditor
                            exercise={exercise}
                            index={index}
                            count={prescription.exercises.length}
                            historyLoading={false}
                            historyError={null}
                            onPatch={(patch) => patchExercise(index, patch)}
                            onMove={() => undefined}
                            onSaveDefault={() => undefined}
                            onRemove={undefined}
                            structureControls={false}
                            showHistory={false}
                            showSaveDefault={false}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            })}
            {canDrag ? renderDropLine(prescription.exercises.length) : null}
          </tbody>
        </table>
      </div>
    </fieldset>
  )
}

export function MovementDefaultsEditorCard({
  exercise,
  onChange,
  onSave,
  onDelete,
  saveStatus = 'idle',
}: {
  exercise: PrescribedExercise
  onChange: (exercise: PrescribedExercise) => void
  onSave: () => void
  onDelete?: () => void
  saveStatus?: SaveDefaultStatus
}) {
  return (
    <SessionExerciseEditor
      exercise={exercise}
      index={0}
      count={1}
      historyLoading={false}
      historyError={null}
      onPatch={(patch) => onChange({ ...exercise, ...patch })}
      onMove={() => undefined}
      onSaveDefault={onSave}
      saveDefaultStatus={saveStatus}
      onRemove={onDelete}
      structureControls={false}
      showHistory={false}
      saveLabel="Save changes"
      removeLabel="Remove default"
      removeQuestion="Remove these saved defaults?"
    />
  )
}

function SessionExerciseEditor({
  exercise: ex,
  index,
  count,
  clientName,
  history,
  historyLoading,
  historyError,
  onPatch,
  onMove,
  onSaveDefault,
  saveDefaultStatus = 'idle',
  readOnly = false,
  groupSize = 1,
  onSupersetOrder,
  onRemove,
  structureControls = true,
  showHistory = true,
  showSaveDefault = true,
  saveLabel = 'save config as default',
  removeLabel = 'Remove',
  removeQuestion = 'Remove this movement?',
}: {
  exercise: PrescribedExercise
  index: number
  count: number
  clientName?: string
  history?: ExerciseHistoryEntry[]
  historyLoading: boolean
  historyError: string | null
  onPatch: (patch: Partial<PrescribedExercise>) => void
  onMove: (direction: -1 | 1) => void
  onSaveDefault: () => void
  saveDefaultStatus?: SaveDefaultStatus
  readOnly?: boolean
  groupSize?: number
  onSupersetOrder?: (order: number) => void
  onRemove?: () => void
  structureControls?: boolean
  showHistory?: boolean
  showSaveDefault?: boolean
  saveLabel?: string
  removeLabel?: string
  removeQuestion?: string
}) {
  const [tempoOpen, setTempoOpen] = useState(() => hasConfiguredTempo(ex))
  const isRange = ex.method === 'reps_range'
  const showReps = showsRepsField(ex.method)
  const allowPerRep = allowsPerRepTempo(ex.method)
  const tempoMode: TempoMode =
    allowPerRep && ex.tempoMode === 'per_rep' ? 'per_rep' : 'default'

  const setCount = (value: number) => {
    const countValue = Math.max(0, value)
    onPatch({
      setCount: countValue,
      ...(ex.perSetEnabled
        ? {
            setPrescriptions: resizeSetPrescriptions(
              ex.setPrescriptions,
              countValue,
              fallbackSetPrescription(ex),
            ),
          }
        : {}),
    })
  }

  const changeMethod = (method: SetMethod) => {
    const quantities = quantityDefaultsForMethod(method)
    const patch: Partial<PrescribedExercise> = { method, ...quantities }
    if (!allowsPerRepTempo(method)) {
      patch.tempoMode = 'default'
      patch.tempoPerRep = []
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
    onPatch(patch)
  }

  const setPerSet = (enabled: boolean) =>
    onPatch({
      perSetEnabled: enabled,
      setPrescriptions: enabled
        ? resizeSetPrescriptions(ex.setPrescriptions, ex.setCount, fallbackSetPrescription(ex))
        : [],
    })

  const patchSet = (setIndex: number, patch: Partial<SetPrescription>) => {
    const sets = resizeSetPrescriptions(
      ex.setPrescriptions,
      ex.setCount,
      fallbackSetPrescription(ex),
    )
    sets[setIndex] = { ...sets[setIndex]!, ...patch }
    onPatch({ setPrescriptions: sets })
  }

  const equipmentUnset = !ex.equipment
  const equipmentField = (
    <Field label={equipmentUnset ? 'Equipment' : 'Equipment override'}>
      <Select
        value={ex.equipment ?? ''}
        onChange={(event) =>
          onPatch({ equipment: (event.target.value || null) as Equipment | null })
        }
      >
        <option value="">—</option>
        {EQUIPMENT.map((equipment) => (
          <option key={equipment.value} value={equipment.value}>
            {equipment.label}
          </option>
        ))}
      </Select>
    </Field>
  )

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">
            {structureControls ? `${index + 1}. ` : null}
            {ex.movementName}
          </p>
          <p className="text-xs uppercase text-muted">
            {CATEGORIES.find((category) => category.value === ex.category)?.label ?? 'Accessory'}
          </p>
        </div>
        {!readOnly && (structureControls || showSaveDefault || onRemove) ? (
          <div className="flex flex-wrap gap-2">
          {structureControls ? (
            <>
              <Button type="button" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)}>
                Move up
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={index === count - 1}
                onClick={() => onMove(1)}
              >
                Move down
              </Button>
            </>
          ) : null}
          {showSaveDefault ? (
            <SaveDefaultButton
              status={saveDefaultStatus}
              onClick={onSaveDefault}
              label={saveLabel}
            />
          ) : null}
          {onRemove ? (
            <ConfirmButton onConfirm={onRemove} question={removeQuestion}>
              {removeLabel}
            </ConfirmButton>
          ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select
            value={ex.category ?? 'accessory'}
            onChange={(event) =>
              onPatch({ category: event.target.value as ExerciseCategory })
            }
          >
            {CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Method">
          <Select
            value={ex.method}
            onChange={(event) => changeMethod(event.target.value as SetMethod)}
          >
            {METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {equipmentUnset ? equipmentField : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sets">
          <NumericTextInput
            min={0}
            value={ex.setCount}
            onChange={(event) => setCount(Number(event.target.value))}
          />
        </Field>
        {showReps && !isRange && (
          <Field label={quantityLabel(ex.method)}>
            <NumericTextInput
              key={ex.method}
              value={ex.repsMin}
              onChange={(event) => onPatch({ repsMin: Number(event.target.value), repsMax: null })}
            />
          </Field>
        )}
        {showReps && isRange && (
          <>
            <Field label="Reps min">
              <NumericTextInput
                key={`${ex.method}-min`}
                value={ex.repsMin}
                onChange={(event) => onPatch({ repsMin: Number(event.target.value) })}
              />
            </Field>
            <Field label="Reps max">
              <NumericTextInput
                key={`${ex.method}-max`}
                value={ex.repsMax ?? ''}
                onChange={(event) =>
                  onPatch({
                    repsMax: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
            </Field>
          </>
        )}
      </div>

      {showReps && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
          <div>
            <p className="text-sm font-medium">Set-specific targets</p>
            <p className="text-xs text-muted">Use different reps or load for each set.</p>
          </div>
          <Toggle value={Boolean(ex.perSetEnabled)} onChange={setPerSet} />
        </div>
      )}

      {showReps && ex.perSetEnabled ? (
        <div className="space-y-3 rounded-xl border border-line p-3">
          {resizeSetPrescriptions(
            ex.setPrescriptions,
            ex.setCount,
            fallbackSetPrescription(ex),
          ).map((set, setIndex) => (
            <div key={setIndex} className="grid gap-3 border-b border-line pb-3 last:border-0 last:pb-0 sm:grid-cols-3">
              <Field label={`Set ${setIndex + 1} ${isRange ? 'min' : quantityLabel(ex.method)}`}>
                <NumericTextInput
                  key={`${ex.method}-${setIndex}-min`}
                  value={set.repsMin}
                  onChange={(event) => patchSet(setIndex, { repsMin: Number(event.target.value) })}
                />
              </Field>
              {isRange && (
                <Field label="Max reps">
                  <NumericTextInput
                    key={`${ex.method}-${setIndex}-max`}
                    value={set.repsMax ?? ''}
                    onChange={(event) =>
                      patchSet(setIndex, {
                        repsMax: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </Field>
              )}
              <Field label="Prescribed load">
                <TextInput
                  value={set.loadPrescription ?? ''}
                  onChange={(event) =>
                    patchSet(setIndex, { loadPrescription: event.target.value || null })
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      ) : (
        <Field label="Prescribed load">
          <TextInput
            value={ex.loadPrescription ?? ''}
            onChange={(event) => onPatch({ loadPrescription: event.target.value || null })}
          />
        </Field>
      )}
      {showHistory ? (
        <MovementHistoryContext
          movementName={ex.movementName}
          clientName={clientName}
          entries={history}
          loading={historyLoading}
          error={historyError}
          showSelectPrompt
        />
      ) : null}

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
                    onChange={(mode) =>
                      onPatch(
                        mode === 'per_rep'
                          ? {
                              tempoMode: mode,
                              tempoPerRep: resizeTempoPerRep(ex.tempoPerRep, tempoRepCount(ex)),
                            }
                          : { tempoMode: mode, tempoPerRep: [] },
                      )
                    }
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  setTempoOpen(false)
                  onPatch({
                    tempo: {},
                    tempoMode: 'default',
                    tempoPerRep: [],
                  })
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
                      onChange={(next) => {
                        const tempos = resizeTempoPerRep(ex.tempoPerRep, tempoRepCount(ex))
                        tempos[repIndex] = next
                        onPatch({ tempoPerRep: tempos })
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <TempoFields value={ex.tempo ?? {}} onChange={(tempo) => onPatch({ tempo })} />
            )}
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {structureControls ? (
          <>
            <Field label="Superset group">
              <TextInput
                value={ex.supersetGroup ?? ''}
                placeholder="None"
                onChange={(event) => onPatch({ supersetGroup: event.target.value || null })}
              />
            </Field>
            <Field label="Order in group">
              <Select
                value={String(ex.supersetOrder ?? 1)}
                onChange={(event) => onSupersetOrder?.(Number(event.target.value))}
              >
                {supersetOrderOptions(groupSize, ex.supersetOrder ?? null).map((order) => (
                  <option key={order} value={order}>
                    {order}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}
        <Field label="Rest after set (s)">
          <NumericTextInput
            value={ex.restAfterSetSeconds ?? ''}
            onChange={(event) =>
              onPatch({
                restAfterSetSeconds: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="Rest after movement (s)">
          <NumericTextInput
            value={ex.restAfterExerciseSeconds ?? ''}
            onChange={(event) =>
              onPatch({
                restAfterExerciseSeconds: event.target.value
                  ? Number(event.target.value)
                  : null,
              })
            }
          />
        </Field>
      </div>

      {equipmentUnset ? null : equipmentField}
      <Field label="YouTube link">
        <TextInput
          value={ex.youtubeUrl ?? ''}
          onChange={(event) => onPatch({ youtubeUrl: event.target.value || null })}
        />
      </Field>
      <Field label="Notes">
        <TextArea
          rows={2}
          value={ex.notes ?? ''}
          onChange={(event) => onPatch({ notes: event.target.value || null })}
        />
      </Field>
    </Card>
  )
}
