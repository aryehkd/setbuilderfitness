CREATE TABLE IF NOT EXISTS trainer_movement_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  movement_id UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  defaults JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trainer_id, movement_id)
);

CREATE INDEX IF NOT EXISTS trainer_movement_defaults_trainer_id_idx
  ON trainer_movement_defaults (trainer_id);
