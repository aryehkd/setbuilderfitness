ALTER TABLE movements
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS default_category TEXT,
  ADD COLUMN IF NOT EXISTS default_equipment TEXT;

CREATE INDEX IF NOT EXISTS movements_trainer_id_idx ON movements (trainer_id);

DROP INDEX IF EXISTS movements_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS movements_shared_name_unique
  ON movements (lower(name))
  WHERE trainer_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS movements_trainer_name_unique
  ON movements (trainer_id, lower(name))
  WHERE trainer_id IS NOT NULL;

UPDATE movements m
SET default_equipment = v.equipment
FROM (
  SELECT DISTINCT ON (movement_id) movement_id, equipment
  FROM movement_variants
  ORDER BY movement_id, equipment
) v
WHERE m.id = v.movement_id
  AND m.default_equipment IS NULL;
