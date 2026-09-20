import type { SemanticNotePort } from "@vadevi/domain";

type PendingNote = {
  author_user_id: string;
  comment: string | null;
  id: string;
  space_id: string;
  wine_id: string;
};

/**
 * Embed the tasting notes that have not been embedded yet, a bounded batch at a
 * time, from the scheduled handler.
 *
 * New notes and the backfill of the ones that predate the index take the same
 * path: every row starts with a null `embedded_at`, so this drains them all. A
 * note with no free-text comment is marked done without a call — there is
 * nothing to search on. If an embedding fails — the call throws, or the port
 * reports that nothing was stored — the row is left pending and retried next
 * run, so one bad call never strands the rest or loses a note, and a note the
 * index never received is never recorded as indexed.
 */
export async function indexPendingNoteEmbeddings(
  database: D1Database,
  port: SemanticNotePort,
  nowIso: string,
  limit = 25,
): Promise<{ embedded: number; scanned: number }> {
  const pending = await database
    .prepare(
      `SELECT id, space_id, wine_id, author_user_id, comment FROM tasting_notes
        WHERE embedded_at IS NULL AND deleted_at IS NULL AND state = 'submitted'
        ORDER BY created_at ASC
        LIMIT ?`,
    )
    .bind(limit)
    .all<PendingNote>();

  const markDone = database.prepare(`UPDATE tasting_notes SET embedded_at = ? WHERE id = ?`);
  let embedded = 0;
  for (const note of pending.results) {
    const text = (note.comment ?? "").trim();
    if (text.length === 0) {
      await markDone.bind(nowIso, note.id).run();
      continue;
    }
    try {
      const stored = await port.index({
        authorUserId: note.author_user_id,
        noteId: note.id,
        spaceId: note.space_id,
        text,
        wineId: note.wine_id,
      });
      if (!stored) continue;
      await markDone.bind(nowIso, note.id).run();
      embedded += 1;
    } catch {
      // Left pending on purpose: the next scheduled run retries it.
    }
  }
  return { embedded, scanned: pending.results.length };
}
