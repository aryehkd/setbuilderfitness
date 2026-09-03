import type { Config } from '@netlify/functions'
import { error } from '../lib/http.ts'
import {
  handleActivity,
  handleAdHoc,
  handleAddProgramSessions,
  handleAssignProgram,
  handleAssignSession,
  handleCreateMovement,
  handleCreateProgram,
  handleCopyTemplate,
  handleCreateTemplate,
  handleDeleteExercise,
  handleDeleteMovementDefaults,
  handleDeleteProgram,
  handleDeleteProgramSession,
  handleDeleteSession,
  handleDeleteTemplate,
  handleDevReset,
  handleExerciseHistory,
  handleExerciseHistoryBatch,
  handleGetAssignedTrainer,
  handleGetMe,
  handleGetProgram,
  handleGetProgramSession,
  handleGetSession,
  handleGetTemplate,
  handleListPrograms,
  handleListSessions,
  handleListTemplates,
  handleLoggedMovements,
  handleLogSession,
  handleMaterializeSharedMovement,
  handleMovements,
  handleOnboarding,
  handlePastWorkouts,
  handleReorderExercises,
  handleSaveMovementDefaults,
  handleTrainerClients,
  handleTrainerLookup,
  handleUpdateProfile,
  handleUpdateProgram,
  handleUpdateProgramSession,
  handleUpdateSession,
  handleUpdateTemplate,
  handleUpsertExercise,
  loadContext,
} from '../lib/handlers.ts'

export default async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  const url = new URL(req.url)
  const path = url.pathname.replace(/\/$/, '') || '/'

  try {
    if (path === '/api/trainers/lookup' && req.method === 'GET') {
      return await handleTrainerLookup(req)
    }
    if (path === '/api/movements' && req.method === 'GET') {
      const loaded = await loadContext(req)
      if (!loaded.ok) return loaded.response
      return await handleMovements(loaded.ctx, req)
    }
    if (path === '/api/movements' && req.method === 'POST') {
      const loaded = await loadContext(req)
      if (!loaded.ok) return loaded.response
      return await handleCreateMovement(loaded.ctx, req)
    }
    if (path === '/api/movements/materialize' && req.method === 'POST') {
      const loaded = await loadContext(req)
      if (!loaded.ok) return loaded.response
      return await handleMaterializeSharedMovement(loaded.ctx, req)
    }
    const movementDefaults = path.match(/^\/api\/movements\/([^/]+)\/defaults$/)
    if (movementDefaults) {
      const loaded = await loadContext(req)
      if (!loaded.ok) return loaded.response
      if (req.method === 'PUT') {
        return await handleSaveMovementDefaults(loaded.ctx, movementDefaults[1]!, req)
      }
      if (req.method === 'DELETE') {
        return await handleDeleteMovementDefaults(loaded.ctx, movementDefaults[1]!)
      }
    }

    const loaded = await loadContext(req)
    if (!loaded.ok) return loaded.response
    const { ctx } = loaded

    if (path === '/api/dev/reset' && req.method === 'POST') {
      return await handleDevReset(ctx)
    }

    if (path === '/api/me' && req.method === 'GET') return await handleGetMe(ctx)
    if (path === '/api/me' && req.method === 'PUT') return await handleUpdateProfile(ctx, req)
    if (path === '/api/trainer' && req.method === 'GET') {
      return await handleGetAssignedTrainer(ctx)
    }
    if (path === '/api/onboarding' && req.method === 'POST') {
      return await handleOnboarding(ctx, req)
    }

    if (path === '/api/templates' && req.method === 'GET') {
      return await handleListTemplates(ctx)
    }
    if (path === '/api/templates' && req.method === 'POST') {
      return await handleCreateTemplate(ctx, req)
    }

    const templateExerciseReorder = path.match(/^\/api\/templates\/([^/]+)\/exercises\/reorder$/)
    if (templateExerciseReorder && req.method === 'PUT') {
      return await handleReorderExercises(ctx, templateExerciseReorder[1]!, req)
    }

    const templateExercise = path.match(
      /^\/api\/templates\/([^/]+)\/exercises(?:\/([^/]+))?$/,
    )
    if (templateExercise) {
      const templateId = templateExercise[1]!
      const exerciseId = templateExercise[2]
      if (req.method === 'POST' && !exerciseId) {
        return await handleUpsertExercise(ctx, templateId, req)
      }
      if (req.method === 'PUT' && exerciseId) {
        return await handleUpsertExercise(ctx, templateId, req, exerciseId)
      }
      if (req.method === 'DELETE' && exerciseId) {
        return await handleDeleteExercise(ctx, templateId, exerciseId)
      }
    }

    const templateCopy = path.match(/^\/api\/templates\/([^/]+)\/copy$/)
    if (templateCopy && req.method === 'POST') {
      return await handleCopyTemplate(ctx, templateCopy[1]!)
    }

    const templateMatch = path.match(/^\/api\/templates\/([^/]+)$/)
    if (templateMatch) {
      const id = templateMatch[1]!
      if (req.method === 'GET') return await handleGetTemplate(ctx, id)
      if (req.method === 'PUT') return await handleUpdateTemplate(ctx, id, req)
      if (req.method === 'DELETE') return await handleDeleteTemplate(ctx, id)
    }

    if (path === '/api/programs' && req.method === 'GET') {
      return await handleListPrograms(ctx)
    }
    if (path === '/api/programs' && req.method === 'POST') {
      return await handleCreateProgram(ctx, req)
    }
    const programAssign = path.match(/^\/api\/programs\/([^/]+)\/assign$/)
    if (programAssign && req.method === 'POST') {
      return await handleAssignProgram(ctx, programAssign[1]!, req)
    }
    const programSessionMatch = path.match(/^\/api\/programs\/([^/]+)\/sessions(?:\/([^/]+))?$/)
    if (programSessionMatch) {
      const programId = programSessionMatch[1]!
      const sessionId = programSessionMatch[2]
      if (req.method === 'POST' && !sessionId) {
        return await handleAddProgramSessions(ctx, programId, req)
      }
      if (sessionId && req.method === 'GET') {
        return await handleGetProgramSession(ctx, programId, sessionId)
      }
      if (sessionId && req.method === 'PUT') {
        return await handleUpdateProgramSession(ctx, programId, sessionId, req)
      }
      if (sessionId && req.method === 'DELETE') {
        return await handleDeleteProgramSession(ctx, programId, sessionId)
      }
    }
    const programMatch = path.match(/^\/api\/programs\/([^/]+)$/)
    if (programMatch) {
      const id = programMatch[1]!
      if (req.method === 'GET') return await handleGetProgram(ctx, id)
      if (req.method === 'PUT') return await handleUpdateProgram(ctx, id, req)
      if (req.method === 'DELETE') return await handleDeleteProgram(ctx, id)
    }

    if (path === '/api/clients' && req.method === 'GET') {
      return await handleTrainerClients(ctx)
    }
    if (path === '/api/sessions' && req.method === 'GET') {
      return await handleListSessions(ctx, req)
    }
    if (path === '/api/sessions' && req.method === 'POST') {
      return await handleAssignSession(ctx, req)
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)(?:\/(logs))?$/)
    if (sessionMatch) {
      const id = sessionMatch[1]!
      if (sessionMatch[2] === 'logs' && req.method === 'PUT') {
        return await handleLogSession(ctx, id, req)
      }
      if (req.method === 'GET') return await handleGetSession(ctx, id)
      if (req.method === 'PUT') return await handleUpdateSession(ctx, id, req)
      if (req.method === 'DELETE') return await handleDeleteSession(ctx, id)
    }

    if (path === '/api/ad-hoc') return await handleAdHoc(ctx, req)
    const adHocMatch = path.match(/^\/api\/ad-hoc\/([^/]+)$/)
    if (adHocMatch) return await handleAdHoc(ctx, req, adHocMatch[1])
    if (path === '/api/activity' && req.method === 'GET') {
      return await handleActivity(ctx, req)
    }
    if (path === '/api/exercise-history' && req.method === 'GET') {
      return await handleExerciseHistory(ctx, req)
    }
    if (path === '/api/exercise-history/batch' && req.method === 'GET') {
      return await handleExerciseHistoryBatch(ctx, req)
    }
    if (path === '/api/logged-movements' && req.method === 'GET') {
      return await handleLoggedMovements(ctx, req)
    }
    if (path === '/api/past-workouts' && req.method === 'GET') {
      return await handlePastWorkouts(ctx)
    }

    return error('Not found', 404)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    console.error(err)
    return error(message, 500)
  }
}

export const config: Config = {
  path: '/api/*',
}
