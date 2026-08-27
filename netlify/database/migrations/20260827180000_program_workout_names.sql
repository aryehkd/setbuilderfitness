UPDATE program_sessions ps
SET name = wt.name || ' - Week ' || (ps.week_index + 1)::text || ' - ' || p.name,
    updated_at = NOW()
FROM workout_templates wt, programs p
WHERE ps.template_id = wt.id
  AND ps.program_id = p.id
  AND ps.name = wt.name;
