import { useMemo, useState } from 'react'
import { Button, Card, Field, NumericTextInput, Select, TextArea, TextInput } from './ui.tsx'
import {
  ModeToggle,
  TempoFields,
  Toggle,
} from './WorkoutEditorControls.tsx'
import {
  CATEGORIES,
  METHODS,
  allowsPerRepTempo,
  fallbackSetPrescription,
  quantityLabel,
  resizeSetPrescriptions,
  resizeTempoPerRep,
  showsRepsField,
  tempoRepCount,
} from './WorkoutEditorUtils.ts'
import type {
  Equipment,
  ExerciseCategory,
  Movement,
  PrescribedExercise,
  Prescription,
  SetMethod,
  SetPrescription,
  TempoMode,
} from '../../shared/types.ts'

const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'other', label: 'Other' },
]

function newExercise(movement: Movement): PrescribedExercise {
  return {
    movementId: movement.id,
    movementName: movement.name,
    variantId: movement.variants[0]?.id ?? null,
    equipment: movement.variants[0]?.equipment ?? null,
    setCount: 3,
    repsMin: 8,
    repsMax: null,
    perSetEnabled: false,
    setPrescriptions: [],
    method: 'straight',
    methodTarget: null,
    category: 'accessory',
    loadPrescription: null,
    tempo: {},
    tempoMode: 'default',
    tempoPerRep: [],
    restAfterSetSeconds: 90,
    restAfterExerciseSeconds: 120,
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
  onChange,
}: {
  name: string
  prescription: Prescription
  movements: Movement[]
  onChange: (next: { name: string; prescription: Prescription }) => void
}) {
  const [movementId, setMovementId] = useState('')
  const sortedMovements = useMemo(
    () => [...movements].sort((a, b) => a.name.localeCompare(b.name)),
    [movements],
  )

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

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Field label="Workout name">
          <TextInput
            value={name}
            onChange={(event) => onChange({ name: event.target.value, prescription })}
          />
        </Field>
        <Field label="Custom warmup">
          <TextArea
            rows={3}
            value={prescription.warmup}
            onChange={(event) =>
              setPrescription({ ...prescription, warmup: event.target.value })
            }
          />
        </Field>
      </Card>

      {prescription.exercises.map((exercise, index) => (
        <SessionExerciseEditor
          key={`${exercise.movementId}-${index}`}
          exercise={exercise}
          index={index}
          count={prescription.exercises.length}
          onPatch={(patch) => patchExercise(index, patch)}
          onMove={(direction) => moveExercise(index, direction)}
          onRemove={() =>
            setPrescription({
              ...prescription,
              exercises: prescription.exercises.filter((_, i) => i !== index),
            })
          }
        />
      ))}

      <Card className="space-y-3">
        <h2 className="font-semibold">Add movement</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={movementId} onChange={(event) => setMovementId(event.target.value)}>
            <option value="">Choose a movement…</option>
            {sortedMovements.map((movement) => (
              <option key={movement.id} value={movement.id}>
                {movement.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            className="shrink-0"
            disabled={!movementId}
            onClick={() => {
              const movement = movements.find((item) => item.id === movementId)
              if (!movement) return
              setPrescription({
                ...prescription,
                exercises: [...prescription.exercises, newExercise(movement)],
              })
              setMovementId('')
            }}
          >
            Add movement
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SessionExerciseEditor({
  exercise: ex,
  index,
  count,
  onPatch,
  onMove,
  onRemove,
}: {
  exercise: PrescribedExercise
  index: number
  count: number
  onPatch: (patch: Partial<PrescribedExercise>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
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
    const patch: Partial<PrescribedExercise> = { method }
    if (method === 'reps_range') {
      patch.repsMax = ex.repsMax ?? ex.repsMin
    } else {
      patch.repsMax = null
    }
    if (method === 'timed' && ex.method !== 'timed') patch.repsMin = 30
    if (!allowsPerRepTempo(method)) {
      patch.tempoMode = 'default'
      patch.tempoPerRep = []
    }
    if (!showsRepsField(method)) {
      patch.perSetEnabled = false
      patch.setPrescriptions = []
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
          <Button type="button" variant="danger" onClick={onRemove}>
            Remove
          </Button>
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
              value={ex.repsMin}
              onChange={(event) => onPatch({ repsMin: Number(event.target.value), repsMax: null })}
            />
          </Field>
        )}
        {showReps && isRange && (
          <>
            <Field label="Reps min">
              <NumericTextInput
                value={ex.repsMin}
                onChange={(event) => onPatch({ repsMin: Number(event.target.value) })}
              />
            </Field>
            <Field label="Reps max">
              <NumericTextInput
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
                  value={set.repsMin}
                  onChange={(event) => patchSet(setIndex, { repsMin: Number(event.target.value) })}
                />
              </Field>
              {isRange && (
                <Field label="Max reps">
                  <NumericTextInput
                    value={set.repsMax ?? ''}
                    onChange={(event) =>
                      patchSet(setIndex, {
                        repsMax: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </Field>
              )}
              <Field label="Prescribed load (lb)">
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
        <Field label="Prescribed load (lb)">
          <TextInput
            value={ex.loadPrescription ?? ''}
            onChange={(event) => onPatch({ loadPrescription: event.target.value || null })}
          />
        </Field>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

      <Field label="Equipment override">
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
