import { randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateTrainerCode(length = 6) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return out
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export function error(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export function asDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export function asIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function asNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}
