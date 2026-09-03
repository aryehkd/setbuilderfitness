import { useMemo, useState } from 'react'
import type { ActivityDay } from '../../shared/types.ts'

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const EMPTY_COLOR = '#1c1e18'
const ACTIVE_COLOR = 'var(--color-lime)'

type Cell = { date: string | null; minutes: number; titles: string[] }
type Hover = { left: number; top: number; cell: Cell }

function monthOf(date: string | null) {
  return date ? date.slice(0, 7) : null
}

export function Heatmap({
  year,
  days,
  years = [],
  onYearChange,
}: {
  year: number
  days: ActivityDay[]
  years?: number[]
  onYearChange?: (year: number) => void
}) {
  const [hover, setHover] = useState<Hover | null>(null)

  const byDate = useMemo(() => {
    const map = new Map<string, ActivityDay>()
    for (const d of days) map.set(d.date, d)
    return map
  }, [days])

  const weeks = useMemo(() => {
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31))
    const pad = start.getUTCDay()
    const cells: Cell[] = []
    for (let i = 0; i < pad; i++) cells.push({ date: null, minutes: 0, titles: [] })
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const date = toDateKey(new Date(t))
      const day = byDate.get(date)
      cells.push({ date, minutes: day?.minutes ?? 0, titles: day?.titles ?? [] })
    }
    const columns: Cell[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7)
      while (week.length < 7) week.push({ date: null, minutes: 0, titles: [] })
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

  const previousYear = years.includes(year - 1) ? year - 1 : null
  const nextYear = years.includes(year + 1) ? year + 1 : null
  const showNav = Boolean(onYearChange && (previousYear || nextYear))

  const showHover = (event: { currentTarget: HTMLElement }, cell: Cell) => {
    if (!cell.date) return
    const rect = event.currentTarget.getBoundingClientRect()
    setHover({ left: rect.left, top: rect.bottom + 8, cell })
  }

  return (
    <div>
      {showNav ? (
        <div className="mb-3 flex items-center gap-3 text-sm">
          <button
            type="button"
            className="min-h-11 text-muted disabled:opacity-40 sm:min-h-0"
            disabled={!previousYear}
            onClick={() => previousYear && onYearChange?.(previousYear)}
          >
            ← {previousYear ?? year - 1}
          </button>
          <span className="font-semibold">{year}</span>
          <button
            type="button"
            className="min-h-11 text-muted disabled:opacity-40 sm:min-h-0"
            disabled={!nextYear}
            onClick={() => nextYear && onYearChange?.(nextYear)}
          >
            {nextYear ?? year + 1} →
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1">
            <div className="w-8 shrink-0" />
            {monthLabels.map((label, i) => (
              <div
                key={i}
                className="h-4 w-3 shrink-0 overflow-visible whitespace-nowrap text-[10px] leading-4 text-muted"
              >
                {label ?? ''}
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <div className="flex w-8 shrink-0 flex-col gap-1">
              {WEEKDAY_LABELS.map((label, i) => (
                <div key={i} className="h-3 text-[10px] leading-3 text-muted">
                  {label}
                </div>
              ))}
            </div>
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-1">
                {week.map((cell, j) => {
                  const month = monthOf(cell.date)
                  // Stair-step month separators: mark the edges where a cell's
                  // month differs from the day above it or the same weekday in
                  // the previous week.
                  const newMonthAbove = Boolean(
                    month && j > 0 && monthOf(week[j - 1]!.date) !== month,
                  )
                  const newMonthLeft = Boolean(
                    month && i > 0 && monthOf(weeks[i - 1]![j]!.date) !== month,
                  )
                  return (
                    <div
                      key={j}
                      className={`h-3 w-3 rounded-[2px] ${
                        newMonthAbove ? 'border-t border-t-muted/70' : ''
                      } ${newMonthLeft ? 'border-l border-l-muted/70' : ''}`}
                      style={{
                        background: cell.date
                          ? cell.minutes > 0
                            ? ACTIVE_COLOR
                            : EMPTY_COLOR
                          : 'transparent',
                      }}
                      onMouseEnter={(event) => showHover(event, cell)}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {hover ? (
        <div
          role="tooltip"
          style={{ left: hover.left, top: hover.top }}
          className="pointer-events-none fixed z-30 w-56 rounded-xl border border-line bg-ink p-3 text-[11px] leading-relaxed text-muted shadow-lg"
        >
          <p className="font-medium text-white">{hover.cell.date}</p>
          {hover.cell.titles.length === 0 ? (
            <p>No activity logged</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {hover.cell.titles.map((title, index) => (
                <li key={index} className="break-words">
                  {title}
                </li>
              ))}
            </ul>
          )}
          {hover.cell.minutes > 0 ? (
            <p className="mt-1">{hover.cell.minutes} min</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
