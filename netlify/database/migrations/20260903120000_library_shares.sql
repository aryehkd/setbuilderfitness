CREATE TABLE IF NOT EXISTS library_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  recipient_trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('workout', 'program')),
  resource_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS library_shares_recipient_status_idx
  ON library_shares (recipient_trainer_id, status);

CREATE INDEX IF NOT EXISTS library_shares_owner_idx
  ON library_shares (owner_trainer_id);

CREATE UNIQUE INDEX IF NOT EXISTS library_shares_pending_unique
  ON library_shares (recipient_trainer_id, resource_type, resource_id)
  WHERE status = 'pending';
