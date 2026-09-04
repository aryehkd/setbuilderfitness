import { getUser } from '@netlify/identity'
import { getDatabase } from '@netlify/database'
import type {
  AdHocType,
  Equipment,
  ExerciseCategory,
  MeResponse,
  Movement,
  MovementHistoryById,
  MovementPrescriptionDefaults,
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
  Program,
  ProgramSession,
  VersionHistoryEvent,
} from '../../shared/types.ts'
import { setLogIsCompleted, warmupToText } from '../../shared/types.ts'
import { movementMatchesQuery } from '../../shared/search.ts'
import {
  assignedEvent,
  diffHistoryExercises,
  diffPrescriptions,
  diffProgramPlacement,
  diffTemplateMeta,
  editEvents,
  historyExerciseFromTemplate,
  parseVersionHistory,
} from '../../shared/versionHistory.ts'
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
  phone: string | null
  location: string | null
  website: string | null
  timezone: string | null
  accent_color: string | null
  onboarding_completed_at: unknown
}

type TrainerRow = { id: string; user_id: string; code: string }
type ClientRow = {
  id: string
  user_id: string
  trainer_id: string | null
  is_self: boolean
}

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
  await ensureUserProfileColumns(db)
  await ensureTrainerSelfClients(db)
  await ensureMovementCatalog(db)
  await ensureProgramTables(db)
  await ensureLibrarySharesTable(db)

  const existing = await db.sql<AppUser>`
    SELECT id, email, name, role, bio, phone, location, website, timezone, accent_color, onboarding_completed_at
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
      RETURNING id, email, name, role, bio, phone, location, website, timezone, accent_color, onboarding_completed_at
    `
    user = inserted[0]!
  }

  const trainers = await db.sql<TrainerRow>`
    SELECT id, user_id, code FROM trainers WHERE user_id = ${user.id}
  `
  const clients = await db.sql<ClientRow>`
    SELECT id, user_id, trainer_id, is_self FROM clients WHERE user_id = ${user.id}
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

let userProfileColumnsReady = false
let trainerSelfClientsReady = false
let movementCatalogReady = false
let programTablesReady = false
let librarySharesReady = false

async function ensureUserProfileColumns(db: Db) {
  if (userProfileColumnsReady) return
  await db.sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS location TEXT,
      ADD COLUMN IF NOT EXISTS website TEXT,
      ADD COLUMN IF NOT EXISTS timezone TEXT,
      ADD COLUMN IF NOT EXISTS accent_color TEXT
  `
  userProfileColumnsReady = true
}

async function ensureTrainerSelfClients(db: Db) {
  if (trainerSelfClientsReady) return
  await db.sql`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT FALSE
  `
  await db.sql`
    INSERT INTO clients (user_id, trainer_id, is_self)
    SELECT t.user_id, t.id, TRUE
    FROM trainers t
    ON CONFLICT (user_id) DO UPDATE
    SET trainer_id = EXCLUDED.trainer_id,
        is_self = TRUE
  `
  await db.sql`
    CREATE INDEX IF NOT EXISTS clients_trainer_self_idx
    ON clients (trainer_id, is_self)
  `
  trainerSelfClientsReady = true
}

async function ensureProgramTables(db: Db) {
  if (programTablesReady) return
  await db.sql`
    CREATE TABLE IF NOT EXISTS programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      notes TEXT,
      week_count INT NOT NULL DEFAULT 4,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await db.sql`CREATE INDEX IF NOT EXISTS programs_trainer_id_idx ON programs (trainer_id)`
  await db.sql`
    CREATE TABLE IF NOT EXISTS program_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      week_index INT NOT NULL,
      weekday INT NOT NULL,
      prescription JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await db.sql`CREATE INDEX IF NOT EXISTS program_sessions_program_id_idx ON program_sessions (program_id)`
  await db.sql`
    UPDATE program_sessions ps
    SET name = wt.name || ' - Week ' || (ps.week_index + 1)::text || ' - ' || p.name,
        updated_at = NOW()
    FROM workout_templates wt, programs p
    WHERE ps.template_id = wt.id
      AND ps.program_id = p.id
      AND ps.name = wt.name
  `
  programTablesReady = true
}

async function ensureLibrarySharesTable(db: Db) {
  if (librarySharesReady) return
  await db.sql`
    CREATE TABLE IF NOT EXISTS library_shares (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
      recipient_trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('workout', 'program')),
      resource_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ
    )
  `
  await db.sql`
    CREATE INDEX IF NOT EXISTS library_shares_recipient_status_idx
    ON library_shares (recipient_trainer_id, status)
  `
  await db.sql`
    CREATE INDEX IF NOT EXISTS library_shares_owner_idx
    ON library_shares (owner_trainer_id)
  `
  await db.sql`
    CREATE UNIQUE INDEX IF NOT EXISTS library_shares_pending_unique
    ON library_shares (recipient_trainer_id, resource_type, resource_id)
    WHERE status = 'pending'
  `
  librarySharesReady = true
}

async function ensureMovementCatalog(db: Db) {
  if (!movementCatalogReady) {
    await db.sql`
      CREATE TABLE IF NOT EXISTS exercise_library (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        difficulty INT NOT NULL CHECK (difficulty BETWEEN 1 AND 10),
        category TEXT NOT NULL CHECK (
          category IN ('strength', 'cardio', 'mobility', 'stretching', 'power')
        ),
        equipment TEXT[] NOT NULL DEFAULT '{}',
        primary_muscle TEXT NOT NULL,
        secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
        muscle_intensity JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await db.sql`
      ALTER TABLE movements
        ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS source_exercise_id TEXT REFERENCES exercise_library(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS default_category TEXT,
        ADD COLUMN IF NOT EXISTS default_equipment TEXT
    `
    await db.sql`CREATE INDEX IF NOT EXISTS movements_trainer_id_idx ON movements (trainer_id)`
    await db.sql`CREATE INDEX IF NOT EXISTS movements_source_exercise_id_idx ON movements (source_exercise_id)`
    await db.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS movements_shared_source_unique
      ON movements (source_exercise_id)
      WHERE trainer_id IS NULL AND source_exercise_id IS NOT NULL
    `
    await db.sql`
      CREATE TABLE IF NOT EXISTS trainer_movement_defaults (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
        movement_id UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
        defaults JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (trainer_id, movement_id)
      )
    `
    await db.sql`
      CREATE INDEX IF NOT EXISTS trainer_movement_defaults_trainer_id_idx
      ON trainer_movement_defaults (trainer_id)
    `
    await db.sql`DROP INDEX IF EXISTS movements_name_unique`
    await db.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS movements_shared_name_unique
      ON movements (lower(name))
      WHERE trainer_id IS NULL
    `
    await db.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS movements_trainer_name_unique
      ON movements (trainer_id, lower(name))
      WHERE trainer_id IS NOT NULL
    `
    await db.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS movements_trainer_source_unique
      ON movements (trainer_id, source_exercise_id)
      WHERE trainer_id IS NOT NULL AND source_exercise_id IS NOT NULL
    `
    await db.sql`
      CREATE TABLE IF NOT EXISTS exercise_library (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        difficulty INT NOT NULL CHECK (difficulty BETWEEN 1 AND 10),
        category TEXT NOT NULL CHECK (
          category IN ('strength', 'cardio', 'mobility', 'stretching', 'power')
        ),
        equipment TEXT[] NOT NULL DEFAULT '{}',
        primary_muscle TEXT NOT NULL,
        secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
        muscle_intensity JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await db.sql`CREATE INDEX IF NOT EXISTS exercise_library_name_idx ON exercise_library (lower(name))`
    await db.sql`CREATE INDEX IF NOT EXISTS exercise_library_category_idx ON exercise_library (category)`
    await db.sql`
      CREATE INDEX IF NOT EXISTS exercise_library_primary_muscle_idx
      ON exercise_library (lower(primary_muscle))
    `
    movementCatalogReady = true
  }

  const [{ count }] = await db.sql<{ count: string }>`
    SELECT COUNT(*)::text AS count FROM movements
  `
  if (Number(count) > 0) return
  const [{ count: libraryCount }] = await db.sql<{ count: string }>`
    SELECT COUNT(*)::text AS count FROM exercise_library
  `
  if (Number(libraryCount) > 0) return

  for (const seed of MOVEMENT_SEEDS) {
    const [movement] = await db.sql<{ id: string }>`
      INSERT INTO movements (name, aliases, muscle_groups, youtube_url, default_equipment)
      VALUES (
        ${seed.name},
        ${seed.aliases ?? []},
        ${seed.muscles},
        ${seed.youtube ?? null},
        ${seed.equipment[0] ?? null}
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

function catalogTrainerId(ctx: AppContext) {
  return ctx.trainer?.id ?? ctx.client?.trainer_id ?? null
}

type MovementRow = {
  id: string
  trainer_id: string | null
  source_exercise_id: string | null
  name: string
  aliases: string[]
  muscle_groups: string[]
  youtube_url: string | null
  default_category: ExerciseCategory | null
  default_equipment: Equipment | null
}

function mapMovement(
  row: MovementRow,
  variants: Movement['variants'],
  savedDefaults: MovementPrescriptionDefaults | null = null,
): Movement {
  return {
    id: row.id,
    source: row.trainer_id ? 'trainer' : 'shared',
    sourceExerciseId: row.source_exercise_id,
    name: row.name,
    description: null,
    difficulty: null,
    libraryCategory: null,
    aliases: row.aliases ?? [],
    muscleGroups: row.muscle_groups ?? [],
    primaryMuscle: null,
    secondaryMuscles: [],
    muscleIntensity: {},
    youtubeUrl: row.youtube_url,
    defaultCategory: row.default_category,
    defaultEquipment: row.default_equipment,
    variants,
    savedDefaults,
  }
}

export function mePayload(ctx: AppContext, extras?: {
  trainerName?: string | null
  trainerCode?: string | null
  trainerAccentColor?: string | null
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
      phone: ctx.user.phone,
      location: ctx.user.location,
      website: ctx.user.website,
      timezone: ctx.user.timezone,
      accentColor:
        (ctx.trainer ? ctx.user.accent_color : extras?.trainerAccentColor) ?? '#c6f54e',
      onboardingCompleted: Boolean(ctx.user.onboarding_completed_at),
    },
    trainer: ctx.trainer
      ? { id: ctx.trainer.id, code: ctx.trainer.code }
      : null,
    client: ctx.client
      ? {
          id: ctx.client.id,
          trainerId: ctx.client.trainer_id,
          isSelf: ctx.client.is_self,
          trainerName: extras?.trainerName ?? null,
          trainerCode: extras?.trainerCode ?? null,
        }
      : null,
  }
}

export async function handleGetMe(ctx: AppContext) {
  let trainerName: string | null = null
  let trainerCode: string | null = null
  let trainerAccentColor: string | null = null
  if (ctx.client?.trainer_id) {
    const rows = await ctx.db.sql<{ name: string; code: string; accent_color: string | null }>`
      SELECT u.name, t.code, u.accent_color
      FROM trainers t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ${ctx.client.trainer_id}
    `
    trainerName = rows[0]?.name ?? null
    trainerCode = rows[0]?.code ?? null
    trainerAccentColor = rows[0]?.accent_color ?? null
  }
  return json(mePayload(ctx, { trainerName, trainerCode, trainerAccentColor }))
}

export async function handleGetAssignedTrainer(ctx: AppContext) {
  const denied = requireClient(ctx)
  if (denied) return denied
  if (!ctx.client!.trainer_id) return error('No trainer assigned', 404)
  const rows = await ctx.db.sql<{
    id: string
    name: string
    email: string
    phone: string | null
    location: string | null
    website: string | null
    timezone: string | null
    bio: string | null
    code: string
    accent_color: string | null
  }>`
    SELECT t.id, u.name, u.email, u.phone, u.location, u.website, u.timezone, u.bio, t.code, u.accent_color
    FROM trainers t
    JOIN users u ON u.id = t.user_id
    WHERE t.id = ${ctx.client!.trainer_id}
  `
  const row = rows[0]
  if (!row) return error('Trainer not found', 404)
  return json({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    website: row.website,
    timezone: row.timezone,
    bio: row.bio,
    code: row.code,
    accentColor: row.accent_color ?? '#c6f54e',
  })
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export async function handleUpdateProfile(ctx: AppContext, req: Request) {
  const body = (await req.json()) as {
    name?: unknown
    email?: unknown
    phone?: unknown
    location?: unknown
    website?: unknown
    timezone?: unknown
    bio?: unknown
    accentColor?: unknown
  }
  const name = optionalText(body.name)
  const email = optionalText(body.email)
  if (!name) return error('Name is required')
  if (!email || !email.includes('@')) return error('A valid email is required')
  const accentColor = optionalText(body.accentColor)
  if (ctx.trainer && (!accentColor || !/^#[0-9a-f]{6}$/i.test(accentColor))) {
    return error('Choose a valid Theme color')
  }

  await ctx.db.sql`
    UPDATE users
    SET name = ${name},
        email = ${email},
        phone = ${optionalText(body.phone)},
        location = ${optionalText(body.location)},
        website = ${optionalText(body.website)},
        timezone = ${optionalText(body.timezone)},
        bio = ${optionalText(body.bio)},
        accent_color = CASE
          WHEN ${Boolean(ctx.trainer)} THEN ${accentColor}
          ELSE accent_color
        END
    WHERE id = ${ctx.user.id}
  `

  const loaded = await loadContext(req)
  if (!loaded.ok) return loaded.response
  return handleGetMe(loaded.ctx)
}

export async function handleOnboarding(ctx: AppContext, req: Request) {
  if (ctx.user.onboarding_completed_at) {
    return error('Onboarding already completed', 409)
  }
  const body = (await req.json()) as {
    role?: string
    name?: string
    email?: string
    phone?: string
    location?: string
    website?: string
    timezone?: string
    bio?: string
    accentColor?: string
    trainerCode?: string
  }
  const name = body.name?.trim()
  if (!name) return error('Name is required')
  if (body.role !== 'trainer' && body.role !== 'client') {
    return error('Choose trainer or client')
  }

  if (body.role === 'trainer') {
    const email = optionalText(body.email)
    const timezone = optionalText(body.timezone)
    const bio = optionalText(body.bio)
    const accentColor = optionalText(body.accentColor)
    if (!email || !email.includes('@')) return error('A valid email is required')
    if (!timezone) return error('Timezone is required')
    if (!bio) return error('Bio is required')
    if (!accentColor || !/^#[0-9a-f]{6}$/i.test(accentColor)) {
      return error('Choose a valid Theme color')
    }
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
          email = ${email},
          phone = ${optionalText(body.phone)},
          location = ${optionalText(body.location)},
          website = ${optionalText(body.website)},
          timezone = ${timezone},
          bio = ${bio},
          accent_color = ${accentColor},
          role = 'trainer',
          onboarding_completed_at = NOW()
      WHERE id = ${ctx.user.id}
    `
    const [trainer] = await ctx.db.sql<{ id: string }>`
      INSERT INTO trainers (user_id, code)
      VALUES (${ctx.user.id}, ${code})
      RETURNING id
    `
    await ctx.db.sql`
      INSERT INTO clients (user_id, trainer_id, is_self)
      VALUES (${ctx.user.id}, ${trainer!.id}, TRUE)
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

/**
 * Wipe this user's app data so they can pick trainer vs client again.
 * The Identity login is kept; the next /api/me recreates an empty user row.
 *
 * Trainers also unassign other clients and delete workouts assigned from this
 * account, because those rows still reference the trainer id.
 */
async function wipeCurrentUser(ctx: AppContext) {
  if (ctx.trainer) {
    const trainerId = ctx.trainer.id
    await ctx.db.sql`DELETE FROM sessions WHERE trainer_id = ${trainerId}`
    await ctx.db.sql`
      UPDATE clients
      SET trainer_id = NULL
      WHERE trainer_id = ${trainerId} AND user_id <> ${ctx.user.id}
    `
    await ctx.db.sql`DELETE FROM workout_templates WHERE trainer_id = ${trainerId}`
    await ctx.db.sql`DELETE FROM programs WHERE trainer_id = ${trainerId}`
    await ctx.db.sql`DELETE FROM movements WHERE trainer_id = ${trainerId}`
  }
  await ctx.db.sql`DELETE FROM users WHERE id = ${ctx.user.id}`
}

export async function handleResetAccount(ctx: AppContext, req: Request) {
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown }
  if (body.confirm !== true) {
    return error('Confirmation is required')
  }
  await wipeCurrentUser(ctx)
  return json({ ok: true })
}

/** Local-only: wipe the current dev persona so onboarding can be replayed. */
export async function handleDevReset(ctx: AppContext) {
  if (!devAuthEnabled()) return error('Not found', 404)
  await wipeCurrentUser(ctx)
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
    SELECT id, user_id, trainer_id, is_self
    FROM clients
    WHERE id = ${clientId} AND trainer_id = ${ctx.trainer.id}
  `
  return rows[0] ?? null
}

type ExerciseLibraryRow = {
  id: string
  name: string
  description: string
  difficulty: number
  category: string
  equipment: string[]
  primary_muscle: string
  secondary_muscles: string[]
  muscle_intensity: Record<string, string>
}

function humanizeExerciseName(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function appEquipment(values: string[]): Equipment {
  const value = values[0]?.toLowerCase()
  if (value === 'bodyweight') return 'bodyweight'
  if (value === 'barbell') return 'barbell'
  if (value === 'dumbbell' || value === 'weights') return 'dumbbell'
  if (value === 'machine') return 'machine'
  if (value === 'cable') return 'cable'
  if (value === 'kettlebell') return 'kettlebell'
  if (value === 'band' || value === 'bands' || value === 'resistance band') return 'band'
  if (value === 'box' || value === 'plyo box') return 'box'
  return 'other'
}

export async function handleMovements(ctx: AppContext, req: Request) {
  const url = new URL(req.url)
  const query = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
  const trainerId = catalogTrainerId(ctx)
  const rows = trainerId
    ? await ctx.db.sql<MovementRow>`
        SELECT id, trainer_id, source_exercise_id, name, aliases, muscle_groups,
               youtube_url, default_category, default_equipment
        FROM movements
        WHERE trainer_id = ${trainerId}
        ORDER BY name
      `
    : []

  const library = await ctx.db.sql<ExerciseLibraryRow>`
    SELECT id, name, description, difficulty, category, equipment,
           primary_muscle, secondary_muscles, muscle_intensity
    FROM exercise_library
    ORDER BY name
  `
  const canonicalRows = await ctx.db.sql<MovementRow>`
    SELECT id, trainer_id, source_exercise_id, name, aliases, muscle_groups,
           youtube_url, default_category, default_equipment
    FROM movements
    WHERE trainer_id IS NULL AND source_exercise_id IS NOT NULL
  `
  const canonicalBySource = new Map(
    canonicalRows
      .filter((row) => row.source_exercise_id)
      .map((row) => [row.source_exercise_id!, row]),
  )

  const variants = await ctx.db.sql<{
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

  const defaultsByMovement = new Map<string, MovementPrescriptionDefaults>()
  if (trainerId) {
    const defaults = await ctx.db.sql<{ movement_id: string; defaults: unknown }>`
      SELECT movement_id, defaults
      FROM trainer_movement_defaults
      WHERE trainer_id = ${trainerId}
    `
    for (const item of defaults) {
      defaultsByMovement.set(
        item.movement_id,
        parseJsonColumn<MovementPrescriptionDefaults>(item.defaults, {
          setCount: 3,
          repsMin: 8,
          method: 'straight',
        }),
      )
    }
  }

  const personal = rows.map((row) =>
    mapMovement(
      row,
      byMovement.get(row.id) ?? [],
      defaultsByMovement.get(row.id) ?? null,
    ),
  )
  const overriddenSources = new Set(
    personal.map((movement) => movement.sourceExerciseId).filter(Boolean),
  )
  const overriddenNames = new Set(personal.map((movement) => movement.name.toLowerCase()))
  const shared: Movement[] = library
    .filter(
      (exercise) =>
        !overriddenSources.has(exercise.id) &&
        !overriddenNames.has(humanizeExerciseName(exercise.name).toLowerCase()),
    )
    .map((exercise) => {
      const canonical = canonicalBySource.get(exercise.id)
      const equipment = appEquipment(exercise.equipment)
      return {
        id: canonical?.id ?? `shared:${exercise.id}`,
        source: 'shared',
        sourceExerciseId: exercise.id,
        name: humanizeExerciseName(exercise.name),
        description: exercise.description,
        difficulty: exercise.difficulty,
        libraryCategory: exercise.category,
        aliases: [],
        muscleGroups: [exercise.primary_muscle, ...(exercise.secondary_muscles ?? [])],
        primaryMuscle: exercise.primary_muscle,
        secondaryMuscles: exercise.secondary_muscles ?? [],
        muscleIntensity: exercise.muscle_intensity ?? {},
        youtubeUrl: null,
        defaultCategory: 'accessory',
        defaultEquipment: equipment,
        variants: canonical ? byMovement.get(canonical.id) ?? [] : [],
        savedDefaults: canonical
          ? defaultsByMovement.get(canonical.id) ?? null
          : null,
      }
    })
  const mapped = [...personal, ...shared]
    .filter((movement) => !query || movementMatchesQuery(movement, query))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, query ? 80 : undefined)
  return json(
    url.searchParams.get('saved') === 'true'
      ? mapped.filter((movement) => movement.savedDefaults)
      : mapped,
  )
}

async function movementWithVariants(db: Db, id: string): Promise<Movement | null> {
  const rows = await db.sql<MovementRow>`
    SELECT id, trainer_id, source_exercise_id, name, aliases, muscle_groups,
           youtube_url, default_category, default_equipment
    FROM movements
    WHERE id = ${id}
  `
  const row = rows[0]
  if (!row) return null
  const variants = await db.sql<{ id: string; equipment: Equipment }>`
    SELECT id, equipment FROM movement_variants WHERE movement_id = ${id}
  `
  return mapMovement(
    row,
    variants.map((v) => ({ id: v.id, equipment: v.equipment })),
  )
}

const EQUIPMENT_VALUES: Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebell',
  'band',
  'box',
  'bodyweight',
  'other',
]
const CATEGORY_VALUES: ExerciseCategory[] = [
  'main_lift',
  'accessory',
  'warmup',
  'finisher',
  'rehab',
  'plyo',
]

export async function handleCreateMovement(ctx: AppContext, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as {
    name?: string
    category?: ExerciseCategory
    equipment?: Equipment
  }
  const name = body.name?.trim()
  if (!name) return error('Movement name is required')
  const category = body.category
  const equipment = body.equipment
  if (!category || !CATEGORY_VALUES.includes(category)) {
    return error('Category is required')
  }
  if (!equipment || !EQUIPMENT_VALUES.includes(equipment)) {
    return error('Equipment is required')
  }

  const existing = await ctx.db.sql<{ id: string }>`
    SELECT id FROM movements
    WHERE lower(name) = lower(${name})
      AND trainer_id = ${ctx.trainer!.id}
    LIMIT 1
  `
  if (existing[0]) {
    const movement = await movementWithVariants(ctx.db, existing[0].id)
    return json(movement)
  }

  const [inserted] = await ctx.db.sql<{ id: string }>`
    INSERT INTO movements (trainer_id, name, aliases, muscle_groups, default_category, default_equipment)
    VALUES (${ctx.trainer!.id}, ${name}, ${[]}, ${[]}, ${category}, ${equipment})
    RETURNING id
  `
  await ctx.db.sql`
    INSERT INTO movement_variants (movement_id, equipment)
    VALUES (${inserted!.id}, ${equipment})
  `
  const movement = await movementWithVariants(ctx.db, inserted!.id)
  return json(movement, 201)
}

export async function handleMaterializeSharedMovement(ctx: AppContext, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as { sourceExerciseId?: string }
  const sourceExerciseId = body.sourceExerciseId?.trim()
  if (!sourceExerciseId) return error('Shared exercise id is required')

  const [source] = await ctx.db.sql<ExerciseLibraryRow>`
    SELECT id, name, description, difficulty, category, equipment,
           primary_muscle, secondary_muscles, muscle_intensity
    FROM exercise_library
    WHERE id = ${sourceExerciseId}
  `
  if (!source) return error('Shared movement not found', 404)

  let [canonical] = await ctx.db.sql<{ id: string }>`
    SELECT id
    FROM movements
    WHERE trainer_id IS NULL AND source_exercise_id = ${sourceExerciseId}
  `
  if (!canonical) {
    const equipment = appEquipment(source.equipment)
    ;[canonical] = await ctx.db.sql<{ id: string }>`
      INSERT INTO movements (
        trainer_id, source_exercise_id, name, aliases, muscle_groups,
        default_category, default_equipment
      )
      VALUES (
        NULL,
        ${source.id},
        ${humanizeExerciseName(source.name)},
        ${[]},
        ${[source.primary_muscle, ...(source.secondary_muscles ?? [])]},
        ${'accessory'},
        ${equipment}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `
    if (!canonical) {
      ;[canonical] = await ctx.db.sql<{ id: string }>`
        SELECT id
        FROM movements
        WHERE trainer_id IS NULL AND source_exercise_id = ${sourceExerciseId}
      `
    }
    if (canonical) {
      await ctx.db.sql`
        INSERT INTO movement_variants (movement_id, equipment)
        VALUES (${canonical.id}, ${equipment})
        ON CONFLICT (movement_id, equipment) DO NOTHING
      `
    }
  }
  if (!canonical) return error('Could not prepare shared movement', 500)

  const movement = await movementForTrainer(ctx, canonical.id)
  if (!movement) return error('Could not prepare shared movement', 500)
  return json(movement)
}

async function movementForTrainer(ctx: AppContext, movementId: string): Promise<Movement | null> {
  const movement = await movementWithVariants(ctx.db, movementId)
  if (!movement) return null
  const [saved] = await ctx.db.sql<{ defaults: unknown }>`
    SELECT defaults
    FROM trainer_movement_defaults
    WHERE trainer_id = ${ctx.trainer!.id} AND movement_id = ${movementId}
  `
  return {
    ...movement,
    savedDefaults: saved
      ? parseJsonColumn<MovementPrescriptionDefaults>(saved.defaults, {
          setCount: 3,
          repsMin: 8,
          method: 'straight',
        })
      : null,
  }
}

async function claimTrainerMovement(
  ctx: AppContext,
  movementId: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; response: Response }> {
  const [current] = await ctx.db.sql<{
    id: string
    name: string
    trainer_id: string | null
    source_exercise_id: string | null
    aliases: string[]
    muscle_groups: string[]
    youtube_url: string | null
    default_category: ExerciseCategory | null
    default_equipment: Equipment | null
  }>`
    SELECT id, name, trainer_id, source_exercise_id, aliases, muscle_groups,
           youtube_url, default_category, default_equipment
    FROM movements
    WHERE id = ${movementId}
      AND (trainer_id IS NULL OR trainer_id = ${ctx.trainer!.id})
  `
  if (!current) return { ok: false, response: error('Movement not found', 404) }
  if (current.trainer_id === ctx.trainer!.id) {
    return { ok: true, id: current.id, name: current.name }
  }

  if (current.source_exercise_id) {
    const [owned] = await ctx.db.sql<{ id: string; name: string }>`
      SELECT id, name
      FROM movements
      WHERE trainer_id = ${ctx.trainer!.id}
        AND source_exercise_id = ${current.source_exercise_id}
      LIMIT 1
    `
    if (owned) return { ok: true, id: owned.id, name: owned.name }
  }

  const [named] = await ctx.db.sql<{ id: string; name: string }>`
    SELECT id, name
    FROM movements
    WHERE trainer_id = ${ctx.trainer!.id}
      AND lower(name) = lower(${current.name})
    LIMIT 1
  `
  if (named) return { ok: true, id: named.id, name: named.name }

  const [inserted] = await ctx.db.sql<{ id: string; name: string }>`
    INSERT INTO movements (
      trainer_id, source_exercise_id, name, aliases, muscle_groups,
      youtube_url, default_category, default_equipment
    )
    VALUES (
      ${ctx.trainer!.id},
      ${current.source_exercise_id},
      ${current.name},
      ${current.aliases ?? []},
      ${current.muscle_groups ?? []},
      ${current.youtube_url},
      ${current.default_category},
      ${current.default_equipment}
    )
    RETURNING id, name
  `
  const variants = await ctx.db.sql<{ equipment: Equipment }>`
    SELECT equipment FROM movement_variants WHERE movement_id = ${current.id}
  `
  for (const variant of variants) {
    await ctx.db.sql`
      INSERT INTO movement_variants (movement_id, equipment)
      VALUES (${inserted!.id}, ${variant.equipment})
      ON CONFLICT (movement_id, equipment) DO NOTHING
    `
  }
  if (variants.length === 0 && current.default_equipment) {
    await ctx.db.sql`
      INSERT INTO movement_variants (movement_id, equipment)
      VALUES (${inserted!.id}, ${current.default_equipment})
      ON CONFLICT (movement_id, equipment) DO NOTHING
    `
  }
  return { ok: true, id: inserted!.id, name: inserted!.name }
}

function movementDefaultsFromExercise(
  exercise: PrescribedExercise,
): MovementPrescriptionDefaults {
  return {
    variantId: exercise.variantId ?? null,
    equipment: exercise.equipment ?? null,
    setCount: exercise.setCount,
    repsMin: exercise.repsMin,
    repsMax: exercise.repsMax ?? null,
    perSetEnabled: Boolean(exercise.perSetEnabled),
    setPrescriptions: exercise.setPrescriptions ?? [],
    method: exercise.method,
    methodTarget: exercise.methodTarget ?? null,
    category: exercise.category ?? 'accessory',
    loadPrescription: exercise.loadPrescription ?? null,
    tempo: exercise.tempo ?? {},
    tempoMode: exercise.tempoMode ?? 'default',
    tempoPerRep: exercise.tempoPerRep ?? [],
    restAfterSetSeconds: exercise.restAfterSetSeconds ?? null,
    restAfterExerciseSeconds: exercise.restAfterExerciseSeconds ?? null,
    notes: exercise.notes ?? null,
    youtubeUrl: exercise.youtubeUrl ?? null,
  }
}

export async function handleSaveMovementDefaults(
  ctx: AppContext,
  movementId: string,
  req: Request,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied

  const claimed = await claimTrainerMovement(ctx, movementId)
  if (!claimed.ok) return claimed.response

  const owned = await movementWithVariants(ctx.db, claimed.id)
  if (!owned) return error('Movement not found', 404)

  const body = (await req.json()) as Partial<MovementPrescriptionDefaults>
  const variantId =
    owned.variants.find((variant) => variant.equipment === (body.equipment ?? null))?.id ??
    owned.variants.find((variant) => variant.id === body.variantId)?.id ??
    null
  const exercise: PrescribedExercise = {
    movementId: claimed.id,
    movementName: claimed.name,
    variantId,
    equipment: body.equipment ?? null,
    setCount: body.setCount as number,
    repsMin: body.repsMin as number,
    repsMax: body.repsMax ?? null,
    perSetEnabled: Boolean(body.perSetEnabled),
    setPrescriptions: body.setPrescriptions ?? [],
    method: body.method as SetMethod,
    methodTarget: body.methodTarget ?? null,
    category: body.category ?? 'accessory',
    loadPrescription: body.loadPrescription ?? null,
    tempo: body.tempo ?? {},
    tempoMode: body.tempoMode ?? 'default',
    tempoPerRep: body.tempoPerRep ?? [],
    restAfterSetSeconds: body.restAfterSetSeconds ?? null,
    restAfterExerciseSeconds: body.restAfterExerciseSeconds ?? null,
    notes: body.notes ?? null,
    youtubeUrl: body.youtubeUrl ?? null,
  }
  if (
    !validSessionPrescription({ warmup: '', exercises: [exercise] }) ||
    !CATEGORY_VALUES.includes(exercise.category as ExerciseCategory) ||
    (exercise.equipment != null && !EQUIPMENT_VALUES.includes(exercise.equipment))
  ) {
    return error('Invalid movement defaults')
  }

  const defaults = movementDefaultsFromExercise(exercise)
  const payload = JSON.stringify(defaults)
  await ctx.db.sql`
    INSERT INTO trainer_movement_defaults (trainer_id, movement_id, defaults)
    VALUES (${ctx.trainer!.id}, ${claimed.id}, CAST(${payload} AS jsonb))
    ON CONFLICT (trainer_id, movement_id)
    DO UPDATE SET defaults = EXCLUDED.defaults, updated_at = NOW()
  `
  if (movementId !== claimed.id) {
    await ctx.db.sql`
      DELETE FROM trainer_movement_defaults
      WHERE trainer_id = ${ctx.trainer!.id} AND movement_id = ${movementId}
    `
  }
  const movement = await movementForTrainer(ctx, claimed.id)
  if (!movement) return error('Could not save movement defaults', 500)
  return json(movement)
}

export async function handleDeleteMovementDefaults(ctx: AppContext, movementId: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  await ctx.db.sql`
    DELETE FROM trainer_movement_defaults
    WHERE trainer_id = ${ctx.trainer!.id} AND movement_id = ${movementId}
  `
  return new Response(null, { status: 204 })
}

type TemplateRow = {
  id: string
  trainer_id: string
  name: string
  notes: string | null
  warmup: unknown
  created_at: unknown
  updated_at: unknown
  version_history?: unknown
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
    versionHistory: parseVersionHistory(row.version_history),
  }
}

async function appendHistory(
  db: Db,
  table: 'workout_templates' | 'program_sessions' | 'sessions',
  id: string,
  events: VersionHistoryEvent[],
) {
  if (!events.length) return
  const payload = JSON.stringify(events)
  if (table === 'workout_templates') {
    await db.sql`
      UPDATE workout_templates
      SET version_history = COALESCE(version_history, '[]'::jsonb) || CAST(${payload} AS jsonb)
      WHERE id = ${id}
    `
    return
  }
  if (table === 'program_sessions') {
    await db.sql`
      UPDATE program_sessions
      SET version_history = COALESCE(version_history, '[]'::jsonb) || CAST(${payload} AS jsonb)
      WHERE id = ${id}
    `
    return
  }
  await db.sql`
    UPDATE sessions
    SET version_history = COALESCE(version_history, '[]'::jsonb) || CAST(${payload} AS jsonb)
    WHERE id = ${id}
  `
}

async function templateHasBeenAssigned(db: Db, templateId: string) {
  const rows = await db.sql<{ ok: number }>`
    SELECT 1 AS ok
    FROM sessions
    WHERE template_id = ${templateId}
    UNION ALL
    SELECT 1
    FROM program_sessions
    WHERE template_id = ${templateId}
    LIMIT 1
  `
  return Boolean(rows[0])
}

async function appendTemplateEdits(db: Db, templateId: string, texts: string[]) {
  const events = editEvents(texts)
  if (!events.length) return
  if (!(await templateHasBeenAssigned(db, templateId))) return
  await appendHistory(db, 'workout_templates', templateId, events)
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
  await appendTemplateEdits(
    ctx.db,
    id,
    diffTemplateMeta(
      {
        name: existing[0].name,
        notes: existing[0].notes,
        warmup: warmupToText(existing[0].warmup),
      },
      { name, notes, warmup },
    ),
  )
  const refreshed = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  const exercises = await loadExercises(ctx.db, id)
  return json(mapTemplate(refreshed[0] ?? row!, exercises))
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

function nextWorkoutCopyName(sourceName: string, existingNames: string[]) {
  const taken = new Set(existingNames)
  let n = 1
  while (taken.has(`${sourceName} copy ${n}`)) n += 1
  return `${sourceName} copy ${n}`
}

export async function handleCopyTemplate(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const source = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!source[0]) return error('Template not found', 404)

  const existing = await ctx.db.sql<{ name: string }>`
    SELECT name FROM workout_templates
    WHERE trainer_id = ${ctx.trainer!.id}
  `
  const name = nextWorkoutCopyName(
    source[0].name.trim() || 'Untitled workout',
    existing.map((row) => row.name),
  )
  const [row] = await ctx.db.sql<TemplateRow>`
    INSERT INTO workout_templates (trainer_id, name, notes, warmup)
    SELECT ${ctx.trainer!.id}, ${name}, notes, warmup
    FROM workout_templates
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
    RETURNING *
  `
  await ctx.db.sql`
    INSERT INTO template_exercises (
      template_id, sort_order, movement_id, variant_id, equipment,
      set_count, reps_min, reps_max, per_set_enabled, set_prescriptions,
      method, method_target, category, load_prescription,
      tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
      tempo_mode, tempo_per_rep,
      rest_after_set_seconds, rest_after_exercise_seconds,
      superset_group, superset_order, notes, youtube_url
    )
    SELECT
      ${row!.id}, sort_order, movement_id, variant_id, equipment,
      set_count, reps_min, reps_max, per_set_enabled, set_prescriptions,
      method, method_target, category, load_prescription,
      tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
      tempo_mode, tempo_per_rep,
      rest_after_set_seconds, rest_after_exercise_seconds,
      superset_group, superset_order, notes, youtube_url
    FROM template_exercises
    WHERE template_id = ${id}
  `
  const exercises = await loadExercises(ctx.db, row!.id)
  return json(mapTemplate(row!, exercises), 201)
}

type ProgramRow = {
  id: string
  trainer_id: string
  name: string
  notes: string | null
  week_count: number
  created_at: unknown
  updated_at: unknown
}

type ProgramSessionRow = {
  id: string
  program_id: string
  template_id: string | null
  name: string
  week_index: number
  weekday: number
  prescription: unknown
  version_history?: unknown
}

function mapProgramSession(row: ProgramSessionRow): ProgramSession {
  const prescription = parseJsonColumn<Prescription>(row.prescription, {
    warmup: '',
    exercises: [],
  })
  return {
    id: row.id,
    programId: row.program_id,
    templateId: row.template_id,
    name: row.name,
    weekIndex: row.week_index,
    weekday: row.weekday,
    prescription: {
      warmup: warmupToText(prescription.warmup),
      exercises: prescription.exercises ?? [],
    },
    versionHistory: parseVersionHistory(row.version_history),
  }
}

function mapProgram(row: ProgramRow, sessions: ProgramSession[] = []): Program {
  return {
    id: row.id,
    trainerId: row.trainer_id,
    name: row.name,
    notes: row.notes,
    weekCount: row.week_count,
    createdAt: asIso(row.created_at) ?? '',
    updatedAt: asIso(row.updated_at) ?? '',
    sessions,
  }
}

function programWorkoutName(sourceName: string, weekIndex: number, programName: string) {
  const suffix = ` - ${programName}`
  let baseName = sourceName.trim()
  if (baseName.endsWith(suffix)) {
    const withoutProgram = baseName.slice(0, -suffix.length)
    baseName = withoutProgram.replace(/ - Week \d+$/, '')
  }
  return `${baseName} - Week ${weekIndex + 1} - ${programName}`
}

async function loadProgramSessions(db: Db, programId: string) {
  const rows = await db.sql<ProgramSessionRow>`
    SELECT * FROM program_sessions
    WHERE program_id = ${programId}
    ORDER BY week_index ASC, weekday ASC, created_at ASC
  `
  return rows.map(mapProgramSession)
}

async function ownedProgram(ctx: AppContext, id: string) {
  const rows = await ctx.db.sql<ProgramRow>`
    SELECT * FROM programs
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  return rows[0] ?? null
}

function mondayOf(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const day = date.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function addUtcDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function handleListPrograms(ctx: AppContext) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const rows = await ctx.db.sql<ProgramRow>`
    SELECT * FROM programs
    WHERE trainer_id = ${ctx.trainer!.id}
    ORDER BY updated_at DESC
  `
  return json(rows.map((row) => mapProgram(row)))
}

export async function handleCreateProgram(ctx: AppContext, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as { name?: string; weekCount?: number }
  const name = body.name?.trim() || 'New program'
  const weekCount = Math.min(16, Math.max(1, Number(body.weekCount) || 4))
  const [row] = await ctx.db.sql<ProgramRow>`
    INSERT INTO programs (trainer_id, name, week_count)
    VALUES (${ctx.trainer!.id}, ${name}, ${weekCount})
    RETURNING *
  `
  return json(mapProgram(row!, []), 201)
}

export async function handleGetProgram(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const row = await ownedProgram(ctx, id)
  if (!row) return error('Program not found', 404)
  const sessions = await loadProgramSessions(ctx.db, id)
  return json(mapProgram(row, sessions))
}

export async function handleUpdateProgram(ctx: AppContext, id: string, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const existing = await ownedProgram(ctx, id)
  if (!existing) return error('Program not found', 404)
  const body = (await req.json()) as {
    name?: string
    notes?: string | null
    weekCount?: number
  }
  const name = body.name?.trim() ?? existing.name
  const notes = body.notes === undefined ? existing.notes : body.notes
  const weekCount = Math.min(
    16,
    Math.max(1, body.weekCount == null ? existing.week_count : Number(body.weekCount) || 1),
  )
  if (weekCount < existing.week_count) {
    await ctx.db.sql`
      DELETE FROM program_sessions
      WHERE program_id = ${id} AND week_index >= ${weekCount}
    `
  }
  if (name !== existing.name) {
    const sessions = await ctx.db.sql<ProgramSessionRow>`
      SELECT * FROM program_sessions WHERE program_id = ${id}
    `
    for (const session of sessions) {
      const oldSuffix = ` - Week ${session.week_index + 1} - ${existing.name}`
      if (!session.name.endsWith(oldSuffix)) continue
      const baseName = session.name.slice(0, -oldSuffix.length)
      await ctx.db.sql`
        UPDATE program_sessions
        SET name = ${programWorkoutName(baseName, session.week_index, name)},
            updated_at = NOW()
        WHERE id = ${session.id}
      `
    }
  }
  const [row] = await ctx.db.sql<ProgramRow>`
    UPDATE programs
    SET name = ${name},
        notes = ${notes},
        week_count = ${weekCount},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  const sessions = await loadProgramSessions(ctx.db, id)
  return json(mapProgram(row!, sessions))
}

export async function handleDeleteProgram(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  await ctx.db.sql`
    DELETE FROM programs WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  return json({ ok: true })
}

export async function handleAddProgramSessions(ctx: AppContext, programId: string, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const program = await ownedProgram(ctx, programId)
  if (!program) return error('Program not found', 404)
  const body = (await req.json()) as {
    templateId?: string
    programSessionId?: string
    weekIndex?: number
    weekday?: number
    weekdays?: number[]
    allWeeks?: boolean
  }
  if (!body.templateId && !body.programSessionId) return error('Workout is required')
  if (body.templateId && body.programSessionId) return error('Choose one workout source')
  const weekIndex = Number(body.weekIndex)
  const seedWeekday = Number(body.weekday)
  if (
    !Number.isInteger(weekIndex) ||
    weekIndex < 0 ||
    weekIndex >= program.week_count ||
    !Number.isInteger(seedWeekday) ||
    seedWeekday < 0 ||
    seedWeekday > 6
  ) {
    return error('Choose a valid day in this program')
  }
  const weekdays = (body.weekdays?.length ? body.weekdays : [seedWeekday])
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  if (weekdays.length === 0) return error('Choose at least one weekday')
  let sourceName: string
  let sourceTemplateId: string | null
  let prescription: Prescription
  if (body.templateId) {
    const templates = await ctx.db.sql<TemplateRow>`
      SELECT * FROM workout_templates
      WHERE id = ${body.templateId} AND trainer_id = ${ctx.trainer!.id}
    `
    if (!templates[0]) return error('Workout not found', 404)
    sourceName = templates[0].name
    sourceTemplateId = body.templateId
    prescription = await buildPrescription(ctx.db, body.templateId)
  } else {
    const sources = await ctx.db.sql<ProgramSessionRow>`
      SELECT * FROM program_sessions
      WHERE id = ${body.programSessionId!} AND program_id = ${programId}
    `
    if (!sources[0]) return error('Program workout not found', 404)
    const source = mapProgramSession(sources[0])
    sourceName = source.name
    sourceTemplateId = null
    prescription = source.prescription
  }
  const weeks = body.allWeeks === false ? [weekIndex] : Array.from({ length: program.week_count }, (_, i) => i)
  const created: ProgramSession[] = []
  for (const week of weeks) {
    for (const weekday of weekdays) {
      const [row] = await ctx.db.sql<ProgramSessionRow>`
        INSERT INTO program_sessions (
          program_id, template_id, name, week_index, weekday, prescription, version_history
        ) VALUES (
          ${programId},
          ${sourceTemplateId},
          ${programWorkoutName(sourceName, week, program.name)},
          ${week},
          ${weekday},
          CAST(${JSON.stringify(prescription)} AS jsonb),
          CAST(${JSON.stringify([assignedEvent(programWorkoutName(sourceName, week, program.name))])} AS jsonb)
        )
        RETURNING *
      `
      created.push(mapProgramSession(row!))
    }
  }
  if (sourceTemplateId) {
    await appendHistory(
      ctx.db,
      'workout_templates',
      sourceTemplateId,
      created.map((item) => assignedEvent(item.name)),
    )
  }
  await ctx.db.sql`UPDATE programs SET updated_at = NOW() WHERE id = ${programId}`
  return json(created, 201)
}

export async function handleGetProgramSession(
  ctx: AppContext,
  programId: string,
  sessionId: string,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const program = await ownedProgram(ctx, programId)
  if (!program) return error('Program not found', 404)
  const rows = await ctx.db.sql<ProgramSessionRow>`
    SELECT * FROM program_sessions
    WHERE id = ${sessionId} AND program_id = ${programId}
  `
  if (!rows[0]) return error('Program workout not found', 404)
  return json(mapProgramSession(rows[0]))
}

export async function handleUpdateProgramSession(
  ctx: AppContext,
  programId: string,
  sessionId: string,
  req: Request,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const program = await ownedProgram(ctx, programId)
  if (!program) return error('Program not found', 404)
  const existing = await ctx.db.sql<ProgramSessionRow>`
    SELECT * FROM program_sessions
    WHERE id = ${sessionId} AND program_id = ${programId}
  `
  if (!existing[0]) return error('Program workout not found', 404)
  const body = (await req.json()) as {
    name?: string
    prescription?: unknown
    weekIndex?: number
    weekday?: number
  }
  const name = body.name?.trim() || existing[0].name
  const prescription = body.prescription
    ? body.prescription
    : existing[0].prescription
  if (!validSessionPrescription(prescription)) return error('Workout details are invalid')
  const weekIndex =
    body.weekIndex == null ? existing[0].week_index : Number(body.weekIndex)
  const weekday = body.weekday == null ? existing[0].weekday : Number(body.weekday)
  if (
    !Number.isInteger(weekIndex) ||
    weekIndex < 0 ||
    weekIndex >= program.week_count ||
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6
  ) {
    return error('Choose a valid day in this program')
  }
  const previous = mapProgramSession(existing[0])
  const nextPrescription = body.prescription
    ? (prescription as Prescription)
    : previous.prescription
  const history = editEvents([
    ...(name !== previous.name ? [`Renamed workout from ${previous.name} to ${name}`] : []),
    ...diffProgramPlacement(previous, { weekIndex, weekday }),
    ...diffPrescriptions(previous.prescription, {
      warmup: warmupToText((nextPrescription as Prescription).warmup),
      exercises: (nextPrescription as Prescription).exercises ?? [],
    }),
  ])
  const [row] = await ctx.db.sql<ProgramSessionRow>`
    UPDATE program_sessions
    SET name = ${name},
        prescription = CAST(${JSON.stringify(prescription)} AS jsonb),
        week_index = ${weekIndex},
        weekday = ${weekday},
        updated_at = NOW()
    WHERE id = ${sessionId}
    RETURNING *
  `
  await appendHistory(ctx.db, 'program_sessions', sessionId, history)
  await ctx.db.sql`UPDATE programs SET updated_at = NOW() WHERE id = ${programId}`
  return json({
    ...mapProgramSession(row!),
    versionHistory: [...parseVersionHistory(row!.version_history), ...history],
  })
}

export async function handleDeleteProgramSession(
  ctx: AppContext,
  programId: string,
  sessionId: string,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const program = await ownedProgram(ctx, programId)
  if (!program) return error('Program not found', 404)
  await ctx.db.sql`
    DELETE FROM program_sessions
    WHERE id = ${sessionId} AND program_id = ${programId}
  `
  await ctx.db.sql`UPDATE programs SET updated_at = NOW() WHERE id = ${programId}`
  return json({ ok: true })
}

export async function handleAssignProgram(ctx: AppContext, programId: string, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const program = await ownedProgram(ctx, programId)
  if (!program) return error('Program not found', 404)
  const body = (await req.json()) as { clientId?: string; startDate?: string }
  if (!body.clientId || !body.startDate) return error('clientId and startDate are required')
  const startMonday = mondayOf(body.startDate)
  if (!startMonday) return error('startDate is invalid')
  const clients = await ctx.db.sql<{ id: string }>`
    SELECT id FROM clients
    WHERE id = ${body.clientId}
      AND trainer_id = ${ctx.trainer!.id}
      AND is_self = FALSE
  `
  if (!clients[0]) return error('Client not found', 404)
  const programSessions = await loadProgramSessions(ctx.db, programId)
  const created = []
  for (const item of programSessions) {
    const scheduledDate = addUtcDays(startMonday, item.weekIndex * 7 + item.weekday)
    const [row] = await ctx.db.sql<SessionRow>`
      INSERT INTO sessions (
        client_id, trainer_id, template_id, name, scheduled_date, prescription, version_history
      ) VALUES (
        ${body.clientId},
        ${ctx.trainer!.id},
        ${item.templateId},
        ${item.name},
        ${scheduledDate},
        CAST(${JSON.stringify(item.prescription)} AS jsonb),
        CAST(${JSON.stringify([assignedEvent(item.name)])} AS jsonb)
      )
      RETURNING *
    `
    created.push(mapSession(row!))
    if (item.templateId) {
      await appendHistory(ctx.db, 'workout_templates', item.templateId, [
        assignedEvent(item.name),
      ])
    }
  }
  return json(created, 201)
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
  if (body.movementId) {
    const allowed = await ctx.db.sql<{ id: string }>`
      SELECT id FROM movements
      WHERE id = ${body.movementId}
        AND (trainer_id IS NULL OR trainer_id = ${ctx.trainer!.id})
    `
    if (!allowed[0]) return error('Movement not found', 404)
  }

  if (exerciseId) {
    const beforeRows = await ctx.db.sql<ExerciseRow>`
      SELECT e.*, m.name AS movement_name
      FROM template_exercises e
      JOIN movements m ON m.id = e.movement_id
      WHERE e.id = ${exerciseId} AND e.template_id = ${templateId}
    `
    if (!beforeRows[0]) return error('Exercise not found', 404)
    const before = mapExercise(beforeRows[0])
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
    const after = mapExercise(rows[0])
    await appendTemplateEdits(
      ctx.db,
      templateId,
      diffHistoryExercises(
        [historyExerciseFromTemplate(before, before.sortOrder)],
        [historyExerciseFromTemplate(after, after.sortOrder)],
      ),
    )
    const [templateRow] = await ctx.db.sql<TemplateRow>`
      UPDATE workout_templates SET updated_at = NOW()
      WHERE id = ${templateId}
      RETURNING *
    `
    // Return the whole template so the editor can reconcile in one round trip
    // instead of following the save with a refetch.
    return json(mapTemplate(templateRow!, await loadExercises(ctx.db, templateId)))
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
  const createdExercise = mapExercise(inserted[0]!)
  await appendTemplateEdits(ctx.db, templateId, [`Added ${createdExercise.movementName}`])
  return json(createdExercise, 201)
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

  const body = (await req.json()) as {
    exerciseIds?: string[]
    supersetAssignments?: {
      exerciseId: string
      group: string | null
      order: number | null
    }[]
  }
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

  const rawAssignments = body.supersetAssignments
  let assignments:
    | Map<string, { exerciseId: string; group: string | null; order: number | null }>
    | undefined
  if (rawAssignments) {
    if (
      rawAssignments.length !== existing.length ||
      new Set(rawAssignments.map((assignment) => assignment.exerciseId)).size !==
        rawAssignments.length ||
      rawAssignments.some((assignment) => !existingIds.has(assignment.exerciseId))
    ) {
      return error('Superset assignments do not match this workout')
    }

    const normalized = rawAssignments.map((assignment) => ({
      exerciseId: assignment.exerciseId,
      group:
        typeof assignment.group === 'string' && assignment.group.trim()
          ? assignment.group.trim()
          : null,
      order: assignment.order,
    }))
    const groupedOrders = new Map<string, number[]>()
    for (const assignment of normalized) {
      if (
        (assignment.group &&
          (!Number.isInteger(assignment.order) || (assignment.order ?? 0) < 1)) ||
        (!assignment.group && assignment.order != null)
      ) {
        return error('Invalid superset assignment')
      }
      if (assignment.group) {
        const orders = groupedOrders.get(assignment.group) ?? []
        orders.push(assignment.order!)
        groupedOrders.set(assignment.group, orders)
      }
    }
    for (const orders of groupedOrders.values()) {
      orders.sort((a, b) => a - b)
      if (orders.length < 2 || orders.some((order, index) => order !== index + 1)) {
        return error('Supersets must contain at least two movements in order')
      }
    }
    assignments = new Map(normalized.map((assignment) => [assignment.exerciseId, assignment]))
  }

  for (let i = 0; i < exerciseIds.length; i++) {
    const exerciseId = exerciseIds[i]!
    const assignment = assignments?.get(exerciseId)
    if (assignment) {
      await ctx.db.sql`
        UPDATE template_exercises
        SET
          sort_order = ${i},
          superset_group = ${assignment.group},
          superset_order = ${assignment.order}
        WHERE id = ${exerciseId} AND template_id = ${templateId}
      `
    } else {
      await ctx.db.sql`
        UPDATE template_exercises
        SET sort_order = ${i}
        WHERE id = ${exerciseId} AND template_id = ${templateId}
      `
    }
  }
  await ctx.db.sql`UPDATE workout_templates SET updated_at = NOW() WHERE id = ${templateId}`
  const rows = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${templateId} AND trainer_id = ${ctx.trainer!.id}
  `
  const exercises = await loadExercises(ctx.db, templateId)
  await appendTemplateEdits(
    ctx.db,
    templateId,
    diffHistoryExercises(
      existing.map((exercise, index) => historyExerciseFromTemplate(exercise, index)),
      exercises.map((exercise, index) => historyExerciseFromTemplate(exercise, index)),
    ),
  )
  const refreshed = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${templateId} AND trainer_id = ${ctx.trainer!.id}
  `
  return json(mapTemplate(refreshed[0] ?? rows[0]!, exercises))
}

export async function handleDeleteExercise(
  ctx: AppContext,
  templateId: string,
  exerciseId: string,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const existing = await ctx.db.sql<ExerciseRow>`
    SELECT e.*, m.name AS movement_name
    FROM template_exercises e
    JOIN movements m ON m.id = e.movement_id
    WHERE e.id = ${exerciseId}
      AND e.template_id = ${templateId}
      AND e.template_id IN (
        SELECT id FROM workout_templates WHERE trainer_id = ${ctx.trainer!.id}
      )
  `
  await ctx.db.sql`
    DELETE FROM template_exercises
    WHERE id = ${exerciseId}
      AND template_id = ${templateId}
      AND template_id IN (
        SELECT id FROM workout_templates WHERE trainer_id = ${ctx.trainer!.id}
      )
  `
  if (existing[0]) {
    await appendTemplateEdits(ctx.db, templateId, [`Removed ${mapExercise(existing[0]).movementName}`])
  }
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
    last_session_date: string | null
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
      ) AS upcoming_count,
      (
        SELECT MAX(s.scheduled_date)::text FROM sessions s
        WHERE s.client_id = c.id
      ) AS last_session_date
    FROM clients c
    JOIN users u ON u.id = c.user_id
    WHERE c.trainer_id = ${ctx.trainer!.id}
      AND c.is_self = FALSE
    ORDER BY u.name
  `
  return json(
    rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      email: r.email,
      upcomingCount: Number(r.upcoming_count),
      lastSessionDate: r.last_session_date,
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
  is_trainer_workout?: boolean
  version_history?: unknown
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
    isTrainerWorkout: row.is_trainer_workout ?? false,
    versionHistory: parseVersionHistory(row.version_history),
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
  const clients = await ctx.db.sql<{ id: string; name: string; is_self: boolean }>`
    SELECT c.id, u.name, c.is_self
    FROM clients c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ${body.clientId} AND c.trainer_id = ${ctx.trainer!.id}
  `
  if (!clients[0]) return error('Client not found', 404)
  const templates = await ctx.db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${body.templateId} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!templates[0]) return error('Template not found', 404)
  const prescription = await buildPrescription(ctx.db, body.templateId)
  const assigned = assignedEvent(templates[0].name)
  const [row] = await ctx.db.sql<SessionRow>`
    INSERT INTO sessions (
      client_id, trainer_id, template_id, name, scheduled_date, prescription, version_history
    ) VALUES (
      ${body.clientId},
      ${ctx.trainer!.id},
      ${body.templateId},
      ${templates[0].name},
      ${body.date},
      CAST(${JSON.stringify(prescription)} AS jsonb),
      CAST(${JSON.stringify([assigned])} AS jsonb)
    )
    RETURNING *
  `
  await appendHistory(ctx.db, 'workout_templates', body.templateId, [assigned])
  return json(
    mapSession({
      ...row!,
      client_name: clients[0].name,
      is_trainer_workout: clients[0].is_self,
    }),
    201,
  )
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
      SELECT s.*, u.name AS client_name, c.is_self AS is_trainer_workout
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
    SELECT s.*, u.name AS client_name, c.is_self AS is_trainer_workout
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

  const current = await ctx.db.sql<SessionRow>`
    SELECT s.*, u.name AS client_name, c.is_self AS is_trainer_workout
    FROM sessions s
    JOIN clients c ON c.id = s.client_id
    JOIN users u ON u.id = c.user_id
    WHERE s.id = ${id} AND s.trainer_id = ${ctx.trainer!.id}
  `
  if (!current[0]) return error('Session not found', 404)
  const previous = mapSession(current[0])
  const nextPrescription = body.prescription as Prescription
  const history = editEvents([
    ...(name !== previous.name ? [`Renamed workout from ${previous.name} to ${name}`] : []),
    ...diffPrescriptions(previous.prescription, {
      warmup: warmupToText(nextPrescription.warmup),
      exercises: nextPrescription.exercises ?? [],
    }),
  ])

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
  if (updated) {
    await appendHistory(ctx.db, 'sessions', id, history)
    return json({
      ...mapSession({
        ...updated,
        client_name: current[0].client_name,
        is_trainer_workout: current[0].is_trainer_workout,
      }),
      versionHistory: [...(parseVersionHistory(updated.version_history)), ...history],
    })
  }

  const owned = await ctx.db.sql<{ id: string }>`
    SELECT id FROM sessions
    WHERE id = ${id} AND trainer_id = ${ctx.trainer!.id}
  `
  if (!owned[0]) return error('Session not found', 404)
  return error('This workout is locked because client logging has started', 409)
}

export async function handleLogSession(ctx: AppContext, id: string, req: Request) {
  const rows = await ctx.db.sql<SessionRow>`
    SELECT s.*, u.name AS client_name, c.is_self AS is_trainer_workout
    FROM sessions s
    JOIN clients c ON c.id = s.client_id
    JOIN users u ON u.id = c.user_id
    WHERE s.id = ${id}
  `
  if (!rows[0] || !(await canViewSession(ctx, rows[0]))) {
    return error('Session not found', 404)
  }
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
        )         VALUES (
          ${id}, ${log.exerciseIndex}, ${log.setIndex},
          ${log.weight ?? null}, ${log.reps ?? null}, ${setLogIsCompleted(log)}
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
  return json(
    mapSession(
      {
        ...updated!,
        client_name: rows[0].client_name,
        is_trainer_workout: rows[0].is_trainer_workout,
      },
      logs,
    ),
  )
}

export async function handleAdHoc(ctx: AppContext, req: Request, id?: string) {
  if (req.method === 'GET' && !id) {
    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
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
        AND (${from}::date IS NULL OR logged_on >= ${from}::date)
        AND (${to}::date IS NULL OR logged_on <= ${to}::date)
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

  if (req.method === 'PUT' && id) {
    const body = (await req.json()) as {
      activityType?: AdHocType
      durationMinutes?: number
      notes?: string
      loggedOn?: string
    }
    if (
      !body.activityType ||
      !['cardio', 'sport', 'mobility', 'other'].includes(body.activityType) ||
      !Number.isFinite(body.durationMinutes) ||
      body.durationMinutes! <= 0 ||
      !body.loggedOn
    ) {
      return error('activityType, positive durationMinutes, and loggedOn are required')
    }
    const [row] = await ctx.db.sql<{
      id: string
      activity_type: AdHocType
      duration_seconds: number
      notes: string | null
      logged_on: unknown
    }>`
      UPDATE ad_hoc_logs
      SET activity_type = ${body.activityType},
          duration_seconds = ${Math.round(body.durationMinutes! * 60)},
          notes = ${body.notes ?? null},
          logged_on = ${body.loggedOn}
      WHERE id = ${id} AND user_id = ${ctx.user.id}
      RETURNING id, activity_type, duration_seconds, notes, logged_on
    `
    if (!row) return error('Activity not found', 404)
    return json({
      id: row.id,
      activityType: row.activity_type,
      durationSeconds: row.duration_seconds,
      notes: row.notes,
      loggedOn: asDate(row.logged_on),
    })
  }

  if (req.method !== 'POST' || id) return error('Method not allowed', 405)
  const body = (await req.json()) as {
    activityType?: AdHocType
    durationMinutes?: number
    notes?: string
    loggedOn?: string
  }
  if (
    !body.activityType ||
    !['cardio', 'sport', 'mobility', 'other'].includes(body.activityType) ||
    !Number.isFinite(body.durationMinutes) ||
    body.durationMinutes! <= 0
  ) {
    return error('activityType and positive durationMinutes are required')
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
      ${Math.round(body.durationMinutes! * 60)},
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
    ? await ctx.db.sql<{ day: unknown; seconds: string; title: string }>`
        SELECT scheduled_date AS day,
               COALESCE(logged_duration_seconds, 0)::text AS seconds,
               name AS title
        FROM sessions
        WHERE client_id = ${subjectClient.id}
          AND status = 'completed'
          AND scheduled_date >= ${start}::date
          AND scheduled_date <= ${end}::date
      `
    : []

  const adHocRows = await ctx.db.sql<{
    day: unknown
    seconds: string
    activity_type: AdHocType
    notes: string | null
  }>`
    SELECT logged_on AS day, duration_seconds::text AS seconds, activity_type, notes
    FROM ad_hoc_logs
    WHERE user_id = ${subjectUserId}
      AND logged_on >= ${start}::date
      AND logged_on <= ${end}::date
  `

  const byDay = new Map<string, { minutes: number; titles: string[] }>()
  const add = (day: string, seconds: number, title: string) => {
    const entry = byDay.get(day) ?? { minutes: 0, titles: [] }
    entry.minutes += seconds / 60
    if (title) entry.titles.push(title)
    byDay.set(day, entry)
  }
  for (const row of sessionRows) {
    add(asDate(row.day), Number(row.seconds), row.title)
  }
  for (const row of adHocRows) {
    const label = `${row.activity_type[0]!.toUpperCase()}${row.activity_type.slice(1)}`
    add(asDate(row.day), Number(row.seconds), row.notes ? `${label} · ${row.notes}` : label)
  }

  const years = new Set<number>()
  const sessionYears = subjectClient
    ? await ctx.db.sql<{ year: string }>`
        SELECT DISTINCT EXTRACT(YEAR FROM scheduled_date)::text AS year
        FROM sessions
        WHERE client_id = ${subjectClient.id} AND status = 'completed'
      `
    : []
  const adHocYears = await ctx.db.sql<{ year: string }>`
    SELECT DISTINCT EXTRACT(YEAR FROM logged_on)::text AS year
    FROM ad_hoc_logs
    WHERE user_id = ${subjectUserId}
  `
  for (const row of [...sessionYears, ...adHocYears]) years.add(Number(row.year))
  years.add(new Date().getFullYear())

  return json({
    days: [...byDay.entries()].map(([date, entry]) => ({
      date,
      minutes: Math.round(entry.minutes),
      titles: entry.titles,
    })),
    years: [...years].sort((a, b) => a - b),
  })
}

export async function handleExerciseHistory(ctx: AppContext, req: Request) {
  const url = new URL(req.url)
  const movementId = url.searchParams.get('movementId')
  if (!movementId) return error('movementId is required')
  const subjectClient = await authorizedClient(ctx, url.searchParams.get('clientId'))
  if (!subjectClient) return error('Client not found', 404)
  const rows = await ctx.db.sql<{
    session_id: string
    scheduled_date: unknown
    name: string
    set_index: number
    weight: unknown
    reps: number | null
  }>`
    SELECT s.id AS session_id, s.scheduled_date, s.name, l.set_index, l.weight, l.reps
    FROM session_set_logs l
    JOIN sessions s ON s.id = l.session_id
    WHERE s.client_id = ${subjectClient.id}
      AND (l.weight IS NOT NULL OR l.reps IS NOT NULL)
      AND s.prescription -> 'exercises' -> l.exercise_index ->> 'movementId' = ${movementId}
    ORDER BY s.scheduled_date DESC, l.set_index ASC
    LIMIT 80
  `
  return json(
    rows.map((r) => ({
      sessionId: r.session_id,
      date: asDate(r.scheduled_date),
      sessionName: r.name,
      setIndex: r.set_index,
      weight: asNumber(r.weight),
      reps: r.reps,
    })),
  )
}

export async function handleExerciseHistoryBatch(ctx: AppContext, req: Request) {
  const url = new URL(req.url)
  const movementIds = [
    ...new Set(
      (url.searchParams.get('movementIds') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
  if (movementIds.length === 0) return error('movementIds is required')
  if (movementIds.length > 50) return error('A maximum of 50 movementIds is allowed')

  const subjectClient = await authorizedClient(ctx, url.searchParams.get('clientId'))
  if (!subjectClient) return error('Client not found', 404)

  const rows = await ctx.db.sql<{
    movement_id: string
    session_id: string
    scheduled_date: unknown
    name: string
    set_index: number
    weight: unknown
    reps: number | null
  }>`
    WITH matching_logs AS (
      SELECT
        s.prescription -> 'exercises' -> l.exercise_index ->> 'movementId' AS movement_id,
        s.id AS session_id,
        s.scheduled_date,
        s.name,
        l.set_index,
        l.weight,
        l.reps,
        ROW_NUMBER() OVER (
          PARTITION BY s.prescription -> 'exercises' -> l.exercise_index ->> 'movementId'
          ORDER BY s.scheduled_date DESC, s.completed_at DESC NULLS LAST, s.id, l.set_index ASC
        ) AS movement_row
      FROM session_set_logs l
      JOIN sessions s ON s.id = l.session_id
      WHERE s.client_id = ${subjectClient.id}
        AND (l.weight IS NOT NULL OR l.reps IS NOT NULL)
        AND s.prescription -> 'exercises' -> l.exercise_index ->> 'movementId'
          = ANY(string_to_array(${movementIds.join(',')}, ','))
    )
    SELECT movement_id, session_id, scheduled_date, name, set_index, weight, reps
    FROM matching_logs
    WHERE movement_row <= 80
    ORDER BY movement_id, scheduled_date DESC, set_index ASC
  `

  const history: MovementHistoryById = Object.fromEntries(movementIds.map((id) => [id, []]))
  for (const row of rows) {
    history[row.movement_id]!.push({
      sessionId: row.session_id,
      date: asDate(row.scheduled_date),
      sessionName: row.name,
      setIndex: row.set_index,
      weight: asNumber(row.weight),
      reps: row.reps,
    })
  }
  return json(history)
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
      AND (l.weight IS NOT NULL OR l.reps IS NOT NULL)
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
