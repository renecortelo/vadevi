-- What a reader says of their own taste, in their own words, beside what
-- their tastings show: what they like, what they do not, what they are
-- exploring, what they usually spend and a note. One row per reader, theirs
-- alone, in every Space; Vicenç reads it as declared, never as deduced, and
-- says so when the two disagree. Exported with the reader's personal Space
-- and removed when the account is.
CREATE TABLE taste_declarations (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  likes_text TEXT CHECK (likes_text IS NULL OR length(likes_text) <= 500),
  dislikes_text TEXT CHECK (dislikes_text IS NULL OR length(dislikes_text) <= 500),
  exploring_text TEXT CHECK (exploring_text IS NULL OR length(exploring_text) <= 500),
  note_text TEXT CHECK (note_text IS NULL OR length(note_text) <= 1000),
  budget_currency TEXT CHECK (
    budget_currency IS NULL OR (length(budget_currency) = 3 AND budget_currency = upper(budget_currency))
  ),
  budget_low_minor INTEGER CHECK (budget_low_minor IS NULL OR budget_low_minor >= 0),
  budget_high_minor INTEGER CHECK (budget_high_minor IS NULL OR budget_high_minor >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    budget_currency IS NOT NULL
    OR (budget_low_minor IS NULL AND budget_high_minor IS NULL)
  )
);
