-- Shared catalog rows from Open Exercise DB (Glowupp-app/open-exercisedb).
-- id is the source slug so later seeds can upsert without remapping.
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
);

CREATE INDEX IF NOT EXISTS exercise_library_name_idx
  ON exercise_library (lower(name));
CREATE INDEX IF NOT EXISTS exercise_library_category_idx
  ON exercise_library (category);
CREATE INDEX IF NOT EXISTS exercise_library_primary_muscle_idx
  ON exercise_library (lower(primary_muscle));
