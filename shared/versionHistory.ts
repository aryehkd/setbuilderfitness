import type {
  PrescribedExercise,
  Prescription,
  TemplateExercise,
  Tempo,
  VersionHistoryEvent,
} from './types.ts'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type HistoryExercise = {
  id?: string
  movementId: string
  movementName: string
  setCount: number
  repsMin: number
  repsMax: number | null
  method: string
  methodTarget: number | null
  load: string
  notes: string
  restSet: number | null
  restAfter: number | null
  tempo: string
  superset: string
  index: number
}

export function assignedEvent(name: string, at = new Date().toISOString()): VersionHistoryEvent {
  return { type: 'assigned', name, at }
}

export function editEvents(texts: string[], at = new Date().toISOString()): VersionHistoryEvent[] {
  return texts.filter(Boolean).map((text) => ({ type: 'edit' as const, text, at }))
}

export function parseVersionHistory(value: unknown): VersionHistoryEvent[] {
  if (!Array.isArray(value)) return []
  const events: VersionHistoryEvent[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const event = item as Record<string, unknown>
    const at = typeof event.at === 'string' ? event.at : ''
    if (event.type === 'assigned' && typeof event.name === 'string') {
      events.push({ type: 'assigned', name: event.name, at })
    } else if (event.type === 'edit' && typeof event.text === 'string') {
      events.push({ type: 'edit', text: event.text, at })
    }
  }
  return events
}

export function formatHistoryTimestamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatVersionHistory(events: VersionHistoryEvent[]) {
  const lines: string[] = []
  let awaitingEdits = false
  for (const event of events) {
    if (event.type === 'assigned') {
      if (lines.length) lines.push('')
      lines.push(`Workout assigned: ${event.name}`)
      lines.push(`date/time : ${formatHistoryTimestamp(event.at)}`)
      awaitingEdits = true
      continue
    }
    if (awaitingEdits) {
      lines.push('Trainer edited after assignment:')
      awaitingEdits = false
    } else if (lines.length === 0) {
      lines.push('Trainer edited after assignment:')
    }
    lines.push(`- ${event.text} (${formatHistoryTimestamp(event.at)})`)
  }
  return lines.join('\n')
}

function tempoLabel(tempo?: Tempo | null, mode?: string | null, perRep?: Tempo[] | null) {
  if (mode === 'per_rep') return 'per-rep tempo'
  const parts = [
    tempo?.eccentric ?? null,
    tempo?.pauseBottom ?? null,
    tempo?.concentric ?? null,
    tempo?.pauseTop ?? null,
  ]
  if (parts.every((part) => part == null) && !perRep?.length) return ''
  if (parts.every((part) => part == null)) return 'tempo'
  return parts.map((part) => (part == null ? '–' : String(part))).join('-')
}

function setsLabel(ex: HistoryExercise) {
  if (ex.method === 'timed') {
    return ex.methodTarget != null ? `${ex.setCount}x${ex.methodTarget}s` : `${ex.setCount}x timed`
  }
  if (ex.method === 'amrap') return `${ex.setCount}x AMRAP`
  if (ex.method === 'to_failure') return `${ex.setCount}x failure`
  const reps =
    ex.repsMax != null && ex.repsMax !== ex.repsMin ? `${ex.repsMin}-${ex.repsMax}` : String(ex.repsMin)
  return `${ex.setCount}x${reps}`
}

export function historyExerciseFromTemplate(ex: TemplateExercise, index: number): HistoryExercise {
  return {
    id: ex.id,
    movementId: ex.movementId,
    movementName: ex.movementName || 'movement',
    setCount: ex.setCount,
    repsMin: ex.repsMin,
    repsMax: ex.repsMax,
    method: ex.method,
    methodTarget: ex.methodTarget,
    load: ex.loadPrescription?.trim() || '',
    notes: ex.notes?.trim() || '',
    restSet: ex.restAfterSetSeconds,
    restAfter: ex.restAfterExerciseSeconds,
    tempo: tempoLabel(
      {
        eccentric: ex.tempoEccentric,
        pauseBottom: ex.tempoPauseBottom,
        concentric: ex.tempoConcentric,
        pauseTop: ex.tempoPauseTop,
      },
      ex.tempoMode,
      ex.tempoPerRep,
    ),
    superset: ex.supersetGroup?.trim()
      ? `${ex.supersetGroup}${ex.supersetOrder ?? ''}`
      : '',
    index,
  }
}

export function historyExerciseFromPrescribed(
  ex: PrescribedExercise,
  index: number,
): HistoryExercise {
  return {
    movementId: ex.movementId,
    movementName: ex.movementName || 'movement',
    setCount: ex.setCount,
    repsMin: ex.repsMin,
    repsMax: ex.repsMax ?? null,
    method: ex.method,
    methodTarget: ex.methodTarget ?? null,
    load: ex.loadPrescription?.trim() || '',
    notes: ex.notes?.trim() || '',
    restSet: ex.restAfterSetSeconds ?? null,
    restAfter: ex.restAfterExerciseSeconds ?? null,
    tempo: tempoLabel(ex.tempo, ex.tempoMode, ex.tempoPerRep),
    superset: ex.supersetGroup?.trim()
      ? `${ex.supersetGroup}${ex.supersetOrder ?? ''}`
      : '',
    index,
  }
}

export function diffHistoryExercises(before: HistoryExercise[], after: HistoryExercise[]): string[] {
  const used = new Set<number>()
  const pairs: { before: HistoryExercise; after: HistoryExercise }[] = []
  const added: HistoryExercise[] = []
  const canMatchId = before.some((item) => item.id) && after.some((item) => item.id)

  for (const next of after) {
    const beforeIndex = before.findIndex((item, index) => {
      if (used.has(index)) return false
      if (canMatchId && next.id && item.id) return item.id === next.id
      return item.movementId === next.movementId
    })
    if (beforeIndex === -1) {
      added.push(next)
      continue
    }
    used.add(beforeIndex)
    pairs.push({ before: before[beforeIndex]!, after: next })
  }

  const lines: string[] = []
  before.forEach((item, index) => {
    if (!used.has(index)) lines.push(`Removed ${item.movementName}`)
  })
  for (const item of added) lines.push(`Added ${item.movementName}`)

  for (const pair of pairs) {
    const name = pair.after.movementName
    if (pair.before.index !== pair.after.index) {
      lines.push(`moved the order of ${name}`)
    }
    const beforeSets = setsLabel(pair.before)
    const afterSets = setsLabel(pair.after)
    if (beforeSets !== afterSets) {
      lines.push(`Changed ${name} from ${beforeSets} to ${afterSets}`)
    }
    if (pair.before.load !== pair.after.load) {
      lines.push(
        pair.after.load
          ? `Changed load on ${name} to ${pair.after.load}`
          : `Removed load from ${name}`,
      )
    }
    if (pair.before.notes !== pair.after.notes) {
      if (!pair.before.notes && pair.after.notes) lines.push(`Added note to ${name}`)
      else if (pair.before.notes && !pair.after.notes) lines.push(`Removed note from ${name}`)
      else lines.push(`Changed note on ${name}`)
    }
    if (pair.before.tempo !== pair.after.tempo) {
      lines.push(
        pair.after.tempo ? `Changed tempo on ${name} to ${pair.after.tempo}` : `Removed tempo from ${name}`,
      )
    }
    if (pair.before.restSet !== pair.after.restSet) {
      lines.push(`Changed rest between sets on ${name}`)
    }
    if (pair.before.restAfter !== pair.after.restAfter) {
      lines.push(`Changed rest after ${name}`)
    }
    if (pair.before.superset !== pair.after.superset) {
      lines.push(
        pair.after.superset
          ? `Changed ${name} superset to ${pair.after.superset}`
          : `Removed ${name} from its superset`,
      )
    }
    if (pair.before.method !== pair.after.method) {
      lines.push(`Changed method on ${name}`)
    }
  }
  return uniqueLines(lines)
}

export function diffTemplateMeta(before: {
  name: string
  notes: string | null
  warmup: string
}, after: { name: string; notes: string | null; warmup: string }) {
  const lines: string[] = []
  if (before.name !== after.name) lines.push(`Renamed workout from ${before.name} to ${after.name}`)
  if ((before.notes ?? '') !== (after.notes ?? '')) {
    lines.push(after.notes?.trim() ? 'Changed workout notes' : 'Removed workout notes')
  }
  if (before.warmup !== after.warmup) lines.push('Changed warmup notes')
  return lines
}

export function diffPrescriptions(before: Prescription, after: Prescription) {
  const lines: string[] = []
  if ((before.warmup ?? '') !== (after.warmup ?? '')) lines.push('Changed warmup notes')
  lines.push(
    ...diffHistoryExercises(
      (before.exercises ?? []).map(historyExerciseFromPrescribed),
      (after.exercises ?? []).map(historyExerciseFromPrescribed),
    ),
  )
  return uniqueLines(lines)
}

export function diffProgramPlacement(before: {
  weekIndex: number
  weekday: number
}, after: { weekIndex: number; weekday: number }) {
  if (before.weekIndex === after.weekIndex && before.weekday === after.weekday) return []
  return [
    `Moved to week ${after.weekIndex + 1}, ${WEEKDAYS[after.weekday] ?? `day ${after.weekday + 1}`}`,
  ]
}

function uniqueLines(lines: string[]) {
  return [...new Set(lines)]
}
