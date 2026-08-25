CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT CHECK (role IN ('trainer', 'client')),
  bio TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES trainers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX clients_trainer_id_idx ON clients(trainer_id);

CREATE TABLE movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  muscle_groups TEXT[] NOT NULL DEFAULT '{}',
  youtube_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX movements_name_idx ON movements (lower(name));

CREATE TABLE movement_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  equipment TEXT NOT NULL CHECK (
    equipment IN (
      'barbell',
      'dumbbell',
      'machine',
      'cable',
      'kettlebell',
      'bodyweight',
      'other'
    )
  ),
  UNIQUE (movement_id, equipment)
);

CREATE TABLE workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  warmup JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  movement_id UUID NOT NULL REFERENCES movements(id),
  variant_id UUID REFERENCES movement_variants(id),
  equipment TEXT,
  set_count INT NOT NULL DEFAULT 3,
  reps_min INT NOT NULL DEFAULT 8,
  reps_max INT,
  method TEXT NOT NULL DEFAULT 'straight' CHECK (
    method IN ('straight', 'amrap', 'rir', 'rpe', 'to_failure')
  ),
  method_target NUMERIC,
  tempo_eccentric NUMERIC,
  tempo_pause_bottom NUMERIC,
  tempo_concentric NUMERIC,
  tempo_pause_top NUMERIC,
  rest_after_set_seconds INT,
  rest_after_exercise_seconds INT,
  superset_group TEXT,
  superset_order INT,
  notes TEXT,
  youtube_url TEXT
);

CREATE INDEX template_exercises_template_id_idx ON template_exercises(template_id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES trainers(id),
  template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (
    status IN ('assigned', 'completed', 'skipped')
  ),
  prescription JSONB NOT NULL,
  logged_duration_seconds INT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_client_date_idx ON sessions(client_id, scheduled_date);
CREATE INDEX sessions_trainer_date_idx ON sessions(trainer_id, scheduled_date);

CREATE TABLE session_set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_index INT NOT NULL,
  set_index INT NOT NULL,
  weight NUMERIC,
  reps INT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (session_id, exercise_index, set_index)
);

CREATE TABLE ad_hoc_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (
    activity_type IN ('cardio', 'sport', 'mobility', 'other')
  ),
  duration_seconds INT NOT NULL,
  notes TEXT,
  logged_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ad_hoc_logs_user_date_idx ON ad_hoc_logs(user_id, logged_on);
