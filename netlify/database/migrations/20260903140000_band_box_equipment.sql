ALTER TABLE movement_variants DROP CONSTRAINT IF EXISTS movement_variants_equipment_check;
ALTER TABLE movement_variants ADD CONSTRAINT movement_variants_equipment_check
  CHECK (
    equipment IN (
      'barbell',
      'dumbbell',
      'machine',
      'cable',
      'kettlebell',
      'band',
      'box',
      'bodyweight',
      'other'
    )
  );
