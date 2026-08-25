import { useState } from 'react'
import { api } from '../lib/api.ts'
import {
  clearDevPersona,
  DEV_PERSONAS,
  getDevPersona,
  setDevPersona,
  type DevPersonaKey,
} from '../lib/devPersona.ts'

/**
 * Local-only persona switcher. Netlify Identity has no local backend, so the API
 * signs requests in as a dev persona instead. Stripped from production builds.
 */
export function DevBar() {
  const [persona, setPersona] = useState(() => getDevPersona())
  const [busy, setBusy] = useState(false)

  const switchTo = (key: DevPersonaKey) => {
    setDevPersona(key)
    setPersona(key)
    window.location.assign('/')
  }

  const resetPersona = async () => {
    setBusy(true)
    try {
      await api('/api/dev/reset', { method: 'POST' })
      window.location.assign('/')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200">
      <span className="font-semibold uppercase tracking-wide">Dev auth</span>
      {DEV_PERSONAS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => switchTo(p.key)}
          className={`rounded-md px-2 py-0.5 ${
            persona === p.key ? 'bg-amber-400 text-ink' : 'hover:bg-amber-500/20'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          clearDevPersona()
          window.location.assign('/login')
        }}
        className="rounded-md px-2 py-0.5 hover:bg-amber-500/20"
      >
        Sign out
      </button>
      <button
        type="button"
        onClick={() => void resetPersona()}
        disabled={busy || persona === 'none'}
        className="ml-auto rounded-md px-2 py-0.5 hover:bg-amber-500/20 disabled:opacity-50"
      >
        {busy ? 'Resetting…' : 'Reset this persona'}
      </button>
    </div>
  )
}
