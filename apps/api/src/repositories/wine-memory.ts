import type {
  CreateWineRequest,
  CreateWineResponse,
  QuickTastingRequest,
  SyncMutation,
  SyncResponse,
  TastingNoteResponse,
  WineMemoryResponse,
  WineSummary,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";

type IdempotentResult<T> =
  | { kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: T }
  | { kind: "unavailable" };

type WineRow = {
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

function wineSummary(row: WineRow): WineSummary {
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

const wineSelect = `SELECT wine.id, wine.display_name, wine.producer_name, wine.vintage_year,
  wine.non_vintage, wine.wine_type, wine.country_code, wine.region, wine.appellation,
  wine.identity_status, wine.version, wine.created_at, wine.updated_at,
  wine.normalized_name, wine.normalized_producer_name,
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

async function getWineSummary(
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
  return row === null ? null : wineSummary(row);
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
          normalized_producer_name, vintage_year, non_vintage, wine_type,
          country_code, normalized_country_code, region, normalized_region,
          appellation, bottle_size_ml, barcode, style_text,
          identity_status, created_by_user_id, confirmed_by_user_id,
          version, created_at, updated_at, deleted_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, actor.id,
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

export type ListWinesFilters = {
  countryCode?: string;
  cursor?: string;
  grape?: string;
  hasMedia?: "false" | "true";
  identityStatus?: "confirmed" | "draft" | "needs_review";
  limit: number;
  maxScore?: number;
  minScore?: number;
  principal: FirebasePrincipal;
  query?: string;
  region?: string;
  sentiment?: "dislike" | "like" | "neutral";
  sort: "name" | "recent" | "score" | "tasted";
  spaceId: string;
  tastedFrom?: string;
  tastedTo?: string;
  vintageFrom?: number;
  vintageTo?: number;
  wineType?: WineSummary["wineType"];
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
          AND (? IS NULL OR wine.wine_type = ?)
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
    data: rows.map(wineSummary),
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
