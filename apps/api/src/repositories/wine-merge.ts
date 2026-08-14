import type { MergeWinesRequest, MergeWinesResponse, WineSummary } from "@vadevi/contracts";
import { ulid } from "ulid";

import type { FirebasePrincipal } from "../types";
import { normalizeWineText } from "./wine-memory";

type MergeResult =
  | { kind: "conflict" }
  | { kind: "invalid" }
  | { kind: "success"; response: MergeWinesResponse }
  | { kind: "unavailable" };

type WineRow = {
  display_name: string;
  id: string;
  merged_into_wine_id: string | null;
  producer_name: string;
  version: number;
};

/**
 * A deliberate, confirmed merge.
 *
 * Duplicate suggestions never merge on their own: this runs only when a user
 * confirms both records at their current versions. References move to the
 * surviving wine, the losing record keeps a tombstone pointing at the winner so
 * nothing dangles, and the merge is recorded in the audit trail.
 */
export async function mergeWines(
  database: D1Database,
  options: {
    principal: FirebasePrincipal;
    request: MergeWinesRequest;
    requestId: string;
    spaceId: string;
    targetWineId: string;
  },
): Promise<MergeResult> {
  if (options.request.sourceWineId === options.targetWineId) return { kind: "invalid" };
  const now = new Date().toISOString();

  const actor = await database
    .prepare(
      `SELECT actor.id FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .first<{ id: string }>();
  if (actor === null) return { kind: "unavailable" };

  const readWine = (wineId: string) =>
    database
      .prepare(
        `SELECT id, display_name, producer_name, version, merged_into_wine_id
        FROM wine_records WHERE id = ? AND space_id = ?`,
      )
      .bind(wineId, options.spaceId)
      .first<WineRow>();

  const [target, source] = await Promise.all([
    readWine(options.targetWineId),
    readWine(options.request.sourceWineId),
  ]);
  if (target === null || source === null) return { kind: "unavailable" };

  // Repeating the same confirmed merge returns the earlier outcome instead of
  // moving rows a second time.
  if (source.merged_into_wine_id === options.targetWineId) {
    const wine = await targetSummary(database, options.principal, options.spaceId, target.id);
    return wine === null
      ? { kind: "unavailable" }
      : {
          kind: "success",
          response: {
            data: {
              merged: emptyCounts(),
              replayed: true,
              sourceWineId: source.id,
              wine,
            },
          },
        };
  }
  if (source.merged_into_wine_id !== null || target.merged_into_wine_id !== null) {
    return { kind: "conflict" };
  }
  if (
    target.version !== options.request.targetVersion ||
    source.version !== options.request.sourceVersion
  ) {
    return { kind: "conflict" };
  }

  const move = (statement: string) =>
    database
      .prepare(statement)
      .bind(options.targetWineId, options.request.sourceWineId, options.spaceId);

  const results = await database.batch([
    move(`UPDATE tasting_notes SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    move(`UPDATE bottles SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    move(`UPDATE purchases SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    move(`UPDATE price_observations SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    // The partial unique index keeps one active wishlist row per wine, so a
    // duplicate active entry becomes a dismissed tombstone instead of failing.
    database
      .prepare(
        `UPDATE wishlist_items SET state = 'dismissed', updated_at = ?
        WHERE wine_id = ? AND space_id = ? AND state = 'active'
          AND EXISTS (
            SELECT 1 FROM wishlist_items keep
            WHERE keep.space_id = wishlist_items.space_id AND keep.wine_id = ?
              AND keep.state = 'active' AND keep.deleted_at IS NULL
          )`,
      )
      .bind(now, options.request.sourceWineId, options.spaceId, options.targetWineId),
    move(`UPDATE wishlist_items SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    move(
      `UPDATE facts SET subject_id = ? WHERE subject_id = ? AND space_id = ? AND subject_type = 'wine'`,
    ),
    move(`UPDATE research_jobs SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    move(`UPDATE wine_grapes SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    move(`UPDATE wine_aliases SET wine_id = ? WHERE wine_id = ? AND space_id = ?`),
    database
      .prepare(
        `UPDATE wine_media SET wine_id = ?
        WHERE wine_id = ? AND ? IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM wine_media existing
            WHERE existing.wine_id = ? AND existing.media_id = wine_media.media_id
          )`,
      )
      .bind(
        options.targetWineId,
        options.request.sourceWineId,
        options.spaceId,
        options.targetWineId,
      ),
    database.prepare(`DELETE FROM wine_media WHERE wine_id = ?`).bind(options.request.sourceWineId),
    // The losing display name survives as a searchable merge alias.
    database
      .prepare(
        `INSERT INTO wine_aliases (
          id, space_id, wine_id, alias, normalized_alias, kind, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'merge', ?, ?)`,
      )
      .bind(
        ulid(),
        options.spaceId,
        options.targetWineId,
        `${source.producer_name} ${source.display_name}`,
        normalizeWineText(`${source.producer_name} ${source.display_name}`),
        now,
        now,
      ),
    database
      .prepare(
        `UPDATE wine_records SET merged_into_wine_id = ?, merged_at = ?, deleted_at = ?,
          version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ? AND merged_into_wine_id IS NULL`,
      )
      .bind(
        options.targetWineId,
        now,
        now,
        now,
        options.request.sourceWineId,
        options.spaceId,
        options.request.sourceVersion,
      ),
    database
      .prepare(
        `UPDATE wine_records SET version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ?`,
      )
      .bind(now, options.targetWineId, options.spaceId, options.request.targetVersion),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'wine_record', id, 'update', version, ?
        FROM wine_records WHERE id = ? AND space_id = ?`,
      )
      .bind(now, options.targetWineId, options.spaceId),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'wine.merged', 'wine_record', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actor.id,
        options.spaceId,
        options.targetWineId,
        options.requestId,
        JSON.stringify({
          sourceVersion: options.request.sourceVersion,
          sourceWineId: options.request.sourceWineId,
          targetVersion: options.request.targetVersion,
        }),
        now,
      ),
  ]);

  const tombstoned = results[13]?.meta.changes === 1;
  if (!tombstoned) return { kind: "conflict" };

  const wine = await targetSummary(database, options.principal, options.spaceId, target.id);
  if (wine === null) return { kind: "unavailable" };

  return {
    kind: "success",
    response: {
      data: {
        merged: {
          aliasesAdded: results[12]?.meta.changes ?? 0,
          bottles: results[1]?.meta.changes ?? 0,
          facts: results[6]?.meta.changes ?? 0,
          mediaLinks: results[10]?.meta.changes ?? 0,
          priceObservations: results[3]?.meta.changes ?? 0,
          purchases: results[2]?.meta.changes ?? 0,
          tastingNotes: results[0]?.meta.changes ?? 0,
          wishlistItems: results[5]?.meta.changes ?? 0,
        },
        replayed: false,
        sourceWineId: source.id,
        wine,
      },
    },
  };
}

function emptyCounts() {
  return {
    aliasesAdded: 0,
    bottles: 0,
    facts: 0,
    mediaLinks: 0,
    priceObservations: 0,
    purchases: 0,
    tastingNotes: 0,
    wishlistItems: 0,
  };
}

async function targetSummary(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineId: string,
): Promise<WineSummary | null> {
  const row = await database
    .prepare(
      `SELECT wine.id, wine.display_name, wine.producer_name, wine.vintage_year,
        wine.non_vintage, wine.wine_type, wine.country_code, wine.region, wine.appellation,
        wine.identity_status, wine.version, wine.created_at,
        (SELECT MAX(note.tasted_at) FROM tasting_notes note
          WHERE note.space_id = wine.space_id AND note.wine_id = wine.id AND note.deleted_at IS NULL
        ) AS last_tasted_at,
        (SELECT COUNT(*) FROM tasting_notes note
          WHERE note.space_id = wine.space_id AND note.wine_id = wine.id AND note.deleted_at IS NULL
        ) AS note_count,
        (SELECT CAST(ROUND(AVG(note.score_100)) AS INTEGER) FROM tasting_notes note
          WHERE note.space_id = wine.space_id AND note.wine_id = wine.id
            AND note.deleted_at IS NULL AND note.state = 'submitted' AND note.score_100 IS NOT NULL
        ) AS score_100,
        (SELECT link.media_id FROM wine_media link
          JOIN media_assets media ON media.id = link.media_id AND media.space_id = wine.space_id
          WHERE link.wine_id = wine.id AND media.processing_status = 'ready' AND media.deleted_at IS NULL
          ORDER BY link.sort_order, link.created_at LIMIT 1
        ) AS media_id
      FROM wine_records wine
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE wine.id = ? AND wine.space_id = ? AND wine.deleted_at IS NULL
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'`,
    )
    .bind(wineId, spaceId, principal.firebaseUid)
    .first<{
      appellation: string | null;
      country_code: string | null;
      created_at: string;
      display_name: string;
      id: string;
      identity_status: "confirmed" | "draft" | "needs_review";
      last_tasted_at: string | null;
      media_id: string | null;
      non_vintage: number;
      note_count: number;
      producer_name: string;
      region: string | null;
      score_100: number | null;
      version: number;
      vintage_year: number | null;
      wine_type: WineSummary["wineType"];
    }>();
  if (row === null) return null;
  return {
    appellation: row.appellation,
    countryCode: row.country_code,
    createdAt: row.created_at,
    displayName: row.display_name,
    id: row.id,
    identityStatus: row.identity_status,
    lastTastedAt: row.last_tasted_at,
    mediaId: row.media_id,
    nonVintage: row.non_vintage === 1,
    noteCount: row.note_count,
    producerName: row.producer_name,
    region: row.region,
    score100: row.score_100,
    version: row.version,
    vintageYear: row.vintage_year,
    wineType: row.wine_type,
  };
}
