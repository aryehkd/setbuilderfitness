export const DEV_PERSONA_COOKIE = 'sb_dev_persona'

export type DevPersona = {
  id: string
  email: string
  name: string
}

export const DEV_PERSONAS: Record<string, DevPersona> = {
  trainer: {
    id: 'dev-trainer',
    email: 'trainer@dev.setbuilder.fitness',
    name: 'Dev Trainer',
  },
  client: {
    id: 'dev-client',
    email: 'client@dev.setbuilder.fitness',
    name: 'Dev Client',
  },
}

const DEFAULT_PERSONA = 'trainer'

/**
 * Both variables are injected only by the local Netlify emulator. A deployed
 * function has no NETLIFY_LOCAL and a CONTEXT of production/deploy-preview/
 * branch-deploy, so this cannot return true on a real site.
 */
export function devAuthEnabled() {
  return process.env.NETLIFY_LOCAL === 'true' && process.env.CONTEXT === 'dev'
}

function readCookie(req: Request, name: string) {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/** Returns null when the dev session is explicitly signed out. */
export function devPersonaFromRequest(req?: Request): DevPersona | null {
  const key = (req && readCookie(req, DEV_PERSONA_COOKIE)) || DEFAULT_PERSONA
  if (key === 'none') return null
  return DEV_PERSONAS[key] ?? DEV_PERSONAS[DEFAULT_PERSONA]!
}
