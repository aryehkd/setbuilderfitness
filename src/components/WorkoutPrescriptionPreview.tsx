import { Fragment } from 'react'
import { Card, TextInput } from './ui.tsx'
import {
  PrescribedExerciseCard,
  RestAfterMovement,
  SupersetFrame,
  groupBySuperset,
  setTarget,
} from './PrescribedExerciseCard.tsx'
import type { PrescribedExercise } from '../../shared/types.ts'

function DisabledSetRows({ exercise }: { exercise: PrescribedExercise }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: Math.max(0, exercise.setCount) }, (_, setIndex) => {
        const target = exercise.perSetEnabled ? setTarget(exercise, setIndex) : null
        const quantity = exercise.method === 'timed' ? 'Seconds' : 'Reps'
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
                placeholder={exercise.perSetEnabled ? (target ?? quantity) : quantity}
                disabled
                value=""
                readOnly
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function WorkoutPrescriptionPreview({
  warmup,
  exercises,
  showSetRows = false,
}: {
  warmup?: string
  exercises: PrescribedExercise[]
  /** Mirrors the client logging grid with inputs disabled, as the client view does. */
  showSetRows?: boolean
}) {
  return (
    <div className="space-y-4">
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
          const cards = block.items.map(({ exercise: ex }, index) => (
            <Fragment key={`${ex.movementId}-${block.group ?? 'single'}-${index}`}>
              <PrescribedExerciseCard exercise={ex}>
                {showSetRows ? <DisabledSetRows exercise={ex} /> : null}
              </PrescribedExerciseCard>
              <RestAfterMovement seconds={ex.restAfterExerciseSeconds} />
            </Fragment>
          ))
          if (!block.group) {
            return <Fragment key={block.items[0]!.exercise.movementId}>{cards}</Fragment>
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
