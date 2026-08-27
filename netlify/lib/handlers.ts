import { getUser } from '@netlify/identity'
import { getDatabase } from '@netlify/database'
import type {
  AdHocType,
  Equipment,
  ExerciseCategory,
  MeResponse,
  Movement,
  PrescribedExercise,
  Prescription,
  Session,
  SetPrescription,
  SetLog,
  SetMethod,
  TemplateExercise,
  Tempo,
  TempoMode,
  WorkoutTemplate,
} from '../../shared/types.ts'
import { warmupToText } from '../../shared/types.ts'
import { devAuthEnabled, devPersonaFromRequest } from './devAuth.ts'
import { MOVEMENT_SEEDS } from './movements.ts'
import {
  asDate,
  asIso,
  asNumber,
  error,
  generateTrainerCode,
  json,
  parseJsonColumn,
} from './http.ts'

type Db = ReturnType<typeof getDatabase>
type IdentityUser = NonNullable<Awaited<ReturnType<typeof getUser>>>

type AppUser = {
  id: string
  email: string
  name: string
  role: 'trainer' | 'client' | null
  bio: string | null
  onboarding_completed_at: unknown
}

type TrainerRow = { id: string; user_id: string; code: string }
type ClientRow = { id: string; user_id: string; trainer_id: string | null }

export type AppContext = {
  db: Db
  identity: IdentityUser
  user: AppUser
  trainer: TrainerRow | null
  client: ClientRow | null
}

export async function loadContext(
  req?: Request,
): Promise<{ ok: true; ctx: AppContext } | { ok: false; response: Response }> {
  let identity = await getUser()
  if (!identity && devAuthEnabled()) {
    identity = devPersonaFromRequest(req)
  }
  if (!identity) return { ok: false, response: error('Unauthorized', 401) }

  const db = getDatabase()
  await ensureMovements(db)

  const existing = await db.sql<AppUser>`
    SELECT id, email, name, role, bio, onboarding_completed_at
    FROM users WHERE id = ${identity.id}
  `

  let user = existing[0]
  if (!user) {
    const inserted = await db.sql<AppUser>`
      INSERT INTO users (id, email, name)
      VALUES (
        ${identity.id},
        ${identity.email ?? ''},
        ${identity.name ?? ''}
      )
      RETURNING id, email, name, role, bio, onboarding_completed_at
    `
    user = inserted[0]!
  }

  const trainers = await db.sql<TrainerRow>`
    SELECT id, user_id, code FROM trainers WHERE user_id = ${user.id}
  `
  const clients = await db.sql<ClientRow>`
    SELECT id, user_id, trainer_id FROM clients WHERE user_id = ${user.id}
  `

  return {
    ok: true,
    ctx: {
      db,
      identity,
      user,
      trainer: trainers[0] ?? null,
      client: clients[0] ?? null,
    },
  }
}

async function ensureMovements(db: Db) {
  const [{ count }] = await db.sql<{ count: string }>`
    SELECT COUNT(*)::text AS count FROM movements
  `
  if (Number(count) > 0) return

  for (const seed of MOVEMENT_SEEDS) {
    const [movement] = await db.sql<{ id: string }>`
      INSERT INTO movements (name, aliases, muscle_groups, youtube_url)
      VALUES (
        ${seed.name},
        ${seed.aliases ?? []},
        ${seed.muscles},
        ${seed.youtube ?? null}
      )
      RETURNING id
    `
    for (const equipment of seed.equipment) {
      await db.sql`
        INSERT INTO movement_variants (movement_id, equipment)
        VALUES (${movement!.id}, ${equipment})
      `
    }
  }
}

export function mePayload(ctx: AppContext, extras?: {
  trainerName?: string | null
  trainerCode?: string | null
}): MeResponse {
  return {
    identity: {
      id: ctx.identity.id,
      email: ctx.identity.email,
      name: ctx.identity.name,
      pictureUrl: ctx.identity.pictureUrl,
    },
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      bio: ctx.user.bio,
      onboardingCompleted: Boolean(ctx.user.onboarding_completed_at),
    },
    trainer: ctx.trainer
      ? { id: ctx.trainer.id, code: ctx.trainer.code }
      : null,
    client: ctx.client
      ? {
          id: ctx.client.id,
          trainerId: ctx.client.trainer_id,
          trainerName: extras?.trainerName ?? null,
          trainerCode: extras?.trainerCode ?? null,
        }
      : null,
  }
}

export async function handleGetMe(ctx: AppContext) {
  let trainerName: string | null = null
  let trainerCode: string | null = null
  if (ctx.client?.trainer_id) {
    const rows = await ctx.db.sql<{ name: string; code: string }>`
      SELECT u.name, t.code
      FROM trainers t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ${ctx.client.trainer_id}
    `
    trainerName = rows[0]?.name ?? null
    trainerCode = rows[0]?.code ?? null
  }
  return json(mePayload(ctx, { trainerName, trainerCode }))
}

export async function handleOnboarding(ctx: AppContext, req: Request) {
  if (ctx.user.onboarding_completed_at) {
    return error('Onboarding already completed', 409)
  }
  const body = (await req.json()) as {
    role?: string
    name?: string
    bio?: string
    trainerCode?: string
  }
  const name = body.name?.trim()
  if (!name) return error('Name is required')
  if (body.role !== 'trainer' && body.role !== 'client') {
    return error('Choose trainer or client')
  }

  if (body.role === 'trainer') {
    let code = generateTrainerCode()
    for (let i = 0; i < 8; i++) {
      const clash = await ctx.db.sql<{ id: string }>`
        SELECT id FROM trainers WHERE code = ${code}
      `
      if (clash.length === 0) break
      code = generateTrainerCode()
    }
    await ctx.db.sql`
      UPDATE users
      SET name = ${name},
          bio = ${body.bio?.trim() || null},
          role = 'trainer',
          onboarding_completed_at = NOW()
      WHERE id = ${ctx.user.id}
    `
    await ctx.db.sql`
      INSERT INTO trainers (user_id, code) VALUES (${ctx.user.id}, ${code})
    `
  } else {
    const code = body.trainerCode?.trim().toUpperCase()
    if (!code) return error('Trainer code is required')
    const trainers = await ctx.db.sql<TrainerRow>`
      SELECT id, user_id, code FROM trainers WHERE code = ${code}
    `
    const trainer = trainers[0]
    if (!trainer) return error('No trainer found with that code', 404)
    await ctx.db.sql`
      UPDATE users
      SET name = ${name},
          role = 'client',
          onboarding_completed_at = NOW()
      WHERE id = ${ctx.user.id}
    `
    await ctx.db.sql`
      INSERT INTO clients (user_id, trainer_id)
      VALUES (${ctx.user.id}, ${trainer.id})
    `
  }

  const loaded = await loadContext(req)
  if (!loaded.ok) return loaded.response
  return handleGetMe(loaded.ctx)
}

/** Local-only: wipe the current dev persona so onboarding can be replayed. */
export async function handleDevReset(ctx: AppContext) {
  if (!devAuthEnabled()) return error('Not found', 404)
  await ctx.db.sql`DELETE FROM users WHERE id = ${ctx.user.id}`
  return json({ ok: true })
}

export async function handleTrainerLookup(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')?.trim().toUpperCase()
  if (!code) return error('Code is required')
  const db = getDatabase()
  const rows = await db.sql<{ name: string; code: string }>`
    SELECT u.name, t.code
    FROM trainers t
    JOIN users u ON u.id = t.user_id
    WHERE t.code = ${code}
  `
  if (!rows[0]) return error('No trainer found with that code', 404)
  return json(rows[0])
}

function requireTrainer(ctx: AppContext) {
  if (!ctx.trainer) return error('Trainer account required', 403)
  return null
}

function requireClient(ctx: AppContext) {
  if (!ctx.client) return error('Client account required', 403)
  return null
}

async function authorizedClient(ctx: AppContext, clientId: string | null) {
  if (ctx.client && (!clientId || clientId === ctx.client.id)) return ctx.client
  if (!ctx.trainer || !clientId) return null
  const rows = await ctx.db.sql<ClientRow>`
    SELECT id, user_id, trainer_id
    FROM clients
    WHERE id = ${clientId} AND trainer_id = ${ctx.trainer.id}
  `
  return rows[0] ?? null
}

export async function handleMovements(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const db = getDatabase()
  await ensureMovements(db)
  const rows = q
    ? await db.sql<{
        id: string
        name: string
        aliases: string[]
        muscle_groups: string[]
        youtube_url: string | null
      }>`
        SELECT id, name, aliases, muscle_groups, youtube_url
        FROM movements
        WHERE name ILIKE ${'%' + q + '%'}
           OR EXISTS (
             SELECT 1 FROM unnest(aliases) a WHERE a ILIKE ${'%' + q + '%'}
           )
        ORDER BY name
        LIMIT 80
      `
    : await db.sql<{
        id: string
        name: string
        aliases: string[]
        muscle_groups: string[]
        youtube_url: string | null
      }>`
        SELECT id, name, aliases, muscle_groups, youtube_url
        FROM movements
        ORDER BY name
      `

  const variants = await db.sql<{
    id: string
    movement_id: string
    equipment: Equipment
  }>`
    SELECT id, movement_id, equipment FROM movement_variants
  `
  const byMovement = new Map<string, Movement['variants']>()
  for (const v of variants) {
    const list = byMovement.get(v.movement_id) ?? []
    list.push({ id: v.id, equipment: v.equipment })
    byMovement.set(v.movement_id, list)
  }

  const movements: Movement[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    aliases: m.aliases ?? [],
    muscleGroups: m.muscle_groups ?? [],
    youtubeUrl: m.youtube_url,
    variants: byMovement.get(m.id) ?? [],
  }))
  return json(movements)
}

async function movementWithVariants(db: Db, id: string): Promise<Movement | null> {
  const rows = await db.sql<{
    id: string
    name: string
    aliases: string[]
    muscle_groups: string[]
    youtube_url: string | null
  }>`
    SELECT id, name, aliases, muscle_groups, youtube_url
    FROM movements
    WHERE id = ${id}
  `
  const row = rows[0]
  if (!row) return null
  const variants = await db.sql<{ id: string; equipment: Equipment }>`
    SELECT id, equipment FROM movement_variants WHERE movement_id = ${id}
  `
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
    muscleGroups: row.muscle_groups ?? [],
    youtubeUrl: row.youtube_url,
    variants: variants.map((v) => ({ id: v.id, equipment: v.equipment })),
  }
}

export async function handleCreateMovement(ctx: AppContext, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as { name?: string }
  const name = body.name?.trim()
  if (!name) return error('Movement name is required')

  const existing = await ctx.db.sql<{ id: string }>`
    SELECT id FROM movements WHERE lower(name) = lower(${name}) LIMIT 1
  `
  if (existing[0]) {
    const movement = await movementWithVariants(ctx.db, existing[0].id)
    return json(movement)
  }

  const [inserted] = await ctx.db.sql<{ id: string }>`
    INSERT INTO movements (name, aliases, muscle_groups)
    VALUES (${name}, ${[]}, ${[]})
    RETURNING id
  `
  await ctx.db.sql`
    INSERT INTO movement_variants (movement_id, equipment)
    VALUES (${inserted!.id}, ${'other'})
  `
  const movement = await movementWithVariants(ctx.db, inserted!.id)
  return json(movement, 201)
}

type TemplateRow = {
  id: string
  trainer_id: string
  name: string
  notes: string | null
  warmup: unknown
  created_at: unknown
  updated_at: unknown
}

type ExerciseRow = {
  id: string
  template_id: string
  sort_order: number
  movement_id: string
  movement_name: string
  variant_id: string | null
  equipment: Equipment | null
  set_count: number
  reps_min: number
  reps_max: number | null
  per_set_enabled: boolean
  set_prescriptions: unknown
  method: SetMethod
  method_target: unknown
  category: ExerciseCategory | null
  load_prescription: string | null
  tempo_eccentric: unknown
  tempo_pause_bottom: unknown
  tempo_concentric: unknown
  tempo_pause_top: unknown
  tempo_mode: TempoMode | null
  tempo_per_rep: unknown
  rest_after_set_seconds: number | null
  rest_after_exercise_seconds: number | null
  superset_group: string | null
  superset_order: number | null
  notes: string | null
  youtube_url: string | null
}

function mapExercise(row: ExerciseRow): TemplateExercise {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    movementId: row.movement_id,
    movementName: row.movement_name,
    variantId: row.variant_id,
    equipment: row.equipment,
    setCount: row.set_count,
    repsMin: row.reps_min,
    repsMax: row.reps_max,
    perSetEnabled: row.per_set_enabled,
    setPrescriptions: parseJsonColumn<SetPrescription[]>(row.set_prescriptions, []),
    method: row.method,
    methodTarget: asNumber(row.method_target),
    category: row.category,
    loadPrescription: row.load_prescription,
    tempoEccentric: asNumber(row.tempo_eccentric),
    tempoPauseBottom: asNumber(row.tempo_pause_bottom),
    tempoConcentric: asNumber(row.tempo_concentric),
    tempoPauseTop: asNumber(row.tempo_pause_top),
    tempoMode: row.tempo_mode === 'per_rep' ? 'per_rep' : 'default',
    tempoPerRep: parseJsonColumn<Tempo[]>(row.tempo_per_rep, []),
    restAfterSetSeconds: row.rest_after_set_seconds,
    restAfterExerciseSeconds: row.rest_after_exercise_seconds,
    supersetGroup: row.superset_group,
    supersetOrder: row.superset_order,
    notes: row.notes,
    youtubeUrl: row.youtube_url,
  }
}

function mapTemplate(row: TemplateRow, exercises?: TemplateExercise[]): WorkoutTemplate {
  return {
    id: row.id,
    trainerId: row.trainer_id,
    name: row.name,
    notes: row.notes,
    warmup: warmupToText(row.warmup),
    createdAt: asIso(row.created_at) ?? '',
    updatedAt: asIso(row.updated_at) ?? '',
    exercises,
  }
}

async function loadExercises(db: Db, templateId: string) {
  const rows = await db.sql<ExerciseRow>`
    SELECT e.*, m.name AS movement_name
    FROM template_exercises e
    JOIN movements m ON m.id = e.movement_id
    WHERE e.template_id = ${templateId}
    ORDER BY e.sort_order ASC, e.id ASC
  `
  return rows.map(mapExercise)
}

export async function handleListTemplates(ctx: AppContext) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const rows = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE trainer_id = ${ctx.trainer!.id}
    ORDER BY updated_at DESC
  `
  return json(rows.map((r) => mapTemplate(r)))
}

export async function handleCreateTemplate(ctx: AppContext, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as { name?: string }
  const name = body.name?.trim() || 'Untitled workout'
  const [row] = await ctx.db.sql<TemplateRow>`
    INSERT INTO workout_templates (trainer_id, name)
    VALUES (${ctx.trainer!.id}, ${name})
    RETURNING *
  `
  return json(mapTemplate(row!, []), 201)
}

export async function handleGetTemplate(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const rows = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!rows[0]) return error('Template not found', 404)
  const exercises = await loadExercises(ctx.db, id)
  return json(mapTemplate(rows[0], exercises))
}

export async function handleUpdateTemplate(ctx: AppContext, id: string, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as {
    name?: string
    notes?: string | null
    warmup?: string
  }
  const existing = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!existing[0]) return error('Template not found', 404)
  const name = body.name?.trim() ?? existing[0].name
  const notes = body.notes === undefined ? existing[0].notes : body.notes
  const warmup =
    body.warmup === undefined ? warmupToText(existing[0].warmup) : body.warmup
  const [row] = await ctx.db.sql<TemplateRow>`
    UPDATE workout_templates
    SET name = ${name},
        notes = ${notes},
        warmup = CAST(${JSON.stringify(warmup)} AS jsonb),
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  const exercises = await loadExercises(ctx.db, id)
  return json(mapTemplate(row!, exercises))
}

export async function handleDeleteTemplate(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  await ctx.db.sql`
    DELETE FROM workout_templates
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  return json({ ok: true })
}

export async function handleUpsertExercise(
  ctx: AppContext,
  templateId: string,
  req: Request,
  exerciseId?: string,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const owned = await ctx.db.sql<{ id: string }>`
    SELECT id FROM workout_templates
    WHERE id = ${templateId} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!owned[0]) return error('Template not found', 404)

  const body = (await req.json()) as Partial<TemplateExercise> & {
    movementId?: string
  }
  if (!exerciseId && !body.movementId) return error('Movement is required')

  if (exerciseId) {
    await ctx.db.sql`
      UPDATE template_exercises SET
        movement_id = COALESCE(${body.movementId ?? null}, movement_id),
        variant_id = ${body.variantId ?? null},
        equipment = ${body.equipment ?? null},
        set_count = ${body.setCount ?? 3},
        reps_min = ${body.repsMin ?? 8},
        reps_max = ${body.repsMax ?? null},
        per_set_enabled = ${body.perSetEnabled ?? false},
        set_prescriptions = CAST(${JSON.stringify(body.setPrescriptions ?? [])} AS jsonb),
        method = ${body.method ?? 'straight'},
        method_target = ${body.methodTarget ?? null},
        category = ${body.category ?? 'accessory'},
        load_prescription = ${body.loadPrescription || null},
        tempo_eccentric = ${body.tempoEccentric ?? null},
        tempo_pause_bottom = ${body.tempoPauseBottom ?? null},
        tempo_concentric = ${body.tempoConcentric ?? null},
        tempo_pause_top = ${body.tempoPauseTop ?? null},
        tempo_mode = ${body.tempoMode ?? 'default'},
        tempo_per_rep = CAST(${JSON.stringify(body.tempoPerRep ?? [])} AS jsonb),
        rest_after_set_seconds = ${body.restAfterSetSeconds ?? null},
        rest_after_exercise_seconds = ${body.restAfterExerciseSeconds ?? null},
        superset_group = ${body.supersetGroup || null},
        superset_order = ${body.supersetOrder ?? null},
        notes = ${body.notes ?? null},
        youtube_url = ${body.youtubeUrl ?? null},
        sort_order = ${body.sortOrder ?? 0}
      WHERE id = ${exerciseId} AND template_id = ${templateId}
    `
    const rows = await ctx.db.sql<ExerciseRow>`
      SELECT e.*, m.name AS movement_name
      FROM template_exercises e
      JOIN movements m ON m.id = e.movement_id
      WHERE e.id = ${exerciseId} AND e.template_id = ${templateId}
    `
    if (!rows[0]) return error('Exercise not found', 404)
    await ctx.db.sql`UPDATE workout_templates SET updated_at = NOW() WHERE id = ${templateId}`
    return json(mapExercise(rows[0]))
  }

  const max = await ctx.db.sql<{ max: number | null }>`
    SELECT MAX(sort_order) AS max FROM template_exercises WHERE template_id = ${templateId}
  `
  const sortOrder = body.sortOrder ?? (max[0]?.max ?? -1) + 1
  const [row] = await ctx.db.sql<ExerciseRow>`
    INSERT INTO template_exercises (
      template_id, sort_order, movement_id, variant_id, equipment,
      set_count, reps_min, reps_max, per_set_enabled, set_prescriptions,
      method, method_target, category, load_prescription,
      tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
      tempo_mode, tempo_per_rep,
      rest_after_set_seconds, rest_after_exercise_seconds,
      superset_group, superset_order, notes, youtube_url
    ) VALUES (
      ${templateId}, ${sortOrder}, ${body.movementId!}, ${body.variantId ?? null},
      ${body.equipment ?? null}, ${body.setCount ?? 3}, ${body.repsMin ?? 8},
      ${body.repsMax ?? null}, ${body.perSetEnabled ?? false},
      CAST(${JSON.stringify(body.setPrescriptions ?? [])} AS jsonb),
      ${body.method ?? 'straight'}, ${body.methodTarget ?? null},
      ${body.category ?? 'accessory'}, ${body.loadPrescription || null},
      ${body.tempoEccentric ?? null}, ${body.tempoPauseBottom ?? null},
      ${body.tempoConcentric ?? null}, ${body.tempoPauseTop ?? null},
      ${body.tempoMode ?? 'default'}, CAST(${JSON.stringify(body.tempoPerRep ?? [])} AS jsonb),
      ${body.restAfterSetSeconds ?? null}, ${body.restAfterExerciseSeconds ?? null},
      ${body.supersetGroup || null}, ${body.supersetOrder ?? null},
      ${body.notes ?? null}, ${body.youtubeUrl ?? null}
    )
    RETURNING id
  `
  const inserted = await ctx.db.sql<ExerciseRow>`
    SELECT e.*, m.name AS movement_name
    FROM template_exercises e
    JOIN movements m ON m.id = e.movement_id
    WHERE e.id = ${row!.id}
  `
  await ctx.db.sql`UPDATE workout_templates SET updated_at = NOW() WHERE id = ${templateId}`
  return json(mapExercise(inserted[0]!), 201)
}

export async function handleReorderExercises(
  ctx: AppContext,
  templateId: string,
  req: Request,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const owned = await ctx.db.sql<{ id: string }>`
    SELECT id FROM workout_templates
    WHERE id = ${templateId} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!owned[0]) return error('Template not found', 404)

  const body = (await req.json()) as { exerciseIds?: string[] }
  const exerciseIds = body.exerciseIds ?? []
  const existing = await loadExercises(ctx.db, templateId)
  const existingIds = new Set(existing.map((ex) => ex.id))
  if (
    exerciseIds.length !== existing.length ||
    new Set(exerciseIds).size !== exerciseIds.length ||
    exerciseIds.some((id) => !existingIds.has(id))
  ) {
    return error('Exercise order does not match this workout')
  }

  for (let i = 0; i < exerciseIds.length; i++) {
    await ctx.db.sql`
      UPDATE template_exercises
      SET sort_order = ${i}
      WHERE id = ${exerciseIds[i]!} AND template_id = ${templateId}
    `
  }
  await ctx.db.sql`UPDATE workout_templates SET updated_at = NOW() WHERE id = ${templateId}`
  const rows = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${templateId} AND trainer_id = ${ctx.trainer!.id}
  `
  const exercises = await loadExercises(ctx.db, templateId)
  return json(mapTemplate(rows[0]!, exercises))
}

export async function handleDeleteExercise(
  ctx: AppContext,
  templateId: string,
  exerciseId: string,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  await ctx.db.sql`
    DELETE FROM template_exercises
    WHERE id = ${exerciseId}
      AND template_id = ${templateId}
      AND template_id IN (
        SELECT id FROM workout_templates WHERE trainer_id = ${ctx.trainer!.id}
      )
  `
  return json({ ok: true })
}

export async function handleTrainerClients(ctx: AppContext) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const rows = await ctx.db.sql<{
    id: string
    user_id: string
    name: string
    email: string
    upcoming_count: string
  }>`
    SELECT
      c.id,
      c.user_id,
      u.name,
      u.email,
      (
        SELECT COUNT(*)::text FROM sessions s
        WHERE s.client_id = c.id
          AND s.status = 'assigned'
          AND s.scheduled_date >= CURRENT_DATE
      ) AS upcoming_count
    FROM clients c
    JOIN users u ON u.id = c.user_id
    WHERE c.trainer_id = ${ctx.trainer!.id}
    ORDER BY u.name
  `
  return json(
    rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      email: r.email,
      upcomingCount: Number(r.upcoming_count),
    })),
  )
}

async function buildPrescription(db: Db, templateId: string): Promise<Prescription> {
  const templates = await db.sql<TemplateRow>`
    SELECT * FROM workout_templates WHERE id = ${templateId}
  `
  const template = templates[0]
  if (!template) throw new Error('Template missing')
  const exercises = await loadExercises(db, templateId)
  return {
    warmup: warmupToText(template.warmup),
    exercises: exercises.map(
      (ex): PrescribedExercise => ({
        movementId: ex.movementId,
        movementName: ex.movementName ?? '',
        variantId: ex.variantId,
        equipment: ex.equipment,
        setCount: ex.setCount,
        repsMin: ex.repsMin,
        repsMax: ex.repsMax,
        perSetEnabled: ex.perSetEnabled,
        setPrescriptions: ex.setPrescriptions,
        method: ex.method,
        methodTarget: ex.methodTarget,
        category: ex.category,
        loadPrescription: ex.loadPrescription,
        tempo: {
          eccentric: ex.tempoEccentric,
          pauseBottom: ex.tempoPauseBottom,
          concentric: ex.tempoConcentric,
          pauseTop: ex.tempoPauseTop,
        },
        tempoMode: ex.tempoMode,
        tempoPerRep: ex.tempoPerRep,
        restAfterSetSeconds: ex.restAfterSetSeconds,
        restAfterExerciseSeconds: ex.restAfterExerciseSeconds,
        supersetGroup: ex.supersetGroup,
        supersetOrder: ex.supersetOrder,
        notes: ex.notes,
        youtubeUrl: ex.youtubeUrl,
      }),
    ),
  }
}

type SessionRow = {
  id: string
  client_id: string
  trainer_id: string
  template_id: string | null
  name: string
  scheduled_date: unknown
  status: Session['status']
  prescription: unknown
  logged_duration_seconds: number | null
  completed_at: unknown
  client_name?: string
}

function mapSession(row: SessionRow, logs: SetLog[] = []): Session {
  return {
    id: row.id,
    clientId: row.client_id,
    trainerId: row.trainer_id,
    templateId: row.template_id,
    name: row.name,
    scheduledDate: asDate(row.scheduled_date),
    status: row.status,
    prescription: (() => {
      const prescription = parseJsonColumn<Prescription>(row.prescription, {
        warmup: '',
        exercises: [],
      })
      return { ...prescription, warmup: warmupToText(prescription.warmup) }
    })(),
    loggedDurationSeconds: row.logged_duration_seconds,
    completedAt: asIso(row.completed_at),
    logs,
    clientName: row.client_name,
  }
}

async function loadLogs(db: Db, sessionId: string): Promise<SetLog[]> {
  const rows = await db.sql<{
    exercise_index: number
    set_index: number
    weight: unknown
    reps: number | null
    completed: boolean
  }>`
    SELECT exercise_index, set_index, weight, reps, completed
    FROM session_set_logs
    WHERE session_id = ${sessionId}
    ORDER BY exercise_index, set_index
  `
  return rows.map((r) => ({
    exerciseIndex: r.exercise_index,
    setIndex: r.set_index,
    weight: asNumber(r.weight),
    reps: r.reps,
    completed: r.completed,
  }))
}

export async function handleAssignSession(ctx: AppContext, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as {
    clientId?: string
    templateId?: string
    date?: string
  }
  if (!body.clientId || !body.templateId || !body.date) {
    return error('clientId, templateId, and date are required')
  }
  const clients = await ctx.db.sql<{ id: string }>`
    SELECT id FROM clients
    WHERE id = ${body.clientId} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!clients[0]) return error('Client not found', 404)
  const templates = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${body.templateId} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!templates[0]) return error('Template not found', 404)
  const prescription = await buildPrescription(ctx.db, body.templateId)
  const [row] = await ctx.db.sql<SessionRow>`
    INSERT INTO sessions (
      client_id, trainer_id, template_id, name, scheduled_date, prescription
    ) VALUES (
      ${body.clientId},
      ${ctx.trainer!.id},
      ${body.templateId},
      ${templates[0].name},
      ${body.date},
      CAST(${JSON.stringify(prescription)} AS jsonb)
    )
    RETURNING *
  `
  return json(mapSession(row!), 201)
}

export async function handleDeleteSession(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  await ctx.db.sql`
    DELETE FROM sessions WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  return json({ ok: true })
}

export async function handleListSessions(ctx: AppContext, req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (ctx.trainer) {
    const rows = await ctx.db.sql<SessionRow>`
      SELECT s.*, u.name AS client_name
      FROM sessions s
      JOIN clients c ON c.id = s.client_id
      JOIN users u ON u.id = c.user_id
      WHERE s.trainer_id = ${ctx.trainer.id}
        AND (${clientId}::text IS NULL OR s.client_id::text = ${clientId})
        AND (${from}::date IS NULL OR s.scheduled_date >= ${from}::date)
        AND (${to}::date IS NULL OR s.scheduled_date <= ${to}::date)
      ORDER BY s.scheduled_date DESC, s.created_at DESC
    `
    return json(rows.map((r) => mapSession(r)))
  }

  const denied = requireClient(ctx)
  if (denied) return denied
  const rows = await ctx.db.sql<SessionRow>`
    SELECT * FROM sessions
    WHERE client_id = ${ctx.client!.id}
      AND (${from}::date IS NULL OR scheduled_date >= ${from}::date)
      AND (${to}::date IS NULL OR scheduled_date <= ${to}::date)
    ORDER BY scheduled_date DESC
  `
  return json(rows.map((r) => mapSession(r)))
}

async function canViewSession(ctx: AppContext, session: SessionRow) {
  if (ctx.trainer && session.trainer_id === ctx.trainer.id) return true
  if (ctx.client && session.client_id === ctx.client.id) return true
  return false
}

export async function handleGetSession(ctx: AppContext, id: string) {
  const rows = await ctx.db.sql<SessionRow>`
    SELECT s.*, u.name AS client_name
    FROM sessions s
    JOIN clients c ON c.id = s.client_id
    JOIN users u ON u.id = c.user_id
    WHERE s.id = ${id}
  `
  if (!rows[0] || !(await canViewSession(ctx, rows[0]))) {
    return error('Session not found', 404)
  }
  const logs = await loadLogs(ctx.db, id)
  return json(mapSession(rows[0], logs))
}

function validSessionPrescription(value: unknown): value is Prescription {
  if (!value || typeof value !== 'object') return false
  const prescription = value as Partial<Prescription>
  if (typeof prescription.warmup !== 'string' || !Array.isArray(prescription.exercises)) {
    return false
  }
  if (prescription.exercises.length > 200) return false
  const methods: SetMethod[] = [
    'straight',
    'reps_range',
    'timed',
    'amrap',
    'rir',
    'rpe',
    'to_failure',
  ]
  return prescription.exercises.every((exercise) => {
    if (!exercise || typeof exercise !== 'object') return false
    if (
      typeof exercise.movementId !== 'string' ||
      !exercise.movementId ||
      typeof exercise.movementName !== 'string' ||
      !exercise.movementName.trim() ||
      !Number.isInteger(exercise.setCount) ||
      exercise.setCount < 0 ||
      exercise.setCount > 100 ||
      !Number.isFinite(exercise.repsMin) ||
      !methods.includes(exercise.method)
    ) {
      return false
    }
    if (
      exercise.repsMax != null &&
      (!Number.isFinite(exercise.repsMax) || exercise.repsMax < exercise.repsMin)
    ) {
      return false
    }
    if (exercise.perSetEnabled) {
      if (
        !Array.isArray(exercise.setPrescriptions) ||
        exercise.setPrescriptions.length !== exercise.setCount
      ) {
        return false
      }
      if (
        exercise.setPrescriptions.some(
          (set) =>
            !Number.isFinite(set.repsMin) ||
            (set.repsMax != null &&
              (!Number.isFinite(set.repsMax) || set.repsMax < set.repsMin)),
        )
      ) {
        return false
      }
    }
    return true
  })
}

export async function handleUpdateSession(ctx: AppContext, id: string, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as {
    name?: unknown
    prescription?: unknown
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return error('Workout name is required')
  if (!validSessionPrescription(body.prescription)) {
    return error('Invalid workout prescription')
  }

  const [updated] = await ctx.db.sql<SessionRow>`
    UPDATE sessions AS s
    SET
      name = ${name},
      prescription = CAST(${JSON.stringify(body.prescription)} AS jsonb)
    WHERE s.id = ${id}
      AND s.trainer_id = ${ctx.trainer!.id}
      AND s.status = 'assigned'
      AND NOT EXISTS (
        SELECT 1 FROM session_set_logs AS l WHERE l.session_id = s.id
      )
    RETURNING s.*
  `
  if (updated) return json(mapSession(updated))

  const owned = await ctx.db.sql<{ id: string }>`
    SELECT id FROM sessions
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!owned[0]) return error('Session not found', 404)
  return error('This workout is locked because client logging has started', 409)
}

export async function handleLogSession(ctx: AppContext, id: string, req: Request) {
  const denied = requireClient(ctx)
  if (denied) return denied
  const rows = await ctx.db.sql<SessionRow>`
    SELECT * FROM sessions WHERE id = ${id} AND client_id = ${ctx.client!.id}
  `
  if (!rows[0]) return error('Session not found', 404)
  const body = (await req.json()) as {
    logs?: SetLog[]
    durationSeconds?: number | null
    status?: Session['status']
  }

  if (body.logs) {
    for (const log of body.logs) {
      await ctx.db.sql`
        INSERT INTO session_set_logs (
          session_id, exercise_index, set_index, weight, reps, completed
        ) VALUES (
          ${id}, ${log.exerciseIndex}, ${log.setIndex},
          ${log.weight ?? null}, ${log.reps ?? null}, ${log.completed}
        )
        ON CONFLICT (session_id, exercise_index, set_index)
        DO UPDATE SET
          weight = EXCLUDED.weight,
          reps = EXCLUDED.reps,
          completed = EXCLUDED.completed
      `
    }
  }

  const status = body.status ?? rows[0].status
  const duration =
    body.durationSeconds === undefined
      ? rows[0].logged_duration_seconds
      : body.durationSeconds
  const completedAt =
    status === 'completed' ? (rows[0].completed_at ? asIso(rows[0].completed_at) : new Date().toISOString()) : null

  const [updated] = await ctx.db.sql<SessionRow>`
    UPDATE sessions SET
      status = ${status},
      logged_duration_seconds = ${duration},
      completed_at = ${completedAt}
    WHERE id = ${id}
    RETURNING *
  `
  const logs = await loadLogs(ctx.db, id)
  return json(mapSession(updated!, logs))
}

export async function handleAdHoc(ctx: AppContext, req: Request) {
  if (req.method === 'GET') {
    const rows = await ctx.db.sql<{
      id: string
      activity_type: AdHocType
      duration_seconds: number
      notes: string | null
      logged_on: unknown
    }>`
      SELECT id, activity_type, duration_seconds, notes, logged_on
      FROM ad_hoc_logs
      WHERE user_id = ${ctx.user.id}
      ORDER BY logged_on DESC, created_at DESC
      LIMIT 100
    `
    return json(
      rows.map((r) => ({
        id: r.id,
        activityType: r.activity_type,
        durationSeconds: r.duration_seconds,
        notes: r.notes,
        loggedOn: asDate(r.logged_on),
      })),
    )
  }

  const body = (await req.json()) as {
    activityType?: AdHocType
    durationMinutes?: number
    notes?: string
    loggedOn?: string
  }
  if (!body.activityType || !body.durationMinutes) {
    return error('activityType and durationMinutes are required')
  }
  const loggedOn = body.loggedOn || new Date().toISOString().slice(0, 10)
  const [row] = await ctx.db.sql<{
    id: string
    activity_type: AdHocType
    duration_seconds: number
    notes: string | null
    logged_on: unknown
  }>`
    INSERT INTO ad_hoc_logs (user_id, activity_type, duration_seconds, notes, logged_on)
    VALUES (
      ${ctx.user.id},
      ${body.activityType},
      ${Math.round(body.durationMinutes * 60)},
      ${body.notes ?? null},
      ${loggedOn}
    )
    RETURNING id, activity_type, duration_seconds, notes, logged_on
  `
  return json(
    {
      id: row!.id,
      activityType: row!.activity_type,
      durationSeconds: row!.duration_seconds,
      notes: row!.notes,
      loggedOn: asDate(row!.logged_on),
    },
    201,
  )
}

export async function handleActivity(ctx: AppContext, req: Request) {
  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year') || new Date().getFullYear())
  const requestedClientId = url.searchParams.get('clientId')
  const subjectClient = await authorizedClient(ctx, requestedClientId)
  if (requestedClientId && !subjectClient) return error('Client not found', 404)
  const subjectUserId = subjectClient?.user_id ?? ctx.user.id
  const start = `${year}-01-01`
  const end = `${year}-12-31`

  const sessionRows = subjectClient
    ? await ctx.db.sql<{ day: unknown; seconds: string }>`
        SELECT scheduled_date AS day, SUM(COALESCE(logged_duration_seconds, 0))::text AS seconds
        FROM sessions
        WHERE client_id = ${subjectClient.id}
          AND status = 'completed'
          AND scheduled_date >= ${start}::date
          AND scheduled_date <= ${end}::date
        GROUP BY scheduled_date
      `
    : []

  const adHocRows = await ctx.db.sql<{ day: unknown; seconds: string }>`
    SELECT logged_on AS day, SUM(duration_seconds)::text AS seconds
    FROM ad_hoc_logs
    WHERE user_id = ${subjectUserId}
      AND logged_on >= ${start}::date
      AND logged_on <= ${end}::date
    GROUP BY logged_on
  `

  const minutes = new Map<string, number>()
  for (const row of [...sessionRows, ...adHocRows]) {
    const day = asDate(row.day)
    minutes.set(day, (minutes.get(day) ?? 0) + Number(row.seconds) / 60)
  }
  return json(
    [...minutes.entries()].map(([date, mins]) => ({
      date,
      minutes: Math.round(mins),
    })),
  )
}

export async function handleExerciseHistory(ctx: AppContext, req: Request) {
  const url = new URL(req.url)
  const movementId = url.searchParams.get('movementId')
  if (!movementId) return error('movementId is required')
  const subjectClient = await authorizedClient(ctx, url.searchParams.get('clientId'))
  if (!subjectClient) return error('Client not found', 404)
  const rows = await ctx.db.sql<{
    scheduled_date: unknown
    name: string
    set_index: number
    weight: unknown
    reps: number | null
  }>`
    SELECT s.scheduled_date, s.name, l.set_index, l.weight, l.reps
    FROM session_set_logs l
    JOIN sessions s ON s.id = l.session_id
    WHERE s.client_id = ${subjectClient.id}
      AND l.completed = TRUE
      AND s.prescription -> 'exercises' -> l.exercise_index ->> 'movementId' = ${movementId}
    ORDER BY s.scheduled_date DESC, l.set_index ASC
    LIMIT 80
  `
  return json(
    rows.map((r) => ({
      date: asDate(r.scheduled_date),
      sessionName: r.name,
      setIndex: r.set_index,
      weight: asNumber(r.weight),
      reps: r.reps,
    })),
  )
}

export async function handleLoggedMovements(ctx: AppContext, req: Request) {
  const subjectClient = await authorizedClient(
    ctx,
    new URL(req.url).searchParams.get('clientId'),
  )
  if (!subjectClient) return error('Client not found', 404)
  const rows = await ctx.db.sql<{ id: string; name: string; aliases: string[] }>`
    SELECT DISTINCT m.id, m.name, m.aliases
    FROM session_set_logs l
    JOIN sessions s ON s.id = l.session_id
    JOIN movements m
      ON m.id::text = s.prescription -> 'exercises' -> l.exercise_index ->> 'movementId'
    WHERE s.client_id = ${subjectClient.id}
      AND l.completed = TRUE
    ORDER BY m.name
  `
  return json(rows)
}

export async function handlePastWorkouts(ctx: AppContext) {
  if (ctx.client) {
    const rows = await ctx.db.sql<SessionRow>`
      SELECT * FROM sessions
      WHERE client_id = ${ctx.client.id}
        AND status IN ('completed', 'skipped')
      ORDER BY scheduled_date DESC
      LIMIT 50
    `
    return json(rows.map((r) => mapSession(r)))
  }
  const adHoc = await ctx.db.sql<{
    id: string
    activity_type: AdHocType
    duration_seconds: number
    notes: string | null
    logged_on: unknown
  }>`
    SELECT id, activity_type, duration_seconds, notes, logged_on
    FROM ad_hoc_logs
    WHERE user_id = ${ctx.user.id}
    ORDER BY logged_on DESC
    LIMIT 50
  `
  return json({
    sessions: [],
    adHoc: adHoc.map((r) => ({
      id: r.id,
      activityType: r.activity_type,
      durationSeconds: r.duration_seconds,
      notes: r.notes,
      loggedOn: asDate(r.logged_on),
    })),
  })
}
