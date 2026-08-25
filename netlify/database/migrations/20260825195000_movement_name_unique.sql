CREATE UNIQUE INDEX IF NOT EXISTS movements_name_unique ON movements (lower(name));
