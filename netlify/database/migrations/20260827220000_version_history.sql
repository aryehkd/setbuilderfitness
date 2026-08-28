ALTER TABLE workout_templates
  ADD COLUMN IF NOT EXISTS version_history JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE program_sessions
  ADD COLUMN IF NOT EXISTS version_history JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS version_history JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE sessions
SET version_history = jsonb_build_array(
  jsonb_build_object(
    'type', 'assigned',
    'name', name,
    'at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
)
WHERE version_history = '[]'::jsonb;

UPDATE program_sessions
SET version_history = jsonb_build_array(
  jsonb_build_object(
    'type', 'assigned',
    'name', name,
    'at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
)
WHERE version_history = '[]'::jsonb;

UPDATE workout_templates AS t
SET version_history = COALESCE((
  SELECT jsonb_agg(ev ORDER BY ord)
  FROM (
    SELECT
      jsonb_build_object(
        'type', 'assigned',
        'name', ps.name,
        'at', to_char(ps.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS ev,
      ps.created_at AS ord
    FROM program_sessions AS ps
    WHERE ps.template_id = t.id
    UNION ALL
    SELECT
      jsonb_build_object(
        'type', 'assigned',
        'name', s.name,
        'at', to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS ev,
      s.created_at AS ord
    FROM sessions AS s
    WHERE s.template_id = t.id
  ) AS events
), '[]'::jsonb)
WHERE version_history = '[]'::jsonb
  AND (
    EXISTS (SELECT 1 FROM program_sessions AS ps WHERE ps.template_id = t.id)
    OR EXISTS (SELECT 1 FROM sessions AS s WHERE s.template_id = t.id)
  );
