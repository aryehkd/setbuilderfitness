ALTER TABLE template_exercises
  ADD COLUMN IF NOT EXISTS tempo_mode TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS tempo_per_rep JSONB NOT NULL DEFAULT '[]';

ALTER TABLE template_exercises DROP CONSTRAINT IF EXISTS template_exercises_tempo_mode_check;
ALTER TABLE template_exercises ADD CONSTRAINT template_exercises_tempo_mode_check
  CHECK (tempo_mode IN ('default', 'per_rep'));
