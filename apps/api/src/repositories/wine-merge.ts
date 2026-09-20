import type { MergeWinesRequest, MergeWinesResponse, WineSummary } from "@vadevi/contracts";
import { ulid } from "ulid";

import type { FirebasePrincipal } from "../types";
import { grapesFromJson, normalizeWineText } from "./wine-memory";

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

  // Every statement below is conditional on both records still being what
  // the request confirmed: the versions it named, neither one merged or
  // deleted meanwhile. D1 runs a batch in one transaction but a conditional
  // UPDATE that matches no row is not an error, so a version check made only
  // at the end would leave the earlier moves standing when it failed. With
  // the guard on each statement, a stale confirmation moves nothing at all,
  // and the 409 it gets describes a database it did not change.
  const guard = `EXISTS (
        SELECT 1 FROM wine_records source_guard
        WHERE source_guard.id = ? AND source_guard.space_id = ? AND source_guard.version = ?
          AND source_guard.merged_into_wine_id IS NULL AND source_guard.deleted_at IS NULL
      ) AND EXISTS (
        SELECT 1 FROM wine_records target_guard
        WHERE target_guard.id = ? AND target_guard.space_id = ? AND target_guard.version = ?
          AND target_guard.merged_into_wine_id IS NULL AND target_guard.deleted_at IS NULL
      )`;
  const guardBinds = [
    options.request.sourceWineId,
    options.spaceId,
    options.request.sourceVersion,
    options.targetWineId,
    options.spaceId,
    options.request.targetVersion,
  ];
  const move = (statement: string, ...binds: unknown[]) =>
    database.prepare(`${statement} AND ${guard}`).bind(...binds, ...guardBinds);
  const moveWine = (table: string) =>
    move(
      `UPDATE ${table} SET wine_id = ? WHERE wine_id = ? AND space_id = ?`,
      options.targetWineId,
      options.request.sourceWineId,
      options.spaceId,
    );

  const results = await database.batch([
    moveWine("tasting_notes"),
    moveWine("bottles"),
    moveWine("purchases"),
    moveWine("price_observations"),
    // The partial unique index keeps one active wishlist row per wine, so a
    // duplicate active entry becomes a dismissed tombstone instead of failing.
    move(
      `UPDATE wishlist_items SET state = 'dismissed', updated_at = ?
        WHERE wine_id = ? AND space_id = ? AND state = 'active'
          AND EXISTS (
            SELECT 1 FROM wishlist_items keep
            WHERE keep.space_id = wishlist_items.space_id AND keep.wine_id = ?
              AND keep.state = 'active' AND keep.deleted_at IS NULL
          )`,
      now,
      options.request.sourceWineId,
      options.spaceId,
      options.targetWineId,
    ),
    moveWine("wishlist_items"),
    move(
      `UPDATE facts SET subject_id = ? WHERE subject_id = ? AND space_id = ? AND subject_type = 'wine'`,
      options.targetWineId,
      options.request.sourceWineId,
      options.spaceId,
    ),
    moveWine("research_jobs"),
    // Grapes: (wine_id, position) is unique, so the source's rows cannot simply
    // take the target's wine id — two wines that both list a first grape
    // collide at position 0 and fail the whole batch. A grape the target
    // already lists (same code, or same name) is dropped; the rest are appended
    // after the target's last position, in their own order.
    move(
      `DELETE FROM wine_grapes WHERE wine_id = ? AND space_id = ?
        AND EXISTS (
          SELECT 1 FROM wine_grapes kept
          WHERE kept.wine_id = ? AND kept.space_id = wine_grapes.space_id
            AND (
              (kept.grape_code IS NOT NULL AND kept.grape_code = wine_grapes.grape_code)
              OR lower(trim(kept.name_snapshot)) = lower(trim(wine_grapes.name_snapshot))
            )
        )`,
      options.request.sourceWineId,
      options.spaceId,
      options.targetWineId,
    ),
    move(
      `UPDATE wine_grapes SET
        position = position + 1 + (
          SELECT COALESCE(MAX(kept.position), -1) FROM wine_grapes kept
          WHERE kept.wine_id = ? AND kept.space_id = ?
        ),
        wine_id = ?, updated_at = ?
      WHERE wine_id = ? AND space_id = ?`,
      options.targetWineId,
      options.spaceId,
      options.targetWineId,
      now,
      options.request.sourceWineId,
      options.spaceId,
    ),
    moveWine("wine_aliases"),
    // A session that poured the source keeps its flight, now of the survivor;
    // its notes were moved above and still hang off the same flight row.
    moveWine("session_wines"),
    move(
      `UPDATE identification_drafts SET confirmed_wine_id = ?
        WHERE confirmed_wine_id = ? AND space_id = ?`,
      options.targetWineId,
      options.request.sourceWineId,
      options.spaceId,
    ),
    // A record merged into the source earlier now points at the survivor
    // directly, so no reader has to follow a chain of tombstones.
    move(
      `UPDATE wine_records SET merged_into_wine_id = ?
        WHERE merged_into_wine_id = ? AND space_id = ?`,
      options.targetWineId,
      options.request.sourceWineId,
      options.spaceId,
    ),
    move(
      `UPDATE wine_media SET wine_id = ?
        WHERE wine_id = ? AND ? IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM wine_media existing
            WHERE existing.wine_id = ? AND existing.media_id = wine_media.media_id
          )`,
      options.targetWineId,
      options.request.sourceWineId,
      options.spaceId,
      options.targetWineId,
    ),
    move(`DELETE FROM wine_media WHERE wine_id = ?`, options.request.sourceWineId),
    // The losing display name survives as a searchable merge alias.
    database
      .prepare(
        `INSERT INTO wine_aliases (
          id, space_id, wine_id, alias, normalized_alias, kind, created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, 'merge', ?, ? WHERE ${guard}`,
      )
      .bind(
        ulid(),
        options.spaceId,
        options.targetWineId,
        `${source.producer_name} ${source.display_name}`,
        normalizeWineText(`${source.producer_name} ${source.display_name}`),
        now,
        now,
        ...guardBinds,
      ),
    // The tombstone and the target's new version, last: they are what the
    // guards above read, so they must not change until the moves are done.
    database
      .prepare(
        `UPDATE wine_records SET merged_into_wine_id = ?, merged_at = ?, deleted_at = ?,
          version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ? AND merged_into_wine_id IS NULL
          AND ${guard}`,
      )
      .bind(
        options.targetWineId,
        now,
        now,
        now,
        options.request.sourceWineId,
        options.spaceId,
        options.request.sourceVersion,
        ...guardBinds,
      ),
    database
      .prepare(
        `UPDATE wine_records SET version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ?
          AND EXISTS (SELECT 1 FROM wine_records gone WHERE gone.id = ? AND gone.merged_into_wine_id = ?)`,
      )
      .bind(
        now,
        options.targetWineId,
        options.spaceId,
        options.request.targetVersion,
        options.request.sourceWineId,
        options.targetWineId,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'wine_record', id, 'update', version, ?
        FROM wine_records WHERE id = ? AND space_id = ? AND updated_at = ?`,
      )
      .bind(now, options.targetWineId, options.spaceId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) SELECT ?, ?, ?, 'wine.merged', 'wine_record', ?, ?, ?, ?
        FROM wine_records WHERE id = ? AND merged_into_wine_id = ? AND merged_at = ?`,
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
        options.request.sourceWineId,
        options.targetWineId,
        now,
      ),
  ]);

  const at = (index: number) => results[index]?.meta.changes ?? 0;
  const tombstoned = at(17) === 1;
  if (!tombstoned) return { kind: "conflict" };

  const wine = await targetSummary(database, options.principal, options.spaceId, target.id);
  if (wine === null) return { kind: "unavailable" };

  return {
    kind: "success",
    response: {
      data: {
        merged: {
          aliasesAdded: at(16),
          bottles: at(1),
          facts: at(6),
          mediaLinks: at(14),
          priceObservations: at(3),
          purchases: at(2),
          tastingNotes: at(0),
          wishlistItems: at(5),
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
        wine.non_vintage, COALESCE(wine.wine_type_free, wine.wine_type) AS wine_type, wine.country_code, wine.region, wine.appellation,
        wine.alcohol_abv_milli, wine.identity_status, wine.version, wine.created_at,
        (SELECT json_group_array(json_object('name', g.name_snapshot, 'percentage_milli', g.percentage_milli))
          FROM (SELECT name_snapshot, percentage_milli FROM wine_grapes g0
            WHERE g0.wine_id = wine.id AND g0.space_id = wine.space_id ORDER BY g0.position) AS g
        ) AS grapes_json,
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
      alcohol_abv_milli: number | null;
      appellation: string | null;
      country_code: string | null;
      created_at: string;
      display_name: string;
      grapes_json: string | null;
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
    alcoholAbv: row.alcohol_abv_milli === null ? null : row.alcohol_abv_milli / 1_000,
    appellation: row.appellation,
    countryCode: row.country_code,
    createdAt: row.created_at,
    displayName: row.display_name,
    grapes: grapesFromJson(row.grapes_json),
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
