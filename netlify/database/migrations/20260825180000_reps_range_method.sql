ALTER TABLE template_exercises DROP CONSTRAINT IF EXISTS template_exercises_method_check;
ALTER TABLE template_exercises ADD CONSTRAINT template_exercises_method_check
  CHECK (
    method IN (
      'straight',
      'amrap',
      'rir',
      'rpe',
      'to_failure',
      'reps_range'
    )
  );
