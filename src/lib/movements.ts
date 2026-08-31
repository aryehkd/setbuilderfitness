import type { Movement } from '../../shared/types.ts'
import { api } from './api.ts'

export function movementNeedsMaterializing(movement: Movement) {
  return movement.id.startsWith('shared:')
}

export async function materializeMovement(movement: Movement) {
  if (!movementNeedsMaterializing(movement)) return movement
  return api<Movement>('/api/movements/materialize', {
    method: 'POST',
    body: JSON.stringify({ sourceExerciseId: movement.sourceExerciseId }),
  })
}

export function replaceCatalogMovement(
  catalog: Movement[],
  previous: Pick<Movement, 'id' | 'sourceExerciseId'>,
  next: Movement,
) {
  return [
    ...catalog.filter((item) => {
      if (item.id === next.id || item.id === previous.id) return false
      if (next.sourceExerciseId && item.sourceExerciseId === next.sourceExerciseId) {
        return false
      }
      if (item.source === 'shared' && item.name.toLowerCase() === next.name.toLowerCase()) {
        return false
      }
      return true
    }),
    next,
  ]
}
