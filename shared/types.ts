export type Role = 'trainer' | 'client'
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'bodyweight'
  | 'other'
export type SetMethod = 'straight' | 'amrap' | 'rir' | 'rpe' | 'to_failure'
export type SessionStatus = 'assigned' | 'completed' | 'skipped'
export type AdHocType = 'cardio' | 'sport' | 'mobility' | 'other'

export type WarmupStep = {
  name: string
  sets?: number
  reps?: number
  durationSeconds?: number
  notes?: string
}

export type Tempo = {
  eccentric?: number | null
  pauseBottom?: number | null
  concentric?: number | null
  pauseTop?: number | null
}

export type PrescribedExercise = {
  movementId: string
  movementName: string
  variantId?: string | null
  equipment?: Equipment | null
  setCount: number
  repsMin: number
  repsMax?: number | null
  method: SetMethod
  methodTarget?: number | null
  tempo?: Tempo
  restAfterSetSeconds?: number | null
  restAfterExerciseSeconds?: number | null
  supersetGroup?: string | null
  supersetOrder?: number | null
  notes?: string | null
  youtubeUrl?: string | null
}

export type Prescription = {
  warmup: WarmupStep[]
  exercises: PrescribedExercise[]
}

export type MovementVariant = {
  id: string
  equipment: Equipment
}

export type Movement = {
  id: string
  name: string
  aliases: string[]
  muscleGroups: string[]
  youtubeUrl: string | null
  variants: MovementVariant[]
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
  method: SetMethod
  methodTarget: number | null
  tempoEccentric: number | null
  tempoPauseBottom: number | null
  tempoConcentric: number | null
  tempoPauseTop: number | null
  restAfterSetSeconds: number | null
  restAfterExerciseSeconds: number | null
  supersetGroup: string | null
  supersetOrder: number | null
  notes: string | null
  youtubeUrl: string | null
}

export type WorkoutTemplate = {
  id: string
  trainerId: string
  name: string
  notes: string | null
  warmup: WarmupStep[]
  createdAt: string
  updatedAt: string
  exercises?: TemplateExercise[]
}

export type SetLog = {
  exerciseIndex: number
  setIndex: number
  weight: number | null
  reps: number | null
  completed: boolean
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
}

export type MeResponse = {
  identity: { id: string; email?: string; name?: string; pictureUrl?: string }
  user: {
    id: string
    email: string
    name: string
    role: Role | null
    bio: string | null
    onboardingCompleted: boolean
  }
  trainer: { id: string; code: string } | null
  client: {
    id: string
    trainerId: string | null
    trainerName: string | null
    trainerCode: string | null
  } | null
}

export type TrainerClient = {
  id: string
  userId: string
  name: string
  email: string
  upcomingCount: number
}

export type ActivityDay = {
  date: string
  minutes: number
}

export type ExerciseHistoryEntry = {
  date: string
  sessionName: string
  setIndex: number
  weight: number | null
  reps: number | null
}
