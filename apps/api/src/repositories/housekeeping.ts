/**
 * What expires, expired.
 *
 * Several tables carry an expiry that every reader honours and nothing ever
 * enforced: the provider cache (a reverse-geocode keyed by a rounded point,
 * a search result), the rate windows, the idempotency keys, a day's usage
 * counters, and a photograph reserved but never uploaded. Each was filtered
 * on read and kept for ever on disk — a location cache "for 30 days" that
 * was, physically, for good. The scheduled handler now removes what has
 * expired, a bounded batch per table per run, so a large backlog drains
 * across runs rather than in one long statement.
 */
const batch = 500;

/** Rate windows are minutes to hours long; two days back is nothing live. */
const rateWindowRetentionSeconds = 2 * 24 * 60 * 60;
/** Usage counters are per day and reported for the month; keep 35 days. */
const usageRetentionDays = 35;

function daysBefore(nowIso: string, days: number): string {
  return new Date(Date.parse(nowIso) - days * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

export async function runHousekeeping(
  database: D1Database,
  bucket: R2Bucket | undefined,
  nowIso: string,
): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  const prune = async (name: string, statement: D1PreparedStatement) => {
    removed[name] = (await statement.run()).meta.changes;
  };

  await prune(
    "external_adapter_cache",
    database
      .prepare(
        `DELETE FROM external_adapter_cache WHERE rowid IN (
          SELECT rowid FROM external_adapter_cache WHERE expires_at <= ? LIMIT ?)`,
      )
      .bind(nowIso, batch),
  );
  await prune(
    "external_rate_windows",
    database
      .prepare(
        `DELETE FROM external_rate_windows WHERE rowid IN (
          SELECT rowid FROM external_rate_windows WHERE updated_at <= ? LIMIT ?)`,
      )
      .bind(new Date(Date.parse(nowIso) - rateWindowRetentionSeconds * 1_000).toISOString(), batch),
  );
  await prune(
    "idempotency_keys",
    database
      .prepare(
        `DELETE FROM idempotency_keys WHERE rowid IN (
          SELECT rowid FROM idempotency_keys WHERE expires_at <= ? LIMIT ?)`,
      )
      .bind(nowIso, batch),
  );
  await prune(
    "usage_counters",
    database
      .prepare(
        `DELETE FROM usage_counters WHERE rowid IN (
          SELECT rowid FROM usage_counters WHERE usage_date < ? LIMIT ?)`,
      )
      .bind(daysBefore(nowIso, usageRetentionDays), batch),
  );

  // A reservation nobody uploaded to, or an upload that was rejected, past
  // its window and referenced by nothing. An object may exist for a rejected
  // one only in theory — the upload writes the object after validation — but
  // the key is checked and removed regardless, so nothing is orphaned.
  const stale = await database
    .prepare(
      `SELECT id, r2_key FROM media_assets media
      WHERE media.processing_status IN ('reserved', 'rejected') AND media.expires_at <= ?
        AND NOT EXISTS (SELECT 1 FROM wine_media link WHERE link.media_id = media.id)
        AND NOT EXISTS (SELECT 1 FROM identification_drafts draft WHERE draft.media_id = media.id)
        AND NOT EXISTS (SELECT 1 FROM purchases purchase WHERE purchase.evidence_media_id = media.id)
        AND NOT EXISTS (SELECT 1 FROM price_observations price WHERE price.evidence_media_id = media.id)
      LIMIT ?`,
    )
    .bind(nowIso, batch)
    .all<{ id: string; r2_key: string }>();
  let reservations = 0;
  for (const row of stale.results) {
    if (bucket !== undefined) await bucket.delete(row.r2_key);
    const result = await database
      .prepare(
        `DELETE FROM media_assets WHERE id = ? AND processing_status IN ('reserved', 'rejected')`,
      )
      .bind(row.id)
      .run();
    reservations += result.meta.changes;
  }
  removed["media_reservations"] = reservations;
  return removed;
}
