import { useEffect, useMemo, useState } from 'react'
import type { MovementHistoryById } from '../../shared/types.ts'
import { api } from '../lib/api.ts'

type HistoryRequestState = {
  key: string
  history: MovementHistoryById
  error: string | null
}

export function useMovementHistoryContext(clientId: string, movementIds: string[]) {
  const movementKey = useMemo(
    () => [...new Set(movementIds.filter(Boolean))].sort().join(','),
    [movementIds],
  )
  const requestKey = clientId && movementKey ? `${clientId}:${movementKey}` : ''
  const [state, setState] = useState<HistoryRequestState>({
    key: '',
    history: {},
    error: null,
  })

  useEffect(() => {
    if (!requestKey) return

    const controller = new AbortController()
    void api<MovementHistoryById>(
      `/api/exercise-history/batch?clientId=${encodeURIComponent(clientId)}&movementIds=${encodeURIComponent(movementKey)}`,
      { signal: controller.signal },
    )
      .then((history) => setState({ key: requestKey, history, error: null }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({
          key: requestKey,
          history: {},
          error: err instanceof Error ? err.message : 'Could not load movement history',
        })
      })

    return () => controller.abort()
  }, [clientId, movementKey, requestKey])

  const current = requestKey !== '' && state.key === requestKey
  return {
    history: current ? state.history : {},
    loading: requestKey !== '' && !current,
    error: current ? state.error : null,
  }
}
