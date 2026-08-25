UPDATE workout_templates
SET warmup = to_jsonb(
  COALESCE(
    (
      SELECT string_agg(line, E'\n')
      FROM (
        SELECT NULLIF(trim(both FROM concat_ws(
          ' · ',
          NULLIF(elem->>'name', ''),
          CASE WHEN NULLIF(elem->>'sets', '') IS NOT NULL THEN (elem->>'sets') || ' sets' END,
          CASE WHEN NULLIF(elem->>'reps', '') IS NOT NULL THEN (elem->>'reps') || ' reps' END,
          NULLIF(elem->>'notes', '')
        )), '') AS line
        FROM jsonb_array_elements(warmup) AS elem
      ) AS lines
      WHERE line IS NOT NULL
    ),
    ''
  )
)
WHERE jsonb_typeof(warmup) = 'array';

UPDATE sessions
SET prescription = jsonb_set(
  prescription,
  '{warmup}',
  to_jsonb(
    COALESCE(
      (
        SELECT string_agg(line, E'\n')
        FROM (
          SELECT NULLIF(trim(both FROM concat_ws(
            ' · ',
            NULLIF(elem->>'name', ''),
            CASE WHEN NULLIF(elem->>'sets', '') IS NOT NULL THEN (elem->>'sets') || ' sets' END,
            CASE WHEN NULLIF(elem->>'reps', '') IS NOT NULL THEN (elem->>'reps') || ' reps' END,
            NULLIF(elem->>'notes', '')
          )), '') AS line
          FROM jsonb_array_elements(prescription->'warmup') AS elem
        ) AS lines
        WHERE line IS NOT NULL
      ),
      ''
    )
  )
)
WHERE jsonb_typeof(prescription->'warmup') = 'array';
