import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  role: text('role'),
  bio: text('bio'),
  phone: text('phone'),
  location: text('location'),
  website: text('website'),
  timezone: text('timezone'),
  accentColor: text('accent_color'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', {
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const trainers = pgTable('trainers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    trainerId: uuid('trainer_id').references(() => trainers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('clients_trainer_id_idx').on(t.trainerId)],
)

export const movements = pgTable(
  'movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainerId: uuid('trainer_id').references(() => trainers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    aliases: text('aliases').array().notNull().default([]),
    muscleGroups: text('muscle_groups').array().notNull().default([]),
    youtubeUrl: text('youtube_url'),
    defaultCategory: text('default_category'),
    defaultEquipment: text('default_equipment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('movements_name_idx').on(t.name), index('movements_trainer_id_idx').on(t.trainerId)],
)

export const movementVariants = pgTable(
  'movement_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    movementId: uuid('movement_id')
      .notNull()
      .references(() => movements.id, { onDelete: 'cascade' }),
    equipment: text('equipment').notNull(),
  },
  (t) => [unique().on(t.movementId, t.equipment)],
)

export const workoutTemplates = pgTable('workout_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainerId: uuid('trainer_id')
    .notNull()
    .references(() => trainers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  notes: text('notes'),
  warmup: jsonb('warmup').notNull().default([]),
  versionHistory: jsonb('version_history').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const templateExercises = pgTable(
  'template_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    movementId: uuid('movement_id')
      .notNull()
      .references(() => movements.id),
    variantId: uuid('variant_id').references(() => movementVariants.id),
    equipment: text('equipment'),
    setCount: integer('set_count').notNull().default(3),
    repsMin: integer('reps_min').notNull().default(8),
    repsMax: integer('reps_max'),
    perSetEnabled: boolean('per_set_enabled').notNull().default(false),
    setPrescriptions: jsonb('set_prescriptions').notNull().default([]),
    method: text('method').notNull().default('straight'),
    methodTarget: numeric('method_target'),
    category: text('category').notNull().default('accessory'),
    loadPrescription: text('load_prescription'),
    tempoEccentric: numeric('tempo_eccentric'),
    tempoPauseBottom: numeric('tempo_pause_bottom'),
    tempoConcentric: numeric('tempo_concentric'),
    tempoPauseTop: numeric('tempo_pause_top'),
    tempoMode: text('tempo_mode').notNull().default('default'),
    tempoPerRep: jsonb('tempo_per_rep').notNull().default([]),
    restAfterSetSeconds: integer('rest_after_set_seconds'),
    restAfterExerciseSeconds: integer('rest_after_exercise_seconds'),
    supersetGroup: text('superset_group'),
    supersetOrder: integer('superset_order'),
    notes: text('notes'),
    youtubeUrl: text('youtube_url'),
  },
  (t) => [index('template_exercises_template_id_idx').on(t.templateId)],
)

export const programs = pgTable('programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainerId: uuid('trainer_id')
    .notNull()
    .references(() => trainers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  notes: text('notes'),
  weekCount: integer('week_count').notNull().default(4),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const programSessions = pgTable(
  'program_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => workoutTemplates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    weekIndex: integer('week_index').notNull(),
    weekday: integer('weekday').notNull(),
    prescription: jsonb('prescription').notNull(),
    versionHistory: jsonb('version_history').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('program_sessions_program_id_idx').on(t.programId)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => trainers.id),
    templateId: uuid('template_id').references(() => workoutTemplates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    scheduledDate: date('scheduled_date').notNull(),
    status: text('status').notNull().default('assigned'),
    prescription: jsonb('prescription').notNull(),
    loggedDurationSeconds: integer('logged_duration_seconds'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    versionHistory: jsonb('version_history').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_client_date_idx').on(t.clientId, t.scheduledDate),
    index('sessions_trainer_date_idx').on(t.trainerId, t.scheduledDate),
  ],
)

export const sessionSetLogs = pgTable(
  'session_set_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    exerciseIndex: integer('exercise_index').notNull(),
    setIndex: integer('set_index').notNull(),
    weight: numeric('weight'),
    reps: integer('reps'),
    completed: boolean('completed').notNull().default(false),
  },
  (t) => [unique().on(t.sessionId, t.exerciseIndex, t.setIndex)],
)

export const adHocLogs = pgTable(
  'ad_hoc_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityType: text('activity_type').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    notes: text('notes'),
    loggedOn: date('logged_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ad_hoc_logs_user_date_idx').on(t.userId, t.loggedOn)],
)
