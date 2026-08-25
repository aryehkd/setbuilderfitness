import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  getUser,
  handleAuthCallback,
  logout as identityLogout,
  oauthLogin,
  onAuthChange,
  type User,
} from '@netlify/identity'
import { api } from './api.ts'
import type { MeResponse } from '../../shared/types.ts'

type AuthState = {
  identity: User | null
  me: MeResponse | null
  loading: boolean
  login: () => void
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<User | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = async () => {
    const user = await getUser()
    setIdentity(user)
    if (!user) {
      setMe(null)
      return
    }
    const data = await api<MeResponse>('/api/me')
    setMe(data)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await handleAuthCallback()
        if (!cancelled) await refreshMe()
      } catch {
        if (!cancelled) {
          setIdentity(null)
          setMe(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    const unsub = onAuthChange(() => {
      void refreshMe()
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const login = () => {
    oauthLogin('google')
  }

  const logout = async () => {
    await identityLogout()
    setIdentity(null)
    setMe(null)
  }

  return (
    <AuthContext.Provider
      value={{ identity, me, loading, login, logout, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
