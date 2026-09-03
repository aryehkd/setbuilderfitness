import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Field, TextInput } from './ui.tsx'
import { movementMatchesQuery } from '../../shared/search.ts'
import { SpinnerIcon } from './WorkoutEditorControls.tsx'
import { CATEGORIES, EQUIPMENT } from './WorkoutEditorUtils.ts'
import type { Equipment, ExerciseCategory, Movement } from '../../shared/types.ts'

export function AddMovementSlot({
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
  onSelect: (movement: Movement) => void | Promise<void>
  onCreate: (
    name: string,
    category: ExerciseCategory,
    equipment: Equipment,
  ) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [draftCategory, setDraftCategory] = useState('')
  const [draftEquipment, setDraftEquipment] = useState('')
  // Which row (or the create form) is waiting on the server, so the click that
  // started a slow add is visibly acknowledged instead of looking ignored.
  const [pending, setPending] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  const runPending = async (key: string, action: () => void | Promise<void>) => {
    if (pending) return
    const result = action()
    if (!(result instanceof Promise)) return
    setPending(key)
    try {
      await result
    } finally {
      if (mounted.current) setPending(null)
    }
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? movements.filter((m) => movementMatchesQuery(m, q)) : movements
    return list.slice(0, 12)
  }, [movements, query])

  const exact = movements.some((m) => m.name.toLowerCase() === query.trim().toLowerCase())
  const canCreate = Boolean(query.trim()) && !exact

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
      setDraftName(null)
      setDraftCategory('')
      setDraftEquipment('')
      setPending(null)
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-lg leading-none text-muted hover:border-muted hover:text-white"
          onClick={onOpen}
        >
          +
        </button>
      </div>
    )
  }

  const choose = (index: number) => {
    if (index < matches.length) {
      const movement = matches[index]!
      void runPending(movement.id, () => onSelect(movement))
      return
    }
    if (canCreate) startCreate(query.trim())
  }

  const startCreate = (name: string) => {
    setDraftName(name)
    setDraftCategory('')
    setDraftEquipment('')
  }

  const submitCreate = () => {
    if (!draftName) return
    if (!draftCategory || !draftEquipment) return
    void runPending('create', () =>
      onCreate(draftName, draftCategory as ExerciseCategory, draftEquipment as Equipment),
    )
  }

  if (draftName) {
    const saving = pending === 'create'
    const canSave = Boolean(draftCategory && draftEquipment) && !saving
    return (
      <Card className="space-y-3">
        <div>
          <p className="font-semibold">Add “{draftName}” to your catalog</p>
          <p className="text-sm text-muted">
            Choose a default category and equipment. These will be used the next time you add
            this movement.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <select
              className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
              value={draftCategory}
              disabled={saving}
              onChange={(e) => setDraftCategory(e.target.value)}
            >
              <option value="">Choose category…</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Equipment">
            <select
              className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm"
              value={draftEquipment}
              disabled={saving}
              onChange={(e) => setDraftEquipment(e.target.value)}
            >
              <option value="">Choose equipment…</option>
              {EQUIPMENT.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="gap-2"
            disabled={!canSave}
            aria-busy={saving}
            onClick={submitCreate}
          >
            {saving ? <SpinnerIcon /> : null}
            {saving ? 'Adding…' : 'Add movement'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            disabled={saving}
            onClick={() => setDraftName(null)}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </Card>
    )
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
              disabled={Boolean(pending)}
              aria-busy={pending === m.id}
              className={`flex min-h-11 w-full flex-col items-start justify-between gap-1 px-3 py-2 text-left text-sm disabled:opacity-60 sm:flex-row sm:items-center sm:gap-2 ${
                i === active ? 'bg-lime/15 text-white' : 'text-muted hover:bg-ink'
              }`}
              onMouseEnter={() => setActive(i)}
              onClick={() => void runPending(m.id, () => onSelect(m))}
            >
              <span className="flex min-w-0 items-center gap-2 break-words font-medium text-white">
                {pending === m.id ? <SpinnerIcon /> : null}
                {m.name}
              </span>
              {m.muscleGroups.length > 0 && (
                <span className="break-words text-xs text-muted sm:text-right">
                  {m.muscleGroups.join(', ')}
                </span>
              )}
            </button>
          </li>
        ))}
        {canCreate && (
          <li>
            <button
              type="button"
              disabled={Boolean(pending)}
              className={`w-full px-3 py-2 text-left text-sm disabled:opacity-60 ${
                active === matches.length ? 'bg-lime/15 text-white' : 'text-muted hover:bg-ink'
              }`}
              onMouseEnter={() => setActive(matches.length)}
              onClick={() => startCreate(query.trim())}
            >
              Add “{query.trim()}” to catalog
            </button>
          </li>
        )}
        {matches.length === 0 && !canCreate && (
          <li className="px-3 py-2 text-sm text-muted">No movements match.</li>
        )}
      </ul>
      <Button
        type="button"
        variant="ghost"
        className="text-xs"
        disabled={Boolean(pending)}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </Card>
  )
}
