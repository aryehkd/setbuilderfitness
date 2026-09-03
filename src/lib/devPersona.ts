const COOKIE = 'sb_dev_persona'

export type DevPersonaKey = 'trainer' | 'trainer2' | 'client'
type StoredPersona = DevPersonaKey | 'none'

export const DEV_PERSONAS: { key: DevPersonaKey; label: string }[] = [
  { key: 'trainer', label: 'Dev Trainer' },
  { key: 'trainer2', label: 'Dev Trainer 2' },
  { key: 'client', label: 'Dev Client' },
]

export function getDevPersona(): StoredPersona {
  const match = document.cookie
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === COOKIE)
  const value = match?.[1]
  if (value === 'client' || value === 'none' || value === 'trainer2') return value
  return 'trainer'
}

export function setDevPersona(key: StoredPersona) {
  document.cookie = `${COOKIE}=${key}; path=/; SameSite=Lax`
}

/** Signed out locally: the API returns 401 for the 'none' persona. */
export function clearDevPersona() {
  setDevPersona('none')
}
