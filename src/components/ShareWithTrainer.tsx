import { useState } from 'react'
import { api } from '../lib/api.ts'
import { Button, Field, TextInput } from './ui.tsx'

export function ShareWithTrainer({
  path,
  compact = false,
}: {
  path: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<{ name: string; code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const reset = () => {
    setOpen(false)
    setCode('')
    setLookup(null)
    setError(null)
    setBusy(false)
    setDone(null)
  }

  const findTrainer = async () => {
    setError(null)
    setDone(null)
    try {
      const result = await api<{ name: string; code: string }>(
        `/api/trainers/lookup?code=${encodeURIComponent(code.trim())}`,
      )
      setLookup(result)
    } catch (err) {
      setLookup(null)
      setError(err instanceof Error ? err.message : 'Trainer not found')
    }
  }

  const share = async () => {
    if (!lookup) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ recipientName: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ trainerCode: lookup.code }),
      })
      setDone(`Shared with ${result.recipientName}`)
      setLookup(null)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    if (compact) {
      return (
        <button
          type="button"
          className="min-h-11 shrink-0 text-xs text-muted hover:text-white sm:min-h-0"
          onClick={() => setOpen(true)}
        >
          Share
        </button>
      )
    }
    return (
      <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        Share
      </Button>
    )
  }

  return (
    <div className="min-w-56 space-y-2 rounded-xl border border-line bg-ink p-3">
      <Field label="Trainer code">
        <TextInput
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase())
            setLookup(null)
            setDone(null)
          }}
          placeholder="ABC123"
          autoComplete="off"
        />
      </Field>
      {lookup ? (
        <p className="text-sm">Share with {lookup.name}?</p>
      ) : null}
      {done ? <p className="text-sm text-lime">{done}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {!lookup ? (
          <Button type="button" disabled={!code.trim() || busy} onClick={() => void findTrainer()}>
            Find
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void share()}>
            {busy ? 'Sharing…' : 'Share'}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={reset}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
