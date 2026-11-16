-- A wine carries its own tasting figures (P-01, D-05).
--
-- The Wine Memory list, a session's wines and a merge's answer each worked out,
-- for every wine on the page, how many notes it has, when it was last tasted
-- and its average submitted score — three correlated subqueries per row. And
-- sorting the memory by last tasting or by score sorted the whole Space,
-- because those values existed only once computed: no index could hold them.
--
-- They are now columns on `wine_records`, filled here from the notes and kept
-- by the code that writes notes: every batch that creates, edits, submits or
-- moves a note ends with `refreshWineFigures` (apps/api/src/repositories/
-- wine-figures.ts), which recomputes them from the notes themselves, never
-- +1/−1. Not triggers: D1 counts a trigger's writes in `meta.changes`, which
-- would have turned every "exactly one note written" check into a conflict and
-- inflated the merge's and the deletion job's reported counts. The figures do
-- not touch the wine's `version` or `updated_at`: a tasting is not an edit of
-- the wine, and the "recent" order stays what it was.
--
-- Definitions, unchanged from the subqueries they replace:
--   note_count     notes not deleted, drafts included
--   last_tasted_at latest `tasted_at` among those notes
--   score_100      rounded average of submitted, scored, not deleted notes
--
-- `wine-aggregates.test.ts` writes notes by every path and checks the stored
-- figures against the notes.

ALTER TABLE wine_records ADD COLUMN note_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wine_records ADD COLUMN last_tasted_at TEXT;
ALTER TABLE wine_records ADD COLUMN score_100 INTEGER;

UPDATE wine_records SET
  note_count = (
    SELECT COUNT(*) FROM tasting_notes note
    WHERE note.space_id = wine_records.space_id AND note.wine_id = wine_records.id
      AND note.deleted_at IS NULL
  ),
  last_tasted_at = (
    SELECT MAX(note.tasted_at) FROM tasting_notes note
    WHERE note.space_id = wine_records.space_id AND note.wine_id = wine_records.id
      AND note.deleted_at IS NULL
  ),
  score_100 = (
    SELECT CAST(ROUND(AVG(note.score_100)) AS INTEGER) FROM tasting_notes note
    WHERE note.space_id = wine_records.space_id AND note.wine_id = wine_records.id
      AND note.deleted_at IS NULL AND note.state = 'submitted' AND note.score_100 IS NOT NULL
  );

-- The memory's orders, each in the exact expression the list sorts by, so a
-- page is read in order and stops at the limit instead of sorting the Space.
-- ("recent" already has idx_wine_records_updated.)
CREATE INDEX idx_wine_records_space_tasted
  ON wine_records (space_id, COALESCE(last_tasted_at, ''), id);
CREATE INDEX idx_wine_records_space_score
  ON wine_records (space_id, COALESCE(score_100, -1), id);
CREATE INDEX idx_wine_records_space_name
  ON wine_records (space_id, (normalized_producer_name || ' ' || normalized_name), id);
