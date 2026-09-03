export type Role = 'trainer' | 'client'
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'bodyweight'
  | 'other'
export type SetMethod =
  | 'straight'
  | 'amrap'
  | 'rir'
  | 'rpe'
  | 'to_failure'
  | 'reps_range'
  | 'timed'
export type ExerciseCategory =
  | 'main_lift'
  | 'accessory'
  | 'warmup'
  | 'finisher'
  | 'rehab'
  | 'plyo'
export type SessionStatus = 'assigned' | 'completed' | 'skipped'
export type AdHocType = 'cardio' | 'sport' | 'mobility' | 'other'

export type WarmupStep = {
  name: string
  sets?: number
  reps?: number
  durationSeconds?: number
  notes?: string
}

export function warmupToText(warmup: unknown): string {
  if (typeof warmup === 'string') return warmup
  if (!Array.isArray(warmup)) return ''
  return warmup
    .map((step) => {
      if (typeof step === 'string') return step
      if (!step || typeof step !== 'object') return ''
      const item = step as WarmupStep
      return [
        item.name,
        item.sets != null ? `${item.sets} sets` : null,
        item.reps != null ? `${item.reps} reps` : null,
        item.notes,
      ]
        .filter(Boolean)
        .join(' · ')
    })
    .filter(Boolean)
    .join('\n')
}

export type Tempo = {
  eccentric?: number | null
  pauseBottom?: number | null
  concentric?: number | null
  pauseTop?: number | null
}

export type TempoMode = 'default' | 'per_rep'

export type SetPrescription = {
  repsMin: number
  repsMax?: number | null
  loadPrescription?: string | null
}

export type MovementPrescriptionDefaults = {
  variantId?: string | null
  equipment?: Equipment | null
  setCount: number
  repsMin: number
  repsMax?: number | null
  perSetEnabled?: boolean
  setPrescriptions?: SetPrescription[]
  method: SetMethod
  methodTarget?: number | null
  category?: ExerciseCategory | null
  loadPrescription?: string | null
  tempo?: Tempo
  tempoMode?: TempoMode
  tempoPerRep?: Tempo[]
  restAfterSetSeconds?: number | null
  restAfterExerciseSeconds?: number | null
  notes?: string | null
  youtubeUrl?: string | null
}

export type PrescribedExercise = {
  movementId: string
  movementName: string
  variantId?: string | null
  equipment?: Equipment | null
  setCount: number
  repsMin: number
  repsMax?: number | null
  perSetEnabled?: boolean
  setPrescriptions?: SetPrescription[]
  method: SetMethod
  methodTarget?: number | null
  category?: ExerciseCategory | null
  loadPrescription?: string | null
  tempo?: Tempo
  tempoMode?: TempoMode
  tempoPerRep?: Tempo[]
  restAfterSetSeconds?: number | null
  restAfterExerciseSeconds?: number | null
  supersetGroup?: string | null
  supersetOrder?: number | null
  notes?: string | null
  youtubeUrl?: string | null
}

export type Prescription = {
  warmup: string
  exercises: PrescribedExercise[]
}

export type MovementVariant = {
  id: string
  equipment: Equipment
}

export type Movement = {
  id: string
  source: 'shared' | 'trainer'
  sourceExerciseId: string | null
  name: string
  description: string | null
  difficulty: number | null
  libraryCategory: string | null
  aliases: string[]
  muscleGroups: string[]
  primaryMuscle: string | null
  secondaryMuscles: string[]
  muscleIntensity: Record<string, string>
  youtubeUrl: string | null
  defaultCategory: ExerciseCategory | null
  defaultEquipment: Equipment | null
  variants: MovementVariant[]
  savedDefaults: MovementPrescriptionDefaults | null
}

export type TemplateExercise = {
  id: string
  sortOrder: number
  movementId: string
  movementName?: string
  variantId: string | null
  equipment: Equipment | null
  setCount: number
  repsMin: number
  repsMax: number | null
  perSetEnabled: boolean
  setPrescriptions: SetPrescription[]
  method: SetMethod
  methodTarget: number | null
  category: ExerciseCategory | null
  loadPrescription: string | null
  tempoEccentric: number | null
  tempoPauseBottom: number | null
  tempoConcentric: number | null
  tempoPauseTop: number | null
  tempoMode: TempoMode
  tempoPerRep: Tempo[]
  restAfterSetSeconds: number | null
  restAfterExerciseSeconds: number | null
  supersetGroup: string | null
  supersetOrder: number | null
  notes: string | null
  youtubeUrl: string | null
}

export type VersionHistoryEvent =
  | { type: 'assigned'; name: string; at: string }
  | { type: 'edit'; text: string; at: string }

export type WorkoutTemplate = {
  id: string
  trainerId: string
  name: string
  notes: string | null
  warmup: string
  createdAt: string
  updatedAt: string
  exercises?: TemplateExercise[]
  versionHistory?: VersionHistoryEvent[]
}

export type ProgramSession = {
  id: string
  programId: string
  templateId: string | null
  name: string
  weekIndex: number
  weekday: number
  prescription: Prescription
  versionHistory?: VersionHistoryEvent[]
}

export type Program = {
  id: string
  trainerId: string
  name: string
  notes: string | null
  weekCount: number
  createdAt: string
  updatedAt: string
  sessions?: ProgramSession[]
}

export type SetLog = {
  exerciseIndex: number
  setIndex: number
  weight: number | null
  reps: number | null
  completed: boolean
}

export function setLogIsCompleted(log: Pick<SetLog, 'weight' | 'reps'>) {
  return log.weight != null || log.reps != null
}

export type Session = {
  id: string
  clientId: string
  trainerId: string
  templateId: string | null
  name: string
  scheduledDate: string
  status: SessionStatus
  prescription: Prescription
  loggedDurationSeconds: number | null
  completedAt: string | null
  logs: SetLog[]
  clientName?: string
  isTrainerWorkout?: boolean
  versionHistory?: VersionHistoryEvent[]
}

export type MeResponse = {
  identity: { id: string; email?: string; name?: string; pictureUrl?: string }
  user: {
    id: string
    email: string
    name: string
    role: Role | null
    bio: string | null
    phone: string | null
    location: string | null
    website: string | null
    timezone: string | null
    accentColor: string
    onboardingCompleted: boolean
  }
  trainer: { id: string; code: string } | null
  client: {
    id: string
    trainerId: string | null
    isSelf: boolean
    trainerName: string | null
    trainerCode: string | null
  } | null
}

export type PublicTrainerProfile = {
  id: string
  name: string
  email: string
  phone: string | null
  location: string | null
  website: string | null
  timezone: string | null
  bio: string | null
  code: string
  accentColor: string
}

export type TrainerClient = {
  id: string
  userId: string
  name: string
  email: string
  upcomingCount: number
  lastSessionDate: string | null
}

export type ActivityDay = {
  date: string
  minutes: number
  titles: string[]
}

export type ActivityResponse = {
  days: ActivityDay[]
  /** Years that have any logged activity, so the heatmap only offers those. */
  years: number[]
}

export type AdHocLog = {
  id: string
  activityType: AdHocType
  durationSeconds: number
  notes: string | null
  loggedOn: string
}

export type ExerciseHistoryEntry = {
  sessionId: string
  date: string
  sessionName: string
  setIndex: number
  weight: number | null
  reps: number | null
}

export type MovementHistoryById = Record<string, ExerciseHistoryEntry[]>

export type LoggedMovement = {
  id: string
  name: string
  aliases: string[]
}
