import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui.tsx'
import { WorkoutPrescriptionPreview } from '../components/WorkoutPrescriptionPreview.tsx'
import { toPrescribedExercise } from '../components/WorkoutEditorUtils.ts'
import { api } from '../lib/api.ts'
import type {
  LibraryShareAcceptResult,
  LibrarySharePreview,
} from '../../shared/types.ts'

export function SharedWorkoutPreviewPage() {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<LibrarySharePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!shareId) return
    void api<LibrarySharePreview>(`/api/library-shares/${shareId}`)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load share'))
  }, [shareId])

  const addToLibrary = async () => {
    if (!shareId) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<LibraryShareAcceptResult>(`/api/library-shares/${shareId}/accept`, {
        method: 'POST',
      })
      if (result.workoutId) navigate(`/workouts/${result.workoutId}`)
      else navigate('/workouts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to library')
      setBusy(false)
    }
  }

  const dismiss = async () => {
    if (!shareId) return
    setBusy(true)
    try {
      await api(`/api/library-shares/${shareId}`, { method: 'DELETE' })
      navigate('/workouts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss')
      setBusy(false)
    }
  }

  if (error && !preview) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <p className="text-sm text-red-300">{error}</p>
        <Link to="/workouts" className="text-sm text-lime">
          Back to workouts
        </Link>
      </div>
    )
  }
  if (!preview?.workout) return <p className="p-6 text-muted">Loading shared workout…</p>

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted">
            Shared by {preview.share.ownerName}
          </p>
          <h1 className="font-display text-2xl font-bold">{preview.workout.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void addToLibrary()}>
            {busy ? 'Adding…' : 'Add to my library'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void dismiss()}>
            Dismiss
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <p className="text-sm text-muted">
        Preview only. Adding this workout copies it and any custom movements into your library.
      </p>
      <WorkoutPrescriptionPreview
        warmup={preview.workout.warmup}
        exercises={(preview.workout.exercises ?? []).map(toPrescribedExercise)}
      />
    </div>
  )
}
