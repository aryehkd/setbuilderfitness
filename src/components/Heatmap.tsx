import { useMemo } from 'react'
import type { ActivityDay } from '../../shared/types.ts'

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function level(minutes: number) {
  if (minutes <= 0) return 0
  if (minutes < 20) return 1
  if (minutes < 45) return 2
  if (minutes < 75) return 3
  return 4
}

const COLORS = ['#1c1e18', '#3d4a1f', '#6b8a28', '#9fc53a', '#c6f54e']

export function Heatmap({ year, days }: { year: number; days: ActivityDay[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of days) map.set(d.date, d.minutes)
    return map
  }, [days])

  const weeks = useMemo(() => {
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31))
    const pad = start.getUTCDay()
    const cells: { date: string | null; minutes: number }[] = []
    for (let i = 0; i < pad; i++) cells.push({ date: null, minutes: 0 })
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const date = toDateKey(new Date(t))
      cells.push({ date, minutes: byDate.get(date) ?? 0 })
    }
    const columns: { date: string | null; minutes: number }[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      columns.push(cells.slice(i, i + 7))
    }
    return columns
  }, [year, byDate])

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-1">
            {week.map((cell, j) => (
              <div
                key={j}
                title={
                  cell.date
                    ? `${cell.date}: ${cell.minutes} min`
                    : undefined
                }
                className="h-3 w-3 rounded-[2px]"
                style={{ background: cell.date ? COLORS[level(cell.minutes)] : 'transparent' }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-muted">
        Less
        {COLORS.map((c) => (
          <span key={c} className="h-3 w-3 rounded-[2px]" style={{ background: c }} />
        ))}
        More
      </div>
    </div>
  )
}
