import { useEffect, useMemo, useState } from 'react'
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
  ModeToggle,
  TempoFields,
  Toggle,
} from './WorkoutEditorControls.tsx'
import {
  CATEGORIES,
  EQUIPMENT,
  METHODS,
  allowsPerRepTempo,
  fallbackSetPrescription,
  movementDefaults,
  quantityDefaultsForMethod,
  quantityLabel,
  resettleSuperset,
  resizeSetPrescriptions,
  resizeTempoPerRep,
  showsRepsField,
  tempoRepCount,
} from './WorkoutEditorUtils.ts'
import { api } from '../lib/api.ts'
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
  const defaults = movementDefaults(movement)
  return {
    movementId: movement.id,
    movementName: movement.name,
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
    supersetGroup: null,
    supersetOrder: null,
    notes: null,
    youtubeUrl: movement.youtubeUrl,
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
  onChange,
}: {
  name: string
  prescription: Prescription
  movements: Movement[]
  clientName?: string
  movementHistory?: MovementHistoryById
  movementHistoryLoading?: boolean
  movementHistoryError?: string | null
  onChange: (next: { name: string; prescription: Prescription }) => void
}) {
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [catalog, setCatalog] = useState(movements)
  const sortedMovements = useMemo(
    () => [...catalog].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog],
  )

  useEffect(() => {
    setCatalog(movements)
  }, [movements])

  const setPrescription = (next: Prescription) => onChange({ name, prescription: next })
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
  const insertExercise = (index: number, movement: Movement) => {
    const exercises = [...prescription.exercises]
    exercises.splice(index, 0, newExercise(movement))
    setPrescription({ ...prescription, exercises })
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
    insertExercise(index, movement)
  }
  const renderSlot = (key: string, index: number, label: string) => (
    <AddMovementSlot
      key={key}
      label={label}
      movements={sortedMovements}
      open={openSlot === key}
      onOpen={() => setOpenSlot(key)}
      onCancel={() => setOpenSlot(null)}
      onSelect={(movement) => insertExercise(index, movement)}
      onCreate={(name, category, equipment) =>
        void createAndInsert(index, name, category, equipment)
      }
    />
  )

  return (
    <div className="space-y-4">
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
              setPrescription({ ...prescription, warmup: event.target.value })
            }
          />
        </Field>
      </Card>

      <div className="space-y-4">
        <p className="text-sm text-muted">
          Use the plus buttons to add a movement in that spot. Use Move up and Move down to change
          order.
        </p>
        {renderSlot('start', 0, 'Add movement at the start')}
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
              onRemove={() => removeExercise(index)}
            />
            {renderSlot(
              `after-${index}`,
              index + 1,
              index === prescription.exercises.length - 1
                ? 'Add movement at the end'
                : 'Add movement here',
            )}
          </div>
        ))}
      </div>
    </div>
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
  onRemove,
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
  onRemove: () => void
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
            {index + 1}. {ex.movementName}
          </p>
          <p className="text-xs uppercase text-muted">
            {CATEGORIES.find((category) => category.value === ex.category)?.label ?? 'Accessory'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <ConfirmButton onConfirm={onRemove} question="Remove this movement?">
            Remove
          </ConfirmButton>
        </div>
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
      <MovementHistoryContext
        movementName={ex.movementName}
        clientName={clientName}
        entries={history}
        loading={historyLoading}
        error={historyError}
        showSelectPrompt
      />

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
        <Field label="Superset group">
          <TextInput
            value={ex.supersetGroup ?? ''}
            placeholder="None"
            onChange={(event) => onPatch({ supersetGroup: event.target.value || null })}
          />
        </Field>
        <Field label="Order in group">
          <NumericTextInput
            value={ex.supersetOrder ?? ''}
            onChange={(event) =>
              onPatch({
                supersetOrder: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </Field>
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
