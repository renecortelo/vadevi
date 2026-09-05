-- Deepen the tasting: the bead of a sparkling wine, and the nose read twice.
--
-- A sparkling wine's mousse is a whole dimension the form did not capture — how
-- lively the bead is, and how fine or coarse. And a nose changes between the
-- pour and the swirl, so the aroma section now records both moments rather than
-- one. All new columns are nullable additions to tasting_notes; nothing is
-- rebuilt, so no foreign key is disturbed.
ALTER TABLE tasting_notes ADD COLUMN effervescence INTEGER
  CHECK (effervescence IS NULL OR effervescence BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN bead_size TEXT
  CHECK (bead_size IS NULL OR bead_size IN ('fine', 'medium', 'coarse'));
ALTER TABLE tasting_notes ADD COLUMN nose_swirled_intensity INTEGER
  CHECK (nose_swirled_intensity IS NULL OR nose_swirled_intensity BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN nose_swirled_text TEXT;
