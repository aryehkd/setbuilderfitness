ALTER TABLE template_exercises
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'accessory',
  ADD COLUMN IF NOT EXISTS load_prescription TEXT;

ALTER TABLE template_exercises DROP CONSTRAINT IF EXISTS template_exercises_category_check;
ALTER TABLE template_exercises ADD CONSTRAINT template_exercises_category_check
  CHECK (
    category IN (
      'main_lift',
      'accessory',
      'warmup',
      'finisher',
      'rehab',
      'plyo'
    )
  );
