import { Link } from 'react-router-dom'
import { Card, ConfirmLink } from './ui.tsx'
import type { LibraryShare, LibraryShareResourceType } from '../../shared/types.ts'

export function SharedWithMe({
  type,
  shares,
  onDismiss,
}: {
  type: LibraryShareResourceType
  shares: LibraryShare[]
  onDismiss: (id: string) => void
}) {
  if (shares.length === 0) return null
  const previewPath =
    type === 'workout' ? '/shared/workouts' : '/shared/programs'

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold">Shared with me</h2>
      <div className="grid gap-3">
        {shares.map((share) => (
          <Card key={share.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="min-w-0 break-words font-medium">{share.resourceName}</p>
              <p className="text-xs text-muted">From {share.ownerName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                to={`${previewPath}/${share.id}`}
                className="min-h-11 text-xs text-lime hover:underline sm:min-h-0"
              >
                Preview
              </Link>
              <ConfirmLink
                className="min-h-11 shrink-0 text-xs text-muted hover:text-white sm:min-h-0"
                confirmLabel="Confirm dismiss"
                onConfirm={() => onDismiss(share.id)}
              >
                Dismiss
              </ConfirmLink>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
