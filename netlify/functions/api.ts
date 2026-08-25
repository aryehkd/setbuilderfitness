import type { Config } from '@netlify/functions'
import { error } from '../lib/http.ts'
import {
  handleActivity,
  handleAdHoc,
  handleAssignSession,
  handleCreateTemplate,
  handleDeleteExercise,
  handleDeleteSession,
  handleDeleteTemplate,
  handleExerciseHistory,
  handleGetMe,
  handleGetSession,
  handleGetTemplate,
  handleListSessions,
  handleListTemplates,
  handleLogSession,
  handleMovements,
  handleOnboarding,
  handlePastWorkouts,
  handleTrainerClients,
  handleTrainerLookup,
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
      const loaded = await loadContext()
      if (!loaded.ok) return loaded.response
      return await handleMovements(req)
    }

    const loaded = await loadContext()
    if (!loaded.ok) return loaded.response
    const { ctx } = loaded

    if (path === '/api/me' && req.method === 'GET') return await handleGetMe(ctx)
    if (path === '/api/onboarding' && req.method === 'POST') {
      return await handleOnboarding(ctx, req)
    }

    if (path === '/api/templates' && req.method === 'GET') {
      return await handleListTemplates(ctx)
    }
    if (path === '/api/templates' && req.method === 'POST') {
      return await handleCreateTemplate(ctx, req)
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

    const templateMatch = path.match(/^\/api\/templates\/([^/]+)$/)
    if (templateMatch) {
      const id = templateMatch[1]!
      if (req.method === 'GET') return await handleGetTemplate(ctx, id)
      if (req.method === 'PUT') return await handleUpdateTemplate(ctx, id, req)
      if (req.method === 'DELETE') return await handleDeleteTemplate(ctx, id)
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
      if (req.method === 'DELETE') return await handleDeleteSession(ctx, id)
    }

    if (path === '/api/ad-hoc') return await handleAdHoc(ctx, req)
    if (path === '/api/activity' && req.method === 'GET') {
      return await handleActivity(ctx, req)
    }
    if (path === '/api/exercise-history' && req.method === 'GET') {
      return await handleExerciseHistory(ctx, req)
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
