import { useEffect, useMemo, useState } from 'react'
import type {
  Equipment,
  ExerciseCategory,
  Movement,
  MovementPrescriptionDefaults,
  PrescribedExercise,
} from '../../shared/types.ts'
import { movementMatchesQuery } from '../../shared/search.ts'
import { AddMovementSlot } from '../components/AddMovementSlot.tsx'
import { MovementDefaultsEditorCard } from '../components/SessionPrescriptionEditor.tsx'
import { ModeToggle, type SaveDefaultStatus } from '../components/WorkoutEditorControls.tsx'
import { Card, Page, TextInput } from '../components/ui.tsx'
import {
  movementDefaultsFromPrescription,
  prescriptionDefaultsForMovement,
} from '../components/WorkoutEditorUtils.ts'
import { api } from '../lib/api.ts'
import { materializeMovement, replaceCatalogMovement } from '../lib/movements.ts'

function asExercise(
  movement: Movement,
  defaults: MovementPrescriptionDefaults,
): PrescribedExercise {
  return {
    movementId: movement.id,
    movementName: movement.name,
    ...defaults,
    supersetGroup: null,
    supersetOrder: null,
  }
}

export function SavedMovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [drafts, setDrafts] = useState<Record<string, MovementPrescriptionDefaults>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'shared' | 'custom'>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveDefaultStatus>>({})

  useEffect(() => {
    void api<Movement[]>('/api/movements').then(setMovements)
  }, [])

  const filteredMovements = useMemo(() => {
    const search = query.trim().toLowerCase()
    return movements
      .filter((movement) => {
        if (sourceFilter === 'shared' && movement.source !== 'shared') return false
        if (sourceFilter === 'custom' && movement.source !== 'trainer') return false
        if (!search) return true
        return movementMatchesQuery(movement, search)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [movements, query, sourceFilter])

  const save = async (
    movement: Movement,
    defaults: MovementPrescriptionDefaults,
  ) => {
    setSaveStatus((current) => ({ ...current, [movement.id]: 'saving' }))
    try {
      const resolved = await materializeMovement(movement)
      const normalizedDefaults = {
        ...defaults,
        variantId:
          resolved.variants.find((variant) => variant.equipment === defaults.equipment)?.id ??
          null,
      }
      const claimed = await api<Movement>(
        `/api/movements/${resolved.id}/defaults`,
        { method: 'PUT', body: JSON.stringify(normalizedDefaults) },
      )
      setMovements((current) => replaceCatalogMovement(current, movement, claimed))
      setDrafts((current) => {
        const next = { ...current }
        delete next[movement.id]
        delete next[resolved.id]
        delete next[claimed.id]
        return next
      })
      setSourceFilter('custom')
      setExpandedId(claimed.id)
      setSaveStatus((current) => ({
        ...current,
        [movement.id]: 'saved',
        [resolved.id]: 'saved',
        [claimed.id]: 'saved',
      }))
      setMessage(`Saved defaults for ${movement.name}.`)
    } catch {
      setSaveStatus((current) => {
        const next = { ...current }
        delete next[movement.id]
        return next
      })
    }
  }

  const openMovement = (movement: Movement) => {
    setExpandedId(movement.id)
    setPickerOpen(false)
    setMessage(null)
  }

  const createAndAdd = async (
    name: string,
    category: ExerciseCategory,
    equipment: Equipment,
  ) => {
    const movement = await api<Movement>('/api/movements', {
      method: 'POST',
      body: JSON.stringify({ name, category, equipment }),
    })
    setMovements((current) =>
      current.some((item) => item.id === movement.id)
        ? current
        : [...current, movement],
    )
    setSourceFilter('custom')
    openMovement(movement)
  }

  const remove = async (movement: Movement) => {
    await api(`/api/movements/${movement.id}/defaults`, { method: 'DELETE' })
    setMovements((current) =>
      current.map((item) =>
        item.id === movement.id ? { ...item, savedDefaults: null } : item,
      ),
    )
    setDrafts((current) => {
      const next = { ...current }
      delete next[movement.id]
      return next
    })
    setMessage(`Removed saved defaults for ${movement.name}.`)
  }

  return (
    <Page>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Saved movements</h1>
          <p className="mt-1 text-sm text-muted">
            Set the prescription that should be filled in whenever you add a movement.
          </p>
        </div>

        <AddMovementSlot
          label="Find or add a movement"
          movements={movements}
          open={pickerOpen}
          onOpen={() => setPickerOpen(true)}
          onCancel={() => setPickerOpen(false)}
          onSelect={openMovement}
          onCreate={(name, category, equipment) =>
            void createAndAdd(name, category, equipment)
          }
        />

        {message ? <p className="text-sm text-lime">{message}</p> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ModeToggle
            value={sourceFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'shared', label: 'Shared' },
              { value: 'custom', label: 'My movements' },
            ]}
            onChange={setSourceFilter}
          />
          <TextInput
            type="search"
            placeholder="Search movements…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          {filteredMovements.map((movement) => {
            const expanded = expandedId === movement.id
            const status =
              movement.source === 'trainer'
                ? movement.savedDefaults
                  ? 'My movement · Defaults saved'
                  : 'My movement'
                : movement.savedDefaults
                  ? 'Customized'
                  : 'Shared'
            const defaults =
              drafts[movement.id] ??
              movement.savedDefaults ??
              prescriptionDefaultsForMovement(movement)
            const exercise = asExercise(movement, defaults)
            return (
              <div key={movement.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink/60"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : movement.id)}
                >
                  <span className="min-w-0 truncate text-sm font-medium">{movement.name}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span
                      className={`text-xs ${
                        movement.savedDefaults ? 'text-lime' : 'text-muted'
                      }`}
                    >
                      {status}
                    </span>
                    <span className="text-muted" aria-hidden="true">
                      {expanded ? '▴' : '▾'}
                    </span>
                  </span>
                </button>
                {expanded ? (
                  <div className="border-t border-line bg-ink/30 p-3 sm:p-4">
                    <MovementDefaultsEditorCard
                      exercise={exercise}
                      onChange={(next) => {
                        setDrafts((current) => ({
                          ...current,
                          [movement.id]: movementDefaultsFromPrescription(next),
                        }))
                        setMessage(null)
                        setSaveStatus((current) => {
                          const nextStatus = { ...current }
                          delete nextStatus[movement.id]
                          return nextStatus
                        })
                      }}
                      onSave={() => void save(movement, defaults)}
                      saveStatus={saveStatus[movement.id] ?? 'idle'}
                      onDelete={
                        movement.savedDefaults ? () => void remove(movement) : undefined
                      }
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
          {filteredMovements.length === 0 ? (
            <Card className="border-0">
              <p className="text-sm text-muted">
                {query
                  ? 'No movements match.'
                  : sourceFilter === 'custom'
                    ? 'No movements of your own yet. Save defaults on a shared movement or add one from the picker above.'
                    : sourceFilter === 'shared'
                      ? 'No shared movements to show.'
                      : 'No movements in your catalog yet.'}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  )
}
