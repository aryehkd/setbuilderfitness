export type MonthCursor = { year: number; month: number }

export function currentMonthCursor(): MonthCursor {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

export function monthRange(cursor: MonthCursor) {
  const first = new Date(cursor.year, cursor.month, 1)
  const last = new Date(cursor.year, cursor.month + 1, 0)
  first.setDate(first.getDate() - first.getDay())
  last.setDate(last.getDate() + (6 - last.getDay()))
  return {
    from: localDateKey(first),
    to: localDateKey(last),
  }
}

export function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
