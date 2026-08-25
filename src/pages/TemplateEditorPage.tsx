import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Field, TextInput } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import type {
  Equipment,
  Movement,
  SetMethod,
  TemplateExercise,
  WarmupStep,
  WorkoutTemplate,
} from '../../shared/types.ts'

const METHODS: { value: SetMethod; label: string }[] = [
  { value: 'straight', label: 'Straight sets' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'rir', label: 'RIR' },
  { value: 'rpe', label: 'RPE' },
  { value: 'to_failure', label: 'To failure' },
]

function emptyExercise(movement: Movement, variant?: Movement['variants'][0]): Partial<TemplateExercise> {
  return {
    movementId: movement.id,
    movementName: movement.name,
    variantId: variant?.id ?? movement.variants[0]?.id ?? null,
    equipment: variant?.equipment ?? movement.variants[0]?.equipment ?? null,
    setCount: 3,
    repsMin: 8,
    repsMax: 10,
    method: 'straight',
    restAfterSetSeconds: 90,
    restAfterExerciseSeconds: 120,
    youtubeUrl: movement.youtubeUrl,
  }
}

export function TemplateEditorPage() {
  const { id } = useParams()
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movement[]>([])
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
    const handle = setTimeout(() => {
      void api<Movement[]>(`/api/movements?q=${encodeURIComponent(query)}`).then(setResults)
    }, 200)
    return () => clearTimeout(handle)
  }, [query])

  const warmup: WarmupStep[] = template?.warmup ?? []
  const exercises = useMemo(() => template?.exercises ?? [], [template])

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

  const addExercise = async (movement: Movement, variant?: Movement['variants'][0]) => {
    if (!id) return
    await api(`/api/templates/${id}/exercises`, {
      method: 'POST',
      body: JSON.stringify(emptyExercise(movement, variant)),
    })
    setQuery('')
    await load()
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

  if (!template) return <p className="p-6 text-muted">Loading workout…</p>

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <TextInput
          value={template.name}
          onChange={(e) => setTemplate({ ...template, name: e.target.value })}
          onBlur={() => void saveMeta({ name: template.name })}
          className="font-display text-2xl font-bold"
        />
        <span className="text-xs text-muted">{saving ? 'Saving…' : 'Saved'}</span>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">Custom warmup</h2>
        {warmup.map((step, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-4">
            <TextInput
              placeholder="Movement"
              value={step.name}
              onChange={(e) => {
                const next = warmup.map((s, idx) => (idx === i ? { ...s, name: e.target.value } : s))
                setTemplate({ ...template, warmup: next })
              }}
              onBlur={() => void saveMeta({ warmup })}
            />
            <TextInput
              placeholder="Sets"
              value={step.sets ?? ''}
              onChange={(e) => {
                const next = warmup.map((s, idx) =>
                  idx === i ? { ...s, sets: Number(e.target.value) || undefined } : s,
                )
                setTemplate({ ...template, warmup: next })
              }}
              onBlur={() => void saveMeta({ warmup })}
            />
            <TextInput
              placeholder="Reps"
              value={step.reps ?? ''}
              onChange={(e) => {
                const next = warmup.map((s, idx) =>
                  idx === i ? { ...s, reps: Number(e.target.value) || undefined } : s,
                )
                setTemplate({ ...template, warmup: next })
              }}
              onBlur={() => void saveMeta({ warmup })}
            />
            <Button
              variant="ghost"
              onClick={() => {
                const next = warmup.filter((_, idx) => idx !== i)
                setTemplate({ ...template, warmup: next })
                void saveMeta({ warmup: next })
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => {
            const next = [...warmup, { name: '' }]
            setTemplate({ ...template, warmup: next })
          }}
        >
          Add warmup step
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Add a movement</h2>
        <TextInput
          placeholder="Search bench press, squat…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="max-h-56 space-y-2 overflow-auto">
          {results.slice(0, 12).map((m) => (
            <li key={m.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted">{m.muscleGroups.join(', ')}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {m.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="rounded-lg bg-lime/15 px-2 py-1 text-xs text-lime"
                      onClick={() => void addExercise(m, v)}
                    >
                      {v.equipment}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        {exercises.map((ex, index) => (
          <Card key={ex.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {ex.supersetGroup
                    ? `${ex.supersetGroup}${ex.supersetOrder ?? index + 1} · `
                    : ''}
                  {ex.movementName}
                </div>
                <div className="text-xs uppercase text-muted">{ex.equipment}</div>
              </div>
              <Button variant="danger" onClick={() => void removeExercise(ex.id)}>
                Remove
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Sets">
                <TextInput
                  type="number"
                  value={ex.setCount}
                  onChange={(e) => patchExercise(ex.id, { setCount: Number(e.target.value) })}
                  onBlur={(e) =>
                    patchExercise(ex.id, { setCount: Number(e.target.value) }, true)
                  }
                />
              </Field>
              <Field label="Reps min">
                <TextInput
                  type="number"
                  value={ex.repsMin}
                  onChange={(e) => patchExercise(ex.id, { repsMin: Number(e.target.value) })}
                  onBlur={(e) =>
                    patchExercise(ex.id, { repsMin: Number(e.target.value) }, true)
                  }
                />
              </Field>
              <Field label="Reps max">
                <TextInput
                  type="number"
                  value={ex.repsMax ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, {
                      repsMax: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
                      ex.id,
                      { repsMax: e.target.value ? Number(e.target.value) : null },
                      true,
                    )
                  }
                />
              </Field>
              <Field label="Method">
                <select
                  className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
                  value={ex.method}
                  onChange={(e) =>
                    patchExercise(ex.id, { method: e.target.value as SetMethod }, true)
                  }
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {(ex.method === 'rir' || ex.method === 'rpe') && (
              <Field label={ex.method === 'rir' ? 'Target RIR' : 'Target RPE'}>
                <TextInput
                  type="number"
                  value={ex.methodTarget ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, { methodTarget: Number(e.target.value) })
                  }
                  onBlur={(e) =>
                    patchExercise(ex.id, { methodTarget: Number(e.target.value) }, true)
                  }
                />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Time down (s)">
                <TextInput
                  type="number"
                  value={ex.tempoEccentric ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, {
                      tempoEccentric: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
                      ex.id,
                      { tempoEccentric: e.target.value ? Number(e.target.value) : null },
                      true,
                    )
                  }
                />
              </Field>
              <Field label="Pause bottom (s)">
                <TextInput
                  type="number"
                  value={ex.tempoPauseBottom ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, {
                      tempoPauseBottom: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
                      ex.id,
                      { tempoPauseBottom: e.target.value ? Number(e.target.value) : null },
                      true,
                    )
                  }
                />
              </Field>
              <Field label="Time up (s)">
                <TextInput
                  type="number"
                  value={ex.tempoConcentric ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, {
                      tempoConcentric: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
                      ex.id,
                      { tempoConcentric: e.target.value ? Number(e.target.value) : null },
                      true,
                    )
                  }
                />
              </Field>
              <Field label="Pause top (s)">
                <TextInput
                  type="number"
                  value={ex.tempoPauseTop ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, {
                      tempoPauseTop: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
                      ex.id,
                      { tempoPauseTop: e.target.value ? Number(e.target.value) : null },
                      true,
                    )
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Rest after set (s)">
                <TextInput
                  type="number"
                  value={ex.restAfterSetSeconds ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, {
                      restAfterSetSeconds: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
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
                    patchExercise(ex.id, {
                      restAfterExerciseSeconds: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
                      ex.id,
                      {
                        restAfterExerciseSeconds: e.target.value
                          ? Number(e.target.value)
                          : null,
                      },
                      true,
                    )
                  }
                />
              </Field>
              <Field label="Superset group">
                <TextInput
                  placeholder="A"
                  value={ex.supersetGroup ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, { supersetGroup: e.target.value || null })
                  }
                  onBlur={(e) =>
                    patchExercise(ex.id, { supersetGroup: e.target.value || null }, true)
                  }
                />
              </Field>
              <Field label="Order in group">
                <TextInput
                  type="number"
                  value={ex.supersetOrder ?? ''}
                  onChange={(e) =>
                    patchExercise(ex.id, {
                      supersetOrder: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={(e) =>
                    patchExercise(
                      ex.id,
                      { supersetOrder: e.target.value ? Number(e.target.value) : null },
                      true,
                    )
                  }
                />
              </Field>
            </div>
            <Field label="YouTube link">
              <TextInput
                value={ex.youtubeUrl ?? ''}
                onChange={(e) => patchExercise(ex.id, { youtubeUrl: e.target.value || null })}
                onBlur={(e) =>
                  patchExercise(ex.id, { youtubeUrl: e.target.value || null }, true)
                }
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={ex.notes ?? ''}
                onChange={(e) => patchExercise(ex.id, { notes: e.target.value || null })}
                onBlur={(e) => patchExercise(ex.id, { notes: e.target.value || null }, true)}
              />
            </Field>
            <Field label="Equipment override">
              <select
                className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
                value={ex.equipment ?? ''}
                onChange={(e) =>
                  patchExercise(
                    ex.id,
                    { equipment: (e.target.value || null) as Equipment | null },
                    true,
                  )
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
        ))}
      </div>
    </div>
  )
}
