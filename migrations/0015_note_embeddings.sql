-- Track which tasting notes have been embedded into the semantic index.
--
-- A note is embedded once, lazily, by the scheduled handler: new notes and the
-- backfill of existing ones ride the same path. NULL means "not yet"; every row
-- starts NULL, so existing notes are picked up without a data migration. On a
-- failed embedding the row is left NULL and retried on the next run.
ALTER TABLE tasting_notes ADD COLUMN embedded_at TEXT;

-- The scheduled handler scans for the pending ones; a partial index keeps that
-- scan cheap as the table grows and most rows are already embedded.
CREATE INDEX idx_tasting_notes_pending_embedding
  ON tasting_notes (created_at)
  WHERE embedded_at IS NULL AND deleted_at IS NULL;
