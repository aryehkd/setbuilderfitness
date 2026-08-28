import { formatVersionHistory } from '../../shared/versionHistory.ts'
import type { VersionHistoryEvent } from '../../shared/types.ts'

export function VersionHistory({ events }: { events?: VersionHistoryEvent[] }) {
  if (!events?.length) return null
  return (
    <details className="group rounded-2xl border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        Version history
        <span className="text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <pre className="overflow-x-auto whitespace-pre-wrap border-t border-line px-4 py-3 font-sans text-sm leading-relaxed text-muted">
        {formatVersionHistory(events)}
      </pre>
    </details>
  )
}
