import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  handleAuthCallback,
  logout as identityLogout,
  oauthLogin,
  onAuthChange,
} from '@netlify/identity'
import { api, ApiError } from './api.ts'
import { clearDevPersona } from './devPersona.ts'
import type { MeResponse } from '../../shared/types.ts'

type AuthState = {
  me: MeResponse | null
  loading: boolean
  login: () => void
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // The API is the source of truth for who is signed in: in production it reads
  // the Identity cookie, and in local dev it resolves the dev persona.
  const refreshMe = useCallback(async () => {
    try {
      setMe(await api<MeResponse>('/api/me'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null)
        return
      }
      console.error('Failed to load session', err)
      setMe(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await handleAuthCallback()
      } catch {
        // No Identity backend on this origin (local dev); fall through to /api/me.
      }
      if (!cancelled) await refreshMe()
      if (!cancelled) setLoading(false)
    })()

    const unsubscribe = onAuthChange(() => {
      void refreshMe()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [refreshMe])

  const login = () => {
    oauthLogin('google')
  }

  const logout = async () => {
    try {
      await identityLogout()
    } catch {
      // Ignore: no Identity backend locally.
    }
    if (import.meta.env.DEV) clearDevPersona()
    setMe(null)
  }

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
