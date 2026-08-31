ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO clients (user_id, trainer_id, is_self)
SELECT t.user_id, t.id, TRUE
FROM trainers t
ON CONFLICT (user_id) DO UPDATE
SET trainer_id = EXCLUDED.trainer_id,
    is_self = TRUE;

CREATE INDEX IF NOT EXISTS clients_trainer_self_idx
  ON clients (trainer_id, is_self);
