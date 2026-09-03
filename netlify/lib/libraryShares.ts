import { getDatabase } from '@netlify/database'
import type {
  Equipment,
  LibraryShare,
  LibraryShareAcceptResult,
  LibrarySharePreview,
  LibraryShareResourceType,
  PrescribedExercise,
  Prescription,
  Program,
  ProgramSession,
  TemplateExercise,
  WorkoutTemplate,
} from '../../shared/types.ts'
import { warmupToText } from '../../shared/types.ts'
import { parseVersionHistory } from '../../shared/versionHistory.ts'
import type { AppContext } from './handlers.ts'
import { asIso, asNumber, error, json, parseJsonColumn } from './http.ts'

type Db = ReturnType<typeof getDatabase>

type ShareRow = {
  id: string
  owner_trainer_id: string
  recipient_trainer_id: string
  resource_type: LibraryShareResourceType
  resource_id: string
  status: string
  created_at: unknown
  owner_name: string
  resource_name: string
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

type ExerciseCopyRow = {
  id: string
  sort_order: number
  movement_id: string
  variant_id: string | null
  equipment: Equipment | null
  set_count: number
  reps_min: number
  reps_max: number | null
  per_set_enabled: boolean
  set_prescriptions: unknown
  method: string
  method_target: unknown
  category: string | null
  load_prescription: string | null
  tempo_eccentric: unknown
  tempo_pause_bottom: unknown
  tempo_concentric: unknown
  tempo_pause_top: unknown
  tempo_mode: string | null
  tempo_per_rep: unknown
  rest_after_set_seconds: number | null
  rest_after_exercise_seconds: number | null
  superset_group: string | null
  superset_order: number | null
  notes: string | null
  youtube_url: string | null
  movement_name: string
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

type MovementCopyMaps = {
  movements: Map<string, string>
  variants: Map<string, string>
  created: Set<string>
}

function requireTrainer(ctx: AppContext) {
  if (!ctx.trainer) return error('Trainer account required', 403)
  return null
}

function uniqueLibraryName(sourceName: string, existingNames: string[]) {
  const taken = new Set(existingNames)
  if (!taken.has(sourceName)) return sourceName
  let n = 1
  while (taken.has(`${sourceName} copy ${n}`)) n += 1
  return `${sourceName} copy ${n}`
}

function mapShare(row: ShareRow): LibraryShare {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    ownerName: row.owner_name,
    createdAt: asIso(row.created_at) ?? '',
  }
}

function mapExercise(row: ExerciseCopyRow): TemplateExercise {
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
    setPrescriptions: parseJsonColumn(row.set_prescriptions, []),
    method: row.method as TemplateExercise['method'],
    methodTarget: asNumber(row.method_target),
    category: row.category as TemplateExercise['category'],
    loadPrescription: row.load_prescription,
    tempoEccentric: asNumber(row.tempo_eccentric),
    tempoPauseBottom: asNumber(row.tempo_pause_bottom),
    tempoConcentric: asNumber(row.tempo_concentric),
    tempoPauseTop: asNumber(row.tempo_pause_top),
    tempoMode: row.tempo_mode === 'per_rep' ? 'per_rep' : 'default',
    tempoPerRep: parseJsonColumn(row.tempo_per_rep, []),
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

async function loadExercises(db: Db, templateId: string) {
  const rows = await db.sql<ExerciseCopyRow>`
    SELECT e.*, m.name AS movement_name
    FROM template_exercises e
    JOIN movements m ON m.id = e.movement_id
    WHERE e.template_id = ${templateId}
    ORDER BY e.sort_order ASC, e.id ASC
  `
  return rows
}

async function loadProgramSessions(db: Db, programId: string) {
  const rows = await db.sql<ProgramSessionRow>`
    SELECT * FROM program_sessions
    WHERE program_id = ${programId}
    ORDER BY week_index ASC, weekday ASC, created_at ASC
  `
  return rows.map(mapProgramSession)
}

async function lookupTrainerByCode(db: Db, code: string) {
  const rows = await db.sql<{ id: string; name: string; code: string }>`
    SELECT t.id, u.name, t.code
    FROM trainers t
    JOIN users u ON u.id = t.user_id
    WHERE t.code = ${code}
  `
  return rows[0] ?? null
}

async function pendingInbox(db: Db, recipientId: string, type: LibraryShareResourceType | null) {
  const rows =
    type == null
      ? await db.sql<ShareRow>`
          SELECT
            s.id,
            s.owner_trainer_id,
            s.recipient_trainer_id,
            s.resource_type,
            s.resource_id,
            s.status,
            s.created_at,
            u.name AS owner_name,
            COALESCE(wt.name, p.name) AS resource_name
          FROM library_shares s
          JOIN trainers ot ON ot.id = s.owner_trainer_id
          JOIN users u ON u.id = ot.user_id
          LEFT JOIN workout_templates wt
            ON s.resource_type = 'workout'
            AND wt.id = s.resource_id
            AND wt.trainer_id = s.owner_trainer_id
          LEFT JOIN programs p
            ON s.resource_type = 'program'
            AND p.id = s.resource_id
            AND p.trainer_id = s.owner_trainer_id
          WHERE s.recipient_trainer_id = ${recipientId}
            AND s.status = 'pending'
            AND COALESCE(wt.id, p.id) IS NOT NULL
          ORDER BY s.created_at DESC
        `
      : await db.sql<ShareRow>`
          SELECT
            s.id,
            s.owner_trainer_id,
            s.recipient_trainer_id,
            s.resource_type,
            s.resource_id,
            s.status,
            s.created_at,
            u.name AS owner_name,
            COALESCE(wt.name, p.name) AS resource_name
          FROM library_shares s
          JOIN trainers ot ON ot.id = s.owner_trainer_id
          JOIN users u ON u.id = ot.user_id
          LEFT JOIN workout_templates wt
            ON s.resource_type = 'workout'
            AND wt.id = s.resource_id
            AND wt.trainer_id = s.owner_trainer_id
          LEFT JOIN programs p
            ON s.resource_type = 'program'
            AND p.id = s.resource_id
            AND p.trainer_id = s.owner_trainer_id
          WHERE s.recipient_trainer_id = ${recipientId}
            AND s.status = 'pending'
            AND s.resource_type = ${type}
            AND COALESCE(wt.id, p.id) IS NOT NULL
          ORDER BY s.created_at DESC
        `
  return rows.map(mapShare)
}

async function loadPendingShare(db: Db, shareId: string, recipientId: string) {
  const rows = await db.sql<ShareRow>`
    SELECT
      s.id,
      s.owner_trainer_id,
      s.recipient_trainer_id,
      s.resource_type,
      s.resource_id,
      s.status,
      s.created_at,
      u.name AS owner_name,
      COALESCE(wt.name, p.name, '') AS resource_name
    FROM library_shares s
    JOIN trainers ot ON ot.id = s.owner_trainer_id
    JOIN users u ON u.id = ot.user_id
    LEFT JOIN workout_templates wt
      ON s.resource_type = 'workout'
      AND wt.id = s.resource_id
      AND wt.trainer_id = s.owner_trainer_id
    LEFT JOIN programs p
      ON s.resource_type = 'program'
      AND p.id = s.resource_id
      AND p.trainer_id = s.owner_trainer_id
    WHERE s.id = ${shareId}
      AND s.recipient_trainer_id = ${recipientId}
      AND s.status = 'pending'
  `
  return rows[0] ?? null
}

async function copyVariants(
  db: Db,
  sourceMovementId: string,
  destMovementId: string,
  maps: MovementCopyMaps,
) {
  const sourceVars = await db.sql<{ id: string; equipment: Equipment }>`
    SELECT id, equipment FROM movement_variants WHERE movement_id = ${sourceMovementId}
  `
  const destVars = await db.sql<{ id: string; equipment: Equipment }>`
    SELECT id, equipment FROM movement_variants WHERE movement_id = ${destMovementId}
  `
  const destByEquipment = new Map(destVars.map((row) => [row.equipment, row.id]))
  for (const variant of sourceVars) {
    let destId = destByEquipment.get(variant.equipment)
    if (!destId) {
      const [inserted] = await db.sql<{ id: string }>`
        INSERT INTO movement_variants (movement_id, equipment)
        VALUES (${destMovementId}, ${variant.equipment})
        ON CONFLICT (movement_id, equipment) DO NOTHING
        RETURNING id
      `
      if (!inserted) {
        const [existing] = await db.sql<{ id: string }>`
          SELECT id FROM movement_variants
          WHERE movement_id = ${destMovementId} AND equipment = ${variant.equipment}
        `
        destId = existing?.id
      } else {
        destId = inserted.id
      }
    }
    if (destId) maps.variants.set(variant.id, destId)
  }
}

async function ensureMovementForTrainer(
  db: Db,
  sourceMovementId: string,
  ownerTrainerId: string,
  recipientTrainerId: string,
  maps: MovementCopyMaps,
) {
  if (maps.movements.has(sourceMovementId)) return

  const [source] = await db.sql<{
    id: string
    trainer_id: string | null
    source_exercise_id: string | null
    name: string
    aliases: string[]
    muscle_groups: string[]
    youtube_url: string | null
    default_category: string | null
    default_equipment: Equipment | null
  }>`
    SELECT id, trainer_id, source_exercise_id, name, aliases, muscle_groups,
           youtube_url, default_category, default_equipment
    FROM movements
    WHERE id = ${sourceMovementId}
      AND (trainer_id IS NULL OR trainer_id = ${ownerTrainerId})
  `
  if (!source) {
    throw new Error('A movement from the shared item could not be copied')
  }

  if (source.trainer_id == null) {
    maps.movements.set(sourceMovementId, source.id)
    await copyVariants(db, source.id, source.id, maps)
    return
  }

  if (source.source_exercise_id) {
    const [owned] = await db.sql<{ id: string }>`
      SELECT id FROM movements
      WHERE trainer_id = ${recipientTrainerId}
        AND source_exercise_id = ${source.source_exercise_id}
      LIMIT 1
    `
    if (owned) {
      maps.movements.set(sourceMovementId, owned.id)
      await copyVariants(db, source.id, owned.id, maps)
      return
    }
  }

  const [named] = await db.sql<{ id: string }>`
    SELECT id FROM movements
    WHERE trainer_id = ${recipientTrainerId}
      AND lower(name) = lower(${source.name})
    LIMIT 1
  `
  if (named) {
    maps.movements.set(sourceMovementId, named.id)
    await copyVariants(db, source.id, named.id, maps)
    return
  }

  const [inserted] = await db.sql<{ id: string }>`
    INSERT INTO movements (
      trainer_id, source_exercise_id, name, aliases, muscle_groups,
      youtube_url, default_category, default_equipment
    )
    VALUES (
      ${recipientTrainerId},
      ${source.source_exercise_id},
      ${source.name},
      ${source.aliases ?? []},
      ${source.muscle_groups ?? []},
      ${source.youtube_url},
      ${source.default_category},
      ${source.default_equipment}
    )
    RETURNING id
  `
  maps.movements.set(sourceMovementId, inserted!.id)
  maps.created.add(inserted!.id)
  await copyVariants(db, source.id, inserted!.id, maps)
}

async function copyMovementDefaults(
  db: Db,
  ownerTrainerId: string,
  recipientTrainerId: string,
  maps: MovementCopyMaps,
) {
  for (const [sourceId, destId] of maps.movements) {
    if (!maps.created.has(destId)) continue
    const [saved] = await db.sql<{ defaults: unknown }>`
      SELECT defaults
      FROM trainer_movement_defaults
      WHERE trainer_id = ${ownerTrainerId} AND movement_id = ${sourceId}
    `
    if (!saved) continue
    const payload =
      typeof saved.defaults === 'string' ? saved.defaults : JSON.stringify(saved.defaults)
    await db.sql`
      INSERT INTO trainer_movement_defaults (trainer_id, movement_id, defaults)
      VALUES (
        ${recipientTrainerId},
        ${destId},
        CAST(${payload} AS jsonb)
      )
      ON CONFLICT (trainer_id, movement_id) DO NOTHING
    `
  }
}

async function copyTemplateToTrainer(
  db: Db,
  sourceTemplateId: string,
  ownerTrainerId: string,
  recipientTrainerId: string,
  maps: MovementCopyMaps,
  existingNames: string[],
) {
  const [source] = await db.sql<TemplateRow>`
    SELECT * FROM workout_templates
    WHERE id = ${sourceTemplateId} AND trainer_id = ${ownerTrainerId}
  `
  if (!source) throw new Error('Shared workout was deleted')

  const exercises = await loadExercises(db, source.id)
  for (const exercise of exercises) {
    await ensureMovementForTrainer(
      db,
      exercise.movement_id,
      ownerTrainerId,
      recipientTrainerId,
      maps,
    )
  }

  const name = uniqueLibraryName(source.name.trim() || 'Untitled workout', existingNames)
  existingNames.push(name)
  const [row] = await db.sql<TemplateRow>`
    INSERT INTO workout_templates (trainer_id, name, notes, warmup)
    SELECT ${recipientTrainerId}, ${name}, notes, warmup
    FROM workout_templates
    WHERE id = ${source.id}
    RETURNING *
  `

  for (const exercise of exercises) {
    const movementId = maps.movements.get(exercise.movement_id)
    if (!movementId) throw new Error('A movement from the shared item could not be copied')
    const variantId = exercise.variant_id
      ? (maps.variants.get(exercise.variant_id) ?? null)
      : null
    await db.sql`
      INSERT INTO template_exercises (
        template_id, sort_order, movement_id, variant_id, equipment,
        set_count, reps_min, reps_max, per_set_enabled, set_prescriptions,
        method, method_target, category, load_prescription,
        tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
        tempo_mode, tempo_per_rep,
        rest_after_set_seconds, rest_after_exercise_seconds,
        superset_group, superset_order, notes, youtube_url
      )
      VALUES (
        ${row!.id}, ${exercise.sort_order}, ${movementId}, ${variantId}, ${exercise.equipment},
        ${exercise.set_count}, ${exercise.reps_min}, ${exercise.reps_max}, ${exercise.per_set_enabled},
        CAST(${JSON.stringify(exercise.set_prescriptions ?? [])} AS jsonb),
        ${exercise.method}, ${exercise.method_target}, ${exercise.category}, ${exercise.load_prescription},
        ${exercise.tempo_eccentric}, ${exercise.tempo_pause_bottom}, ${exercise.tempo_concentric},
        ${exercise.tempo_pause_top}, ${exercise.tempo_mode ?? 'default'},
        CAST(${JSON.stringify(exercise.tempo_per_rep ?? [])} AS jsonb),
        ${exercise.rest_after_set_seconds}, ${exercise.rest_after_exercise_seconds},
        ${exercise.superset_group}, ${exercise.superset_order}, ${exercise.notes}, ${exercise.youtube_url}
      )
    `
  }

  return row!.id
}

function remapPrescription(prescription: Prescription, maps: MovementCopyMaps): Prescription {
  return {
    warmup: warmupToText(prescription.warmup),
    exercises: (prescription.exercises ?? []).map((exercise) => {
      const movementId = maps.movements.get(exercise.movementId) ?? exercise.movementId
      const variantId = exercise.variantId
        ? (maps.variants.get(exercise.variantId) ?? null)
        : null
      return {
        ...exercise,
        movementId,
        variantId,
      } satisfies PrescribedExercise
    }),
  }
}

async function createShare(
  ctx: AppContext,
  resourceType: LibraryShareResourceType,
  resourceId: string,
  req: Request,
) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const body = (await req.json()) as { trainerCode?: string }
  const code = body.trainerCode?.trim().toUpperCase()
  if (!code) return error('Trainer code is required')

  const recipient = await lookupTrainerByCode(ctx.db, code)
  if (!recipient) return error('No trainer found with that code', 404)
  if (recipient.id === ctx.trainer!.id) return error('You cannot share with yourself')

  if (resourceType === 'workout') {
    const rows = await ctx.db.sql<{ id: string }>`
      SELECT id FROM workout_templates
      WHERE id = ${resourceId} AND trainer_id = ${ctx.trainer!.id}
    `
    if (!rows[0]) return error('Workout not found', 404)
  } else {
    const rows = await ctx.db.sql<{ id: string }>`
      SELECT id FROM programs
      WHERE id = ${resourceId} AND trainer_id = ${ctx.trainer!.id}
    `
    if (!rows[0]) return error('Program not found', 404)
  }

  const [existing] = await ctx.db.sql<{ id: string }>`
    SELECT id FROM library_shares
    WHERE recipient_trainer_id = ${recipient.id}
      AND resource_type = ${resourceType}
      AND resource_id = ${resourceId}
      AND status = 'pending'
  `
  if (existing) {
    return json({ id: existing.id, recipientName: recipient.name })
  }

  const [row] = await ctx.db.sql<{ id: string }>`
    INSERT INTO library_shares (
      owner_trainer_id, recipient_trainer_id, resource_type, resource_id, status
    )
    VALUES (
      ${ctx.trainer!.id}, ${recipient.id}, ${resourceType}, ${resourceId}, 'pending'
    )
    RETURNING id
  `
  return json({ id: row!.id, recipientName: recipient.name }, 201)
}

export async function handleShareTemplate(ctx: AppContext, id: string, req: Request) {
  return createShare(ctx, 'workout', id, req)
}

export async function handleShareProgram(ctx: AppContext, id: string, req: Request) {
  return createShare(ctx, 'program', id, req)
}

export async function handleListLibraryShares(ctx: AppContext, req: Request) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const url = new URL(req.url)
  const typeParam = url.searchParams.get('type')
  const type =
    typeParam === 'workout' || typeParam === 'program'
      ? typeParam
      : null
  const shares = await pendingInbox(ctx.db, ctx.trainer!.id, type)
  return json(shares)
}

export async function handleGetLibraryShare(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const share = await loadPendingShare(ctx.db, id, ctx.trainer!.id)
  if (!share) return error('Shared item not found', 404)

  if (share.resource_type === 'workout') {
    const rows = await ctx.db.sql<TemplateRow>`
      SELECT * FROM workout_templates
      WHERE id = ${share.resource_id} AND trainer_id = ${share.owner_trainer_id}
    `
    if (!rows[0]) return error('Shared workout was deleted', 404)
    const exercises = (await loadExercises(ctx.db, rows[0].id)).map(mapExercise)
    const preview: LibrarySharePreview = {
      share: mapShare(share),
      workout: mapTemplate(rows[0], exercises),
    }
    return json(preview)
  }

  const rows = await ctx.db.sql<ProgramRow>`
    SELECT * FROM programs
    WHERE id = ${share.resource_id} AND trainer_id = ${share.owner_trainer_id}
  `
  if (!rows[0]) return error('Shared program was deleted', 404)
  const sessions = await loadProgramSessions(ctx.db, rows[0].id)
  const preview: LibrarySharePreview = {
    share: mapShare({ ...share, resource_name: rows[0].name }),
    program: mapProgram(rows[0], sessions),
  }
  return json(preview)
}

export async function handleAcceptLibraryShare(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  const share = await loadPendingShare(ctx.db, id, ctx.trainer!.id)
  if (!share) return error('Shared item not found', 404)

  const maps: MovementCopyMaps = {
    movements: new Map(),
    variants: new Map(),
    created: new Set(),
  }
  const recipientId = ctx.trainer!.id
  const ownerId = share.owner_trainer_id

  try {
    if (share.resource_type === 'workout') {
      const existing = await ctx.db.sql<{ name: string }>`
        SELECT name FROM workout_templates WHERE trainer_id = ${recipientId}
      `
      const workoutId = await copyTemplateToTrainer(
        ctx.db,
        share.resource_id,
        ownerId,
        recipientId,
        maps,
        existing.map((row) => row.name),
      )
      await copyMovementDefaults(ctx.db, ownerId, recipientId, maps)
      await ctx.db.sql`
        UPDATE library_shares
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = ${share.id}
      `
      const result: LibraryShareAcceptResult = { workoutId }
      return json(result)
    }

    const [program] = await ctx.db.sql<ProgramRow>`
      SELECT * FROM programs
      WHERE id = ${share.resource_id} AND trainer_id = ${ownerId}
    `
    if (!program) return error('Shared program was deleted', 404)
    const sessions = await ctx.db.sql<ProgramSessionRow>`
      SELECT * FROM program_sessions WHERE program_id = ${program.id}
    `

    const templateIds = [
      ...new Set(
        sessions
          .map((session) => session.template_id)
          .filter((templateId): templateId is string => Boolean(templateId)),
      ),
    ]
    for (const session of sessions) {
      const prescription = parseJsonColumn<Prescription>(session.prescription, {
        warmup: '',
        exercises: [],
      })
      for (const exercise of prescription.exercises ?? []) {
        if (exercise.movementId) {
          await ensureMovementForTrainer(
            ctx.db,
            exercise.movementId,
            ownerId,
            recipientId,
            maps,
          )
        }
      }
    }

    const existingWorkouts = await ctx.db.sql<{ name: string }>`
      SELECT name FROM workout_templates WHERE trainer_id = ${recipientId}
    `
    const workoutNames = existingWorkouts.map((row) => row.name)
    const templateMap = new Map<string, string>()
    const copiedWorkoutIds: string[] = []
    for (const templateId of templateIds) {
      const copiedId = await copyTemplateToTrainer(
        ctx.db,
        templateId,
        ownerId,
        recipientId,
        maps,
        workoutNames,
      )
      templateMap.set(templateId, copiedId)
      copiedWorkoutIds.push(copiedId)
    }

    const existingPrograms = await ctx.db.sql<{ name: string }>`
      SELECT name FROM programs WHERE trainer_id = ${recipientId}
    `
    const programName = uniqueLibraryName(
      program.name.trim() || 'Untitled program',
      existingPrograms.map((row) => row.name),
    )
    const [copiedProgram] = await ctx.db.sql<ProgramRow>`
      INSERT INTO programs (trainer_id, name, notes, week_count)
      VALUES (${recipientId}, ${programName}, ${program.notes}, ${program.week_count})
      RETURNING *
    `

    for (const session of sessions) {
      const prescription = remapPrescription(
        parseJsonColumn<Prescription>(session.prescription, {
          warmup: '',
          exercises: [],
        }),
        maps,
      )
      const templateId = session.template_id
        ? (templateMap.get(session.template_id) ?? null)
        : null
      await ctx.db.sql`
        INSERT INTO program_sessions (
          program_id, template_id, name, week_index, weekday, prescription
        )
        VALUES (
          ${copiedProgram!.id},
          ${templateId},
          ${session.name},
          ${session.week_index},
          ${session.weekday},
          CAST(${JSON.stringify(prescription)} AS jsonb)
        )
      `
    }

    await copyMovementDefaults(ctx.db, ownerId, recipientId, maps)
    await ctx.db.sql`
      UPDATE library_shares
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = ${share.id}
    `
    const result: LibraryShareAcceptResult = {
      programId: copiedProgram!.id,
      workoutIds: copiedWorkoutIds,
    }
    return json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add shared item'
    return error(message, 400)
  }
}

export async function handleDismissLibraryShare(ctx: AppContext, id: string) {
  const denied = requireTrainer(ctx)
  if (denied) return denied
  await ctx.db.sql`
    DELETE FROM library_shares
    WHERE id = ${id}
      AND recipient_trainer_id = ${ctx.trainer!.id}
      AND status = 'pending'
  `
  return json({ ok: true })
}
