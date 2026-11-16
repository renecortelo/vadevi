/** The three figures, recomputed from the wine's notes. */
const setFigures = `UPDATE wine_records SET
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
      AND note.deleted_at IS NULL AND note.state = 'submitted'
      AND note.score_100 IS NOT NULL
  )`;

/**
 * A wine's tasting figures, kept on the wine (migration 0053).
 *
 * `wine_records.note_count`, `last_tasted_at` and `score_100` are what the
 * Wine Memory list shows and sorts by. They are derived from `tasting_notes`,
 * and this statement is the only thing that derives them: every batch that
 * writes a note in a way that can change them — creating one, editing its
 * date, score or state, submitting it, moving it to another wine — ends with
 * it. Put it LAST in the batch, so it sees the batch's own writes and does not
 * shift the positions the caller reads results by.
 *
 * It recomputes from the notes rather than adding or subtracting, so running
 * it twice, or for a wine whose figures were already right, changes nothing
 * wrong. It leaves the wine's `version` and `updated_at` alone: a tasting is
 * not an edit of the wine.
 *
 * `wine-aggregates.test.ts` checks the stored figures against the notes after
 * writing notes by every path; a new path that forgets this statement shows
 * up there, as long as the test learns about the path.
 */
export function refreshWineFigures(
  database: D1Database,
  spaceId: string,
  wineIds: readonly string[],
): D1PreparedStatement {
  return database
    .prepare(
      `${setFigures}
      WHERE space_id = ? AND id IN (SELECT value FROM json_each(?))`,
    )
    .bind(spaceId, JSON.stringify(wineIds));
}

/**
 * The same figures for a note known only by id: the wine is the note's own,
 * read inside the statement, so a caller editing a note need not look it up.
 */
export function refreshWineFiguresOfNote(
  database: D1Database,
  spaceId: string,
  noteId: string,
): D1PreparedStatement {
  return database
    .prepare(
      `${setFigures}
      WHERE space_id = ?
        AND id = (SELECT wine_id FROM tasting_notes WHERE id = ? AND space_id = ?)`,
    )
    .bind(spaceId, noteId, spaceId);
}
