PRAGMA foreign_keys = ON;

-- The interface theme follows the account rather than the device, so a member
-- who sets dark on a phone sees dark on a laptop. `system` defers to the
-- operating system, which is the default and the least surprising choice.
ALTER TABLE users ADD COLUMN preferred_theme TEXT NOT NULL DEFAULT 'system'
  CHECK (preferred_theme IN ('system', 'light', 'dark'));
