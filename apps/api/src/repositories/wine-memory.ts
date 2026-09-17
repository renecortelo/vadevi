import type {
  CreateWineRequest,
  CreateWineResponse,
  QuickTastingRequest,
  RegionPoint,
  SyncMutation,
  SyncResponse,
  TastingNoteResponse,
  UpdateWineRequest,
  WineGrape,
  WineMemoryResponse,
  WineSummary,
} from "@vadevi/contracts";
import type { PlaceSearchPort, ResearchLocale } from "@vadevi/domain";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";

type IdempotentResult<T> =
  | { kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: T }
  | { kind: "unavailable" };

type WineRow = {
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
};

type TastingRow = {
  comment: string | null;
  food_text: string | null;
  id: string;
  mode: "quick";
  score_100: number | null;
  sentiment: "dislike" | "like" | "neutral" | null;
  state: "draft" | "submitted";
  tasted_at: string;
  version: number;
  wine_id: string;
  would_buy: "no" | "unsure" | "yes" | null;
  would_drink_again: "no" | "unsure" | "yes" | null;
};

type CommandRow = { request_hash: string; resource_id: string };

export function normalizeWineText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function plusHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1_000).toISOString();
}

export function grapesFromJson(value: string | null): WineSummary["grapes"] {
  if (value === null) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): WineSummary["grapes"] => {
      if (typeof entry !== "object" || entry === null) return [];
      const name = (entry as { name?: unknown }).name;
      const milli = (entry as { percentage_milli?: unknown }).percentage_milli;
      if (typeof name !== "string" || name.length === 0) return [];
      return [{ name, percentage: typeof milli === "number" ? milli / 1_000 : null }];
    });
  } catch {
    return [];
  }
}

function wineSummary(row: WineRow): WineSummary {
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

const wineSelect = `SELECT wine.id, wine.display_name, wine.producer_name, wine.vintage_year,
  wine.non_vintage, COALESCE(wine.wine_type_free, wine.wine_type) AS wine_type, wine.country_code, wine.region, wine.appellation,
  wine.alcohol_abv_milli, wine.identity_status, wine.version, wine.created_at, wine.updated_at,
  wine.normalized_name, wine.normalized_producer_name,
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
FROM wine_records wine`;

/**
 * Where the reader last drank each of these wines.
 *
 * A separate query rather than another subquery in `wineSelect`: that statement
 * is consumed by three call sites whose bind lists are long and positional, and
 * one more `?` inside the SELECT would silently shift every parameter after it.
 * One extra read per page is a fair price for not touching that.
 *
 * Scoped to the reader's OWN submitted notes. A venue is location data about a
 * person, and a wine card is a much more prominent place than the tasting it
 * came from, so a co-member's place stays where it already was.
 */
async function lastVenuesByWine(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineIds: readonly string[],
): Promise<Map<string, WineSummary["lastVenue"]>> {
  const venues = new Map<string, WineSummary["lastVenue"]>();
  if (wineIds.length === 0) return venues;
  const placeholders = wineIds.map(() => "?").join(", ");
  const rows = await database
    .prepare(
      `SELECT note.wine_id, note.tasted_at, ctx.venue_name, ctx.venue_latitude, ctx.venue_longitude
      FROM tasting_notes note
      JOIN tasting_contexts ctx ON ctx.tasting_note_id = note.id
      JOIN users author ON author.id = note.author_user_id AND author.deleted_at IS NULL
      WHERE note.space_id = ? AND note.wine_id IN (${placeholders})
        AND note.state = 'submitted' AND note.deleted_at IS NULL
        AND author.firebase_uid = ?
        AND ctx.venue_name IS NOT NULL AND TRIM(ctx.venue_name) <> ''
      ORDER BY note.tasted_at DESC`,
    )
    .bind(spaceId, ...wineIds, principal.firebaseUid)
    .all<{
      tasted_at: string;
      venue_latitude: number | null;
      venue_longitude: number | null;
      venue_name: string;
      wine_id: string;
    }>();
  for (const row of rows.results) {
    // Ordered newest first, so the first row for a wine is the one to keep.
    if (venues.has(row.wine_id)) continue;
    venues.set(row.wine_id, {
      // A point is only ever meaningful as a pair.
      latitude: row.venue_longitude === null ? null : row.venue_latitude,
      longitude: row.venue_latitude === null ? null : row.venue_longitude,
      name: row.venue_name,
      tastedAt: row.tasted_at,
    });
  }
  return venues;
}

/** The summaries with each wine's own last venue attached. */
async function withLastVenues(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  summaries: WineSummary[],
): Promise<WineSummary[]> {
  const venues = await lastVenuesByWine(
    database,
    principal,
    spaceId,
    summaries.map((summary) => summary.id),
  );
  return summaries.map((summary) => {
    const venue = venues.get(summary.id);
    return venue === undefined ? summary : { ...summary, lastVenue: venue };
  });
}

export async function getWineSummary(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineId: string,
): Promise<WineSummary | null> {
  const row = await database
    .prepare(
      `${wineSelect}
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE wine.id = ? AND wine.space_id = ? AND wine.deleted_at IS NULL
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'`,
    )
    .bind(wineId, spaceId, principal.firebaseUid)
    .first<WineRow>();
  if (row === null) return null;
  const [enriched] = await withLastVenues(database, principal, spaceId, [wineSummary(row)]);
  return enriched ?? null;
}

async function duplicateSuggestions(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineId: string,
): Promise<WineSummary[]> {
  const result = await database
    .prepare(
      `${wineSelect}
      JOIN wine_records created ON created.id = ? AND created.space_id = wine.space_id
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE wine.space_id = ? AND wine.id <> created.id AND wine.deleted_at IS NULL
        AND wine.normalized_producer_name = created.normalized_producer_name
        AND wine.normalized_name = created.normalized_name
        AND COALESCE(wine.vintage_year, -1) = COALESCE(created.vintage_year, -1)
        AND wine.non_vintage = created.non_vintage
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'
      ORDER BY wine.updated_at DESC, wine.id DESC LIMIT 5`,
    )
    .bind(wineId, spaceId, principal.firebaseUid)
    .all<WineRow>();
  return result.results.map(wineSummary);
}

type CreateWineOptions = {
  candidateId?: string;
  idempotencyKey: string;
  principal: FirebasePrincipal;
  request: CreateWineRequest;
  requestId: string;
  routeScope?: string;
  spaceId: string;
};

export async function createWine(
  database: D1Database,
  options: CreateWineOptions,
): Promise<IdempotentResult<CreateWineResponse>> {
  const now = new Date().toISOString();
  const candidateId = options.candidateId ?? options.request.clientId ?? ulid();
  const routeScope = options.routeScope ?? `POST:/api/v1/spaces/${options.spaceId}/wines`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const normalizedProducer = normalizeWineText(options.request.producerName);
  const normalizedName = normalizeWineText(options.request.displayName);
  const expiresAt = plusHours(now, 24);
  const auditId = ulid();

  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        )
        SELECT actor.id, ?, ?, ?, 201, NULL, ?, ?, ?
        FROM users actor
        JOIN space_memberships membership ON membership.user_id = actor.id
        JOIN spaces space ON space.id = membership.space_id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.space_id = ? AND membership.status = 'active'
          AND space.deleted_at IS NULL
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM media_assets media
            WHERE media.id = ? AND media.space_id = space.id
              AND media.owner_user_id = actor.id AND media.processing_status = 'ready'
              AND media.deleted_at IS NULL
          ))
        ON CONFLICT(user_id, route_scope, key_hash) DO UPDATE SET
          request_hash = excluded.request_hash, resource_id = excluded.resource_id,
          expires_at = excluded.expires_at, created_at = excluded.created_at
        WHERE idempotency_keys.expires_at <= excluded.created_at`,
      )
      .bind(
        routeScope,
        keyHash,
        requestHash,
        candidateId,
        expiresAt,
        now,
        options.principal.firebaseUid,
        options.spaceId,
        options.request.mediaId ?? null,
        options.request.mediaId ?? null,
      ),
    database
      .prepare(
        `INSERT INTO wine_records (
          id, space_id, display_name, normalized_name, producer_name,
          normalized_producer_name, vintage_year, non_vintage, wine_type_free,
          country_code, normalized_country_code, region, normalized_region,
          appellation, alcohol_abv_milli, bottle_size_ml, barcode, style_text,
          identity_status, created_by_user_id, confirmed_by_user_id,
          version, created_at, updated_at, deleted_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, actor.id,
          CASE WHEN ? = 'confirmed' THEN actor.id ELSE NULL END, 1, ?, ?, NULL
        FROM users actor
        JOIN idempotency_keys command ON command.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND command.route_scope = ? AND command.key_hash = ?
          AND command.request_hash = ? AND command.resource_id = ?
        ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        candidateId,
        options.spaceId,
        options.request.displayName,
        normalizedName,
        options.request.producerName,
        normalizedProducer,
        options.request.vintageYear ?? null,
        options.request.nonVintage ? 1 : 0,
        options.request.wineType ?? null,
        options.request.countryCode ?? null,
        options.request.countryCode?.toUpperCase() ?? null,
        options.request.region ?? null,
        options.request.region === undefined ? null : normalizeWineText(options.request.region),
        options.request.appellation ?? null,
        options.request.alcoholAbv == null ? null : Math.round(options.request.alcoholAbv * 1_000),
        options.request.bottleSizeMl ?? null,
        options.request.barcode ?? null,
        options.request.styleText ?? null,
        options.request.identityStatus,
        options.request.identityStatus,
        now,
        now,
        options.principal.firebaseUid,
        routeScope,
        keyHash,
        requestHash,
        candidateId,
      ),
    database
      .prepare(
        `INSERT INTO wine_media (wine_id, media_id, role, sort_order, created_at)
        SELECT wine.id, media.id, 'front_label', 0, ?
        FROM wine_records wine
        JOIN media_assets media ON media.id = ? AND media.space_id = wine.space_id
        WHERE wine.id = ? AND wine.space_id = ? AND media.processing_status = 'ready'
        ON CONFLICT(wine_id, media_id) DO NOTHING`,
      )
      .bind(now, options.request.mediaId ?? null, candidateId, options.spaceId),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT space_id, 'wine_record', id, 'create', version, ?
        FROM wine_records WHERE id = ? AND space_id = ? AND created_at = ?`,
      )
      .bind(now, candidateId, options.spaceId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        )
        SELECT ?, wine.created_by_user_id, wine.space_id, 'wine.created',
          'wine_record', wine.id, ?, ?, ?
        FROM wine_records wine
        WHERE wine.id = ? AND wine.space_id = ? AND wine.created_at = ?`,
      )
      .bind(
        auditId,
        options.requestId,
        JSON.stringify({
          identityStatus: options.request.identityStatus,
          mediaAttached: options.request.mediaId !== undefined,
        }),
        now,
        candidateId,
        options.spaceId,
        now,
      ),
  ]);

  // The varietal list belongs to the wine, so it is written only when the wine
  // itself was just created (`created_at = now`). On a replay that guard is
  // false and the rows already exist, so nothing is duplicated.
  const grapes = options.request.grapes ?? [];
  if (grapes.length > 0) {
    await database.batch(
      grapes.map((grape: WineGrape, index: number) =>
        database
          .prepare(
            `INSERT INTO wine_grapes (
              id, space_id, wine_id, grape_code, name_snapshot, normalized_name,
              percentage_milli, position, created_at, updated_at
            )
            SELECT ?, wine.space_id, wine.id, NULL, ?, ?, ?, ?, ?, ?
            FROM wine_records wine
            WHERE wine.id = ? AND wine.space_id = ? AND wine.created_at = ?
            ON CONFLICT(wine_id, position) DO NOTHING`,
          )
          .bind(
            ulid(),
            grape.name,
            normalizeWineText(grape.name),
            grape.percentage == null ? null : Math.round(grape.percentage * 1_000),
            index,
            now,
            now,
            candidateId,
            options.spaceId,
            now,
          ),
      ),
    );
  }

  const command = await database
    .prepare(
      `SELECT command.request_hash, command.resource_id
      FROM idempotency_keys command
      JOIN users actor ON actor.id = command.user_id
      JOIN space_memberships membership ON membership.user_id = actor.id AND membership.space_id = ?
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND command.route_scope = ?
        AND command.key_hash = ? AND command.expires_at > ?`,
    )
    .bind(options.spaceId, options.principal.firebaseUid, routeScope, keyHash, now)
    .first<CommandRow>();
  if (command === null) return { kind: "unavailable" };
  if (command.request_hash !== requestHash) return { kind: "conflict" };
  if (results[0]?.meta.changes === 1 && results[1]?.meta.changes !== 1) {
    return { kind: "conflict" };
  }

  const wine = await getWineSummary(
    database,
    options.principal,
    options.spaceId,
    command.resource_id,
  );
  if (wine === null) return { kind: "unavailable" };
  return {
    kind: "success",
    replayed: results[1]?.meta.changes !== 1,
    response: {
      data: {
        possibleDuplicates: await duplicateSuggestions(
          database,
          options.principal,
          options.spaceId,
          command.resource_id,
        ),
        wine,
      },
    },
  };
}

function encodeCursor(sortValue: string, id: string): string {
  return btoa(`${sortValue}\n${id}`).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string | undefined): { id: string; sortValue: string } | null {
  if (cursor === undefined) return null;
  try {
    const padded = cursor
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(cursor.length / 4) * 4, "=");
    const [sortValue, id, ...rest] = atob(padded).split("\n");
    return sortValue !== undefined && id !== undefined && rest.length === 0
      ? { id, sortValue }
      : null;
  } catch {
    return null;
  }
}

/**
 * Sort keys are `(value, id)` pairs so a page boundary stays stable while other
 * members keep writing. Every key falls back to a sortable constant when its
 * value is missing, which keeps a null-valued row from disappearing between
 * pages.
 */
const sortKeys = {
  name: {
    direction: "ASC",
    expression: "(wine.normalized_producer_name || ' ' || wine.normalized_name)",
  },
  recent: { direction: "DESC", expression: "wine.updated_at" },
  score: { direction: "DESC", expression: "COALESCE(printf('%03d', score_100), '-1')" },
  tasted: { direction: "DESC", expression: "COALESCE(last_tasted_at, '')" },
} as const;

/**
 * The list filters, as the route hands them over.
 *
 * Each optional property spells out `| undefined` because the query object comes
 * from a schema that sets absent filters explicitly, and
 * `exactOptionalPropertyTypes` treats "absent" and "present but undefined" as
 * different types. Spreading the parsed query is the whole point of the route,
 * so this side accepts both.
 */
export type ListWinesFilters = {
  countryCode?: string | undefined;
  cursor?: string | undefined;
  grape?: string | undefined;
  hasMedia?: "false" | "true" | undefined;
  identityStatus?: "confirmed" | "draft" | "needs_review" | undefined;
  limit: number;
  maxScore?: number | undefined;
  minScore?: number | undefined;
  principal: FirebasePrincipal;
  query?: string | undefined;
  region?: string | undefined;
  sentiment?: "dislike" | "like" | "neutral" | undefined;
  sort: "name" | "recent" | "score" | "tasted";
  spaceId: string;
  tastedFrom?: string | undefined;
  tastedTo?: string | undefined;
  vintageFrom?: number | undefined;
  vintageTo?: number | undefined;
  wineType?: WineSummary["wineType"] | undefined;
};

export async function listWines(
  database: D1Database,
  options: ListWinesFilters,
): Promise<WineMemoryResponse | null> {
  const cursor = decodeCursor(options.cursor);
  if (options.cursor !== undefined && cursor === null) return null;
  const membership = await database
    .prepare(
      `SELECT 1 AS allowed FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .first<{ allowed: number }>();
  if (membership === null) return null;

  const query = options.query === undefined ? null : `%${normalizeWineText(options.query)}%`;
  const region = options.region === undefined ? null : `%${normalizeWineText(options.region)}%`;
  const grape = options.grape === undefined ? null : `%${normalizeWineText(options.grape)}%`;
  const sort = sortKeys[options.sort];
  const comparison = sort.direction === "DESC" ? "<" : ">";

  const result = await database
    .prepare(
      `SELECT * FROM (
        ${wineSelect}
        JOIN space_memberships membership ON membership.space_id = wine.space_id
        JOIN users actor ON actor.id = membership.user_id
        WHERE wine.space_id = ? AND wine.deleted_at IS NULL
          AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.status = 'active'
          AND (? IS NULL OR COALESCE(wine.wine_type_free, wine.wine_type) = ?)
          AND (? IS NULL OR wine.identity_status = ?)
          AND (? IS NULL OR wine.normalized_country_code = ?)
          AND (? IS NULL OR wine.normalized_region LIKE ?)
          AND (? IS NULL OR wine.vintage_year >= ?)
          AND (? IS NULL OR wine.vintage_year <= ?)
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM wine_grapes grape
            WHERE grape.wine_id = wine.id AND grape.space_id = wine.space_id
              AND grape.normalized_name LIKE ?
          ))
          AND (? IS NULL OR (? = 'true') = EXISTS (
            SELECT 1 FROM wine_media link
            JOIN media_assets media ON media.id = link.media_id AND media.space_id = wine.space_id
            WHERE link.wine_id = wine.id AND media.processing_status = 'ready'
              AND media.deleted_at IS NULL
          ))
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM tasting_notes note
            WHERE note.wine_id = wine.id AND note.space_id = wine.space_id
              AND note.deleted_at IS NULL AND note.sentiment = ?
          ))
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM tasting_notes note
            WHERE note.wine_id = wine.id AND note.space_id = wine.space_id
              AND note.deleted_at IS NULL AND note.tasted_at >= ?
          ))
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM tasting_notes note
            WHERE note.wine_id = wine.id AND note.space_id = wine.space_id
              AND note.deleted_at IS NULL AND note.tasted_at <= ?
          ))
          AND (? IS NULL OR wine.normalized_name LIKE ? OR wine.normalized_producer_name LIKE ?
            OR (wine.normalized_producer_name || ' ' || wine.normalized_name) LIKE ?
            OR EXISTS (
              SELECT 1 FROM wine_aliases alias
              WHERE alias.wine_id = wine.id AND alias.space_id = wine.space_id
                AND alias.normalized_alias LIKE ?
            ))
      ) AS wine
      WHERE (? IS NULL OR score_100 >= ?)
        AND (? IS NULL OR score_100 <= ?)
        AND (? IS NULL OR ${sort.expression} ${comparison} ?
          OR (${sort.expression} = ? AND wine.id ${comparison} ?))
      ORDER BY ${sort.expression} ${sort.direction}, wine.id ${sort.direction}
      LIMIT ?`,
    )
    .bind(
      options.spaceId,
      options.principal.firebaseUid,
      options.wineType ?? null,
      options.wineType ?? null,
      options.identityStatus ?? null,
      options.identityStatus ?? null,
      options.countryCode?.toUpperCase() ?? null,
      options.countryCode?.toUpperCase() ?? null,
      region,
      region,
      options.vintageFrom ?? null,
      options.vintageFrom ?? null,
      options.vintageTo ?? null,
      options.vintageTo ?? null,
      grape,
      grape,
      options.hasMedia ?? null,
      options.hasMedia ?? null,
      options.sentiment ?? null,
      options.sentiment ?? null,
      options.tastedFrom ?? null,
      options.tastedFrom ?? null,
      options.tastedTo ?? null,
      options.tastedTo ?? null,
      query,
      query,
      query,
      query,
      query,
      options.minScore ?? null,
      options.minScore ?? null,
      options.maxScore ?? null,
      options.maxScore ?? null,
      cursor?.sortValue ?? null,
      cursor?.sortValue ?? null,
      cursor?.sortValue ?? null,
      cursor?.id ?? null,
      options.limit + 1,
    )
    .all<WineRow & { last_tasted_at: string | null; updated_at: string }>();

  if (!result.success) return null;
  const hasMore = result.results.length > options.limit;
  const rows = result.results.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: await withLastVenues(database, options.principal, options.spaceId, rows.map(wineSummary)),
    page: {
      hasMore,
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor(sortValueOf(options.sort, last), last.id)
          : null,
    },
  };
}

function sortValueOf(
  sort: ListWinesFilters["sort"],
  row: WineRow & { last_tasted_at: string | null; updated_at: string },
): string {
  switch (sort) {
    case "name": {
      return `${normalizeWineText(row.producer_name)} ${normalizeWineText(row.display_name)}`;
    }
    case "score": {
      return row.score_100 === null ? "-1" : String(row.score_100).padStart(3, "0");
    }
    case "tasted": {
      return row.last_tasted_at ?? "";
    }
    default: {
      return row.updated_at;
    }
  }
}

export async function createTastingNote(
  database: D1Database,
  options: {
    candidateId?: string;
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: QuickTastingRequest;
    routeScope?: string;
    spaceId: string;
  },
): Promise<IdempotentResult<TastingNoteResponse>> {
  const now = new Date().toISOString();
  const candidateId = options.candidateId ?? options.request.clientId ?? ulid();
  const routeScope = options.routeScope ?? `POST:/api/v1/spaces/${options.spaceId}/tasting-notes`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));

  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        )
        SELECT actor.id, ?, ?, ?, 201, NULL, ?, ?, ?
        FROM users actor
        JOIN space_memberships membership ON membership.user_id = actor.id
        JOIN wine_records wine ON wine.space_id = membership.space_id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.space_id = ? AND membership.status = 'active'
          AND wine.id = ? AND wine.deleted_at IS NULL
        ON CONFLICT(user_id, route_scope, key_hash) DO UPDATE SET
          request_hash = excluded.request_hash, resource_id = excluded.resource_id,
          expires_at = excluded.expires_at, created_at = excluded.created_at
        WHERE idempotency_keys.expires_at <= excluded.created_at`,
      )
      .bind(
        routeScope,
        keyHash,
        requestHash,
        candidateId,
        plusHours(now, 24),
        now,
        options.principal.firebaseUid,
        options.spaceId,
        options.request.wineId,
      ),
    database
      .prepare(
        `INSERT INTO tasting_notes (
          id, space_id, wine_id, session_wine_id, author_user_id, mode, state,
          tasted_at, score_100, sentiment, would_drink_again, would_buy,
          perceived_value, comment, version, created_at, updated_at, deleted_at
        )
        SELECT ?, ?, ?, NULL, actor.id, 'quick', ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, NULL
        FROM users actor
        JOIN idempotency_keys command ON command.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND command.route_scope = ? AND command.key_hash = ?
          AND command.request_hash = ? AND command.resource_id = ?
        ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        candidateId,
        options.spaceId,
        options.request.wineId,
        options.request.state,
        options.request.tastedAt,
        options.request.score100 ?? null,
        options.request.sentiment ?? null,
        options.request.wouldDrinkAgain ?? null,
        options.request.wouldBuy ?? null,
        options.request.comment ?? null,
        now,
        now,
        options.principal.firebaseUid,
        routeScope,
        keyHash,
        requestHash,
        candidateId,
      ),
    database
      .prepare(
        `INSERT INTO tasting_contexts (
          tasting_note_id, space_id, food_text, environment_code, glass_code,
          created_at, updated_at
        )
        SELECT id, space_id, ?, NULL, NULL, ?, ? FROM tasting_notes
        WHERE id = ? AND space_id = ?
        ON CONFLICT(tasting_note_id) DO NOTHING`,
      )
      .bind(options.request.foodText ?? null, now, now, candidateId, options.spaceId),
    ...options.request.descriptorCodes.map((code: string) =>
      database
        .prepare(
          `INSERT INTO tasting_descriptors (
            id, space_id, tasting_note_id, phase, descriptor_code,
            label_snapshot, intensity, created_at, updated_at
          )
          SELECT ?, space_id, id, 'palate', ?, ?, NULL, ?, ?
          FROM tasting_notes WHERE id = ? AND space_id = ?
          ON CONFLICT(tasting_note_id, descriptor_code) DO NOTHING`,
        )
        .bind(ulid(), code, code, now, now, candidateId, options.spaceId),
    ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'tasting_note', id, 'create', version, ?
          FROM tasting_notes WHERE id = ? AND space_id = ? AND created_at = ?`,
      )
      .bind(now, candidateId, options.spaceId, now),
  ]);

  const command = await database
    .prepare(
      `SELECT command.request_hash, command.resource_id
      FROM idempotency_keys command
      JOIN users actor ON actor.id = command.user_id
      JOIN space_memberships membership ON membership.user_id = actor.id AND membership.space_id = ?
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND command.route_scope = ?
        AND command.key_hash = ? AND command.expires_at > ?`,
    )
    .bind(options.spaceId, options.principal.firebaseUid, routeScope, keyHash, now)
    .first<CommandRow>();
  if (command === null) return { kind: "unavailable" };
  if (command.request_hash !== requestHash) return { kind: "conflict" };
  if (results[0]?.meta.changes === 1 && results[1]?.meta.changes !== 1) {
    return { kind: "conflict" };
  }

  const response = await getTastingNoteResponse(
    database,
    options.principal,
    options.spaceId,
    command.resource_id,
  );
  if (response === null) return { kind: "unavailable" };

  return {
    kind: "success",
    replayed: results[1]?.meta.changes !== 1,
    response,
  };
}

async function getTastingNoteResponse(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  noteId: string,
): Promise<TastingNoteResponse | null> {
  const row = await database
    .prepare(
      `SELECT note.id, note.wine_id, note.mode, note.state, note.tasted_at,
        note.score_100, note.sentiment, note.would_drink_again, note.would_buy,
        note.comment, note.version, context.food_text
      FROM tasting_notes note
      JOIN tasting_contexts context ON context.tasting_note_id = note.id AND context.space_id = note.space_id
      JOIN space_memberships membership ON membership.space_id = note.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE note.id = ? AND note.space_id = ? AND note.deleted_at IS NULL
        AND actor.firebase_uid = ? AND membership.status = 'active'`,
    )
    .bind(noteId, spaceId, principal.firebaseUid)
    .first<TastingRow>();
  if (row === null) return null;
  const descriptors = await database
    .prepare(
      `SELECT descriptor.descriptor_code FROM tasting_descriptors descriptor
      JOIN tasting_notes note ON note.id = descriptor.tasting_note_id AND note.space_id = descriptor.space_id
      JOIN space_memberships membership ON membership.space_id = note.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE descriptor.tasting_note_id = ? AND descriptor.space_id = ?
        AND actor.firebase_uid = ? AND membership.status = 'active'
      ORDER BY descriptor.created_at, descriptor.id`,
    )
    .bind(noteId, spaceId, principal.firebaseUid)
    .all<{ descriptor_code: string }>();

  return {
    data: {
      comment: row.comment,
      descriptorCodes: descriptors.results.map((entry) => entry.descriptor_code),
      foodText: row.food_text,
      id: row.id,
      mode: row.mode,
      score100: row.score_100,
      sentiment: row.sentiment,
      state: row.state,
      tastedAt: row.tasted_at,
      version: row.version,
      wineId: row.wine_id,
      wouldBuy: row.would_buy,
      wouldDrinkAgain: row.would_drink_again,
    },
  };
}

export async function syncSpace(
  database: D1Database,
  options: {
    cursor: string | null;
    mutations: SyncMutation[];
    principal: FirebasePrincipal;
    requestId: string;
    spaceId: string;
  },
): Promise<SyncResponse | null> {
  const membership = await database
    .prepare(
      `SELECT 1 AS allowed FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .first<{ allowed: number }>();
  if (membership === null) return null;

  const mutationResults: SyncResponse["data"]["mutationResults"] = [];
  for (const mutation of options.mutations) {
    const idempotencyKey = await sha256Base64Url(mutation.mutationId);
    if (mutation.resourceType === "wine_record") {
      const result = await createWine(database, {
        candidateId: mutation.resourceId,
        idempotencyKey,
        principal: options.principal,
        request: mutation.payload,
        requestId: options.requestId,
        routeScope: `SYNC:${options.spaceId}:wine_record`,
        spaceId: options.spaceId,
      });
      const current =
        result.kind === "conflict"
          ? await getWineSummary(database, options.principal, options.spaceId, mutation.resourceId)
          : null;
      mutationResults.push(
        result.kind === "success"
          ? {
              mutationId: mutation.mutationId,
              resourceId: result.response.data.wine.id,
              status: result.replayed ? "replayed" : "applied",
              version: result.response.data.wine.version,
            }
          : {
              code: result.kind === "conflict" ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
              mutationId: mutation.mutationId,
              resourceId: mutation.resourceId,
              status: result.kind === "conflict" ? "conflict" : "rejected",
              ...(current === null ? {} : { current }),
            },
      );
    } else {
      const result = await createTastingNote(database, {
        candidateId: mutation.resourceId,
        idempotencyKey,
        principal: options.principal,
        request: mutation.payload,
        routeScope: `SYNC:${options.spaceId}:tasting_note`,
        spaceId: options.spaceId,
      });
      const current =
        result.kind === "conflict"
          ? await getTastingNoteResponse(
              database,
              options.principal,
              options.spaceId,
              mutation.resourceId,
            )
          : null;
      mutationResults.push(
        result.kind === "success"
          ? {
              mutationId: mutation.mutationId,
              resourceId: result.response.data.id,
              status: result.replayed ? "replayed" : "applied",
              version: result.response.data.version,
            }
          : {
              code: result.kind === "conflict" ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
              mutationId: mutation.mutationId,
              resourceId: mutation.resourceId,
              status: result.kind === "conflict" ? "conflict" : "rejected",
              ...(current === null ? {} : { current: current.data }),
            },
      );
    }
  }

  const rawCursor = options.cursor === null ? 0 : Number.parseInt(options.cursor, 10);
  if (!Number.isSafeInteger(rawCursor) || rawCursor < 0) return null;
  const changesResult = await database
    .prepare(
      `SELECT event.seq, event.resource_type, event.resource_id, event.operation,
        event.resource_version, event.changed_at
      FROM change_events event
      JOIN space_memberships membership ON membership.space_id = event.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE event.space_id = ? AND event.seq > ?
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'
      ORDER BY event.seq LIMIT 101`,
    )
    .bind(options.spaceId, rawCursor, options.principal.firebaseUid)
    .all<{
      changed_at: string;
      operation: "create" | "delete" | "update";
      resource_id: string;
      resource_type: string;
      resource_version: number;
      seq: number;
    }>();
  const hasMore = changesResult.results.length > 100;
  const changes = changesResult.results.slice(0, 100);
  return {
    data: {
      changes: changes.map((event) => ({
        changedAt: event.changed_at,
        operation: event.operation,
        resourceId: event.resource_id,
        resourceType: event.resource_type,
        version: event.resource_version,
      })),
      hasMore,
      mutationResults,
      nextCursor: String(changes.at(-1)?.seq ?? rawCursor),
    },
  };
}

/** The acting member, or null when they are not in this Space. */
async function activeWineMemberId(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<string | null> {
  const row = await database
    .prepare(
      `SELECT actor.id FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid, spaceId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Correct a wine that already exists.
 *
 * A bottle logged in a restaurant is logged in a hurry — the vintage guessed,
 * the producer half-read, no photograph — and until now the only way to change
 * any of it was to log the bottle again, which leaves two wines where there is
 * one bottle.
 *
 * Every field is optional and `undefined` means "leave it", so a screen that
 * edits one field cannot silently clear the ones it did not show. The version
 * check is the same optimistic lock the bottle and wishlist updates use.
 */
export async function updateWine(
  database: D1Database,
  options: {
    principal: FirebasePrincipal;
    request: UpdateWineRequest;
    requestId: string;
    spaceId: string;
    wineId: string;
  },
): Promise<
  | { current: WineSummary; kind: "conflict" }
  | { kind: "merged" }
  | { kind: "success"; wine: WineSummary }
  | { kind: "unavailable" }
> {
  const actorId = await activeWineMemberId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };

  const row = await database
    .prepare(
      `SELECT version, merged_into_wine_id FROM wine_records
      WHERE id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(options.wineId, options.spaceId)
    .first<{ merged_into_wine_id: string | null; version: number }>();
  if (row === null) return { kind: "unavailable" };
  // A merged wine is a tombstone pointing at its survivor. Editing it would
  // write to a record nothing reads.
  if (row.merged_into_wine_id !== null) return { kind: "merged" };

  if (row.version !== options.request.version) {
    const current = await getWineSummary(
      database,
      options.principal,
      options.spaceId,
      options.wineId,
    );
    if (current === null) return { kind: "unavailable" };
    return { current, kind: "conflict" };
  }

  const now = new Date().toISOString();
  const next = options.request;
  const set = (given: unknown) => (given === undefined ? 0 : 1);
  const auditId = ulid();

  await database.batch([
    database
      .prepare(
        `UPDATE wine_records SET
          display_name = CASE WHEN ? = 1 THEN ? ELSE display_name END,
          normalized_name = CASE WHEN ? = 1 THEN ? ELSE normalized_name END,
          producer_name = CASE WHEN ? = 1 THEN ? ELSE producer_name END,
          normalized_producer_name = CASE WHEN ? = 1 THEN ? ELSE normalized_producer_name END,
          vintage_year = CASE WHEN ? = 1 THEN ? ELSE vintage_year END,
          non_vintage = CASE WHEN ? = 1 THEN ? ELSE non_vintage END,
          wine_type_free = CASE WHEN ? = 1 THEN ? ELSE wine_type_free END,
          country_code = CASE WHEN ? = 1 THEN ? ELSE country_code END,
          normalized_country_code = CASE WHEN ? = 1 THEN ? ELSE normalized_country_code END,
          region = CASE WHEN ? = 1 THEN ? ELSE region END,
          normalized_region = CASE WHEN ? = 1 THEN ? ELSE normalized_region END,
          appellation = CASE WHEN ? = 1 THEN ? ELSE appellation END,
          alcohol_abv_milli = CASE WHEN ? = 1 THEN ? ELSE alcohol_abv_milli END,
          style_text = CASE WHEN ? = 1 THEN ? ELSE style_text END,
          identity_status = CASE WHEN ? = 1 THEN ? ELSE identity_status END,
          confirmed_by_user_id = CASE WHEN ? = 'confirmed' THEN ? ELSE confirmed_by_user_id END,
          version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .bind(
        set(next.displayName),
        next.displayName ?? null,
        set(next.displayName),
        next.displayName === undefined ? null : normalizeWineText(next.displayName),
        set(next.producerName),
        next.producerName ?? null,
        set(next.producerName),
        next.producerName === undefined ? null : normalizeWineText(next.producerName),
        set(next.vintageYear),
        next.vintageYear ?? null,
        set(next.nonVintage),
        next.nonVintage === true ? 1 : 0,
        set(next.wineType),
        next.wineType ?? null,
        set(next.countryCode),
        next.countryCode?.toUpperCase() ?? null,
        set(next.countryCode),
        next.countryCode?.toUpperCase() ?? null,
        set(next.region),
        next.region ?? null,
        set(next.region),
        next.region === undefined || next.region === null ? null : normalizeWineText(next.region),
        set(next.appellation),
        next.appellation ?? null,
        set(next.alcoholAbv),
        next.alcoholAbv == null ? null : Math.round(next.alcoholAbv * 1_000),
        set(next.styleText),
        next.styleText ?? null,
        set(next.identityStatus),
        next.identityStatus ?? null,
        next.identityStatus ?? "",
        actorId,
        now,
        options.wineId,
        options.spaceId,
        options.request.version,
      ),
    // A photograph attaches or detaches here, which is how a hurried entry gets
    // its label later without being logged a second time.
    database
      .prepare(`DELETE FROM wine_media WHERE wine_id = ? AND ? = 1`)
      .bind(options.wineId, set(next.mediaId)),
    database
      .prepare(
        `INSERT INTO wine_media (wine_id, media_id, role, sort_order, created_at)
        SELECT wine.id, media.id, 'front_label', 0, ?
        FROM wine_records wine
        JOIN media_assets media ON media.id = ? AND media.space_id = wine.space_id
        WHERE wine.id = ? AND wine.space_id = ? AND media.processing_status = 'ready'
        ON CONFLICT(wine_id, media_id) DO NOTHING`,
      )
      .bind(now, next.mediaId ?? null, options.wineId, options.spaceId),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT space_id, 'wine_record', id, 'update', version, ?
        FROM wine_records WHERE id = ? AND space_id = ?`,
      )
      .bind(now, options.wineId, options.spaceId),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'wine.updated', 'wine_record', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actorId,
        options.spaceId,
        options.wineId,
        options.requestId,
        // Field names only. What a wine is called is the member's own text and
        // has no place in an audit row.
        JSON.stringify({ fields: Object.keys(next).filter((key) => key !== "version") }),
        now,
      ),
  ]);

  // A given varietal list replaces the old one wholesale — the delete and the
  // inserts share one batch, so the wine is never briefly left without grapes.
  // Omitting `grapes` leaves the existing list untouched.
  if (next.grapes !== undefined) {
    await database.batch([
      database
        .prepare(`DELETE FROM wine_grapes WHERE wine_id = ? AND space_id = ?`)
        .bind(options.wineId, options.spaceId),
      ...next.grapes.map((grape: WineGrape, index: number) =>
        database
          .prepare(
            `INSERT INTO wine_grapes (
              id, space_id, wine_id, grape_code, name_snapshot, normalized_name,
              percentage_milli, position, created_at, updated_at
            )
            SELECT ?, wine.space_id, wine.id, NULL, ?, ?, ?, ?, ?, ?
            FROM wine_records wine
            WHERE wine.id = ? AND wine.space_id = ?
            ON CONFLICT(wine_id, position) DO NOTHING`,
          )
          .bind(
            ulid(),
            grape.name,
            normalizeWineText(grape.name),
            grape.percentage == null ? null : Math.round(grape.percentage * 1_000),
            index,
            now,
            now,
            options.wineId,
            options.spaceId,
          ),
      ),
    ]);
  }

  const wine = await getWineSummary(database, options.principal, options.spaceId, options.wineId);
  if (wine === null) return { kind: "unavailable" };
  return { kind: "success", wine };
}

/**
 * The reader's wines, placed by region on the map.
 *
 * Regions are geocoded once and shared: a region's location is public and the
 * same for everyone, so it is cached by normalized name in `region_points`,
 * never per wine. The wine ids returned with each point are the caller's own,
 * so the point is public knowledge and the list behind it is not.
 *
 * Geocoding is bounded per call and permanent: a first open resolves a handful
 * of new regions and remembers them (a found point, or a null one so a region
 * with no match is not asked again), and later opens are instant and fill in
 * whatever the first did not reach. With no place provider configured, nothing
 * is geocoded — only regions already cached appear.
 */
export async function regionPoints(
  database: D1Database,
  place: PlaceSearchPort | null,
  options: { locale: ResearchLocale; principal: FirebasePrincipal; spaceId: string },
): Promise<RegionPoint[] | null> {
  // Active membership gates the whole thing, like every other read.
  const rows = await database
    .prepare(
      `SELECT wine.id, wine.display_name, wine.producer_name,
        wine.region, wine.normalized_region
      FROM wine_records wine
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'
        AND wine.space_id = ? AND wine.deleted_at IS NULL
        AND wine.region IS NOT NULL AND TRIM(wine.region) <> ''
        AND wine.normalized_region IS NOT NULL AND TRIM(wine.normalized_region) <> ''`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .all<{
      display_name: string;
      id: string;
      normalized_region: string;
      producer_name: string;
      region: string;
    }>();
  // A caller with no membership sees nothing; a member with no regioned wines
  // sees an empty map, which is different and correct.
  const memberCheck = await database
    .prepare(
      `SELECT 1 FROM space_memberships membership
      JOIN users actor ON actor.id = membership.user_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND membership.space_id = ?`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .first<{ 1: number }>();
  if (memberCheck === null) return null;

  // Group the caller's wines by their normalized region.
  const byRegion = new Map<string, { display: string; wines: { id: string; name: string }[] }>();
  for (const row of rows.results) {
    const entry = byRegion.get(row.normalized_region) ?? { display: row.region, wines: [] };
    entry.wines.push({ id: row.id, name: `${row.producer_name} · ${row.display_name}` });
    byRegion.set(row.normalized_region, entry);
  }
  if (byRegion.size === 0) return [];

  // What is already known, in one read.
  const keys = [...byRegion.keys()];
  const cached = await database
    .prepare(
      `SELECT normalized_region, latitude, longitude FROM region_points
      WHERE normalized_region IN (${keys.map(() => "?").join(", ")})`,
    )
    .bind(...keys)
    .all<{ latitude: number | null; longitude: number | null; normalized_region: string }>();
  const known = new Map(cached.results.map((row) => [row.normalized_region, row]));

  // Geocode the misses, but only a few per call and only if a provider is on,
  // so a large new cellar does not hammer a donated geocoder on one open.
  const misses = keys.filter((key) => !known.has(key));
  const now = new Date().toISOString();
  if (place !== null) {
    for (const key of misses.slice(0, 8)) {
      const display = byRegion.get(key)!.display;
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const result = await place.search({ locale: options.locale, query: display });
        if (result.status === "success" && result.data[0] !== undefined) {
          latitude = result.data[0].latitude;
          longitude = result.data[0].longitude;
        }
      } catch {
        // Leave it unresolved; a later open will try again since we do not cache
        // a failure, only a definite "no match".
        continue;
      }
      await database
        .prepare(
          `INSERT INTO region_points (normalized_region, display_region, latitude, longitude, geocoded_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(normalized_region) DO UPDATE SET
            latitude = excluded.latitude, longitude = excluded.longitude,
            geocoded_at = excluded.geocoded_at`,
        )
        .bind(key, display, latitude, longitude, now)
        .run();
      known.set(key, { latitude, longitude, normalized_region: key });
    }
  }

  const points: RegionPoint[] = [];
  for (const [key, entry] of byRegion) {
    const point = known.get(key);
    if (point === undefined || point.latitude === null || point.longitude === null) continue;
    points.push({
      latitude: point.latitude,
      longitude: point.longitude,
      region: entry.display,
      wines: entry.wines.slice(0, 500),
    });
  }
  return points;
}
