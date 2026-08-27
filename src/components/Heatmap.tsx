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

const COLORS = [
  '#1c1e18',
  'color-mix(in srgb, var(--color-lime) 25%, #1c1e18)',
  'color-mix(in srgb, var(--color-lime) 50%, #1c1e18)',
  'color-mix(in srgb, var(--color-lime) 75%, #1c1e18)',
  'var(--color-lime)',
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

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
      const week = cells.slice(i, i + 7)
      while (week.length < 7) week.push({ date: null, minutes: 0 })
      columns.push(week)
    }
    return columns
  }, [year, byDate])

  const monthLabels = useMemo(() => {
    const labels: (string | null)[] = weeks.map(() => null)
    let lastLabeled = -3
    weeks.forEach((week, i) => {
      const startsMonth = week.some((cell) => cell.date?.endsWith('-01'))
      if (!startsMonth && i !== 0) return
      const dated = week.find((cell) => cell.date)
      if (!dated?.date) return
      if (i - lastLabeled < 2) return
      labels[i] = MONTHS[Number(dated.date.slice(5, 7)) - 1] ?? null
      lastLabeled = i
    })
    return labels
  }, [weeks])

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-1">
          <div className="w-8 shrink-0" />
          {monthLabels.map((label, i) => (
            <div key={i} className="h-4 w-3 shrink-0 overflow-visible whitespace-nowrap text-[10px] leading-4 text-muted">
              {label ?? ''}
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <div className="flex w-8 shrink-0 flex-col gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={i}
                className="h-3 text-[10px] leading-3 text-muted"
              >
                {label}
              </div>
            ))}
          </div>
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
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted">
          Less
          {COLORS.map((c) => (
            <span key={c} className="h-3 w-3 rounded-[2px]" style={{ background: c }} />
          ))}
          More
        </div>
      </div>
    </div>
  )
}
