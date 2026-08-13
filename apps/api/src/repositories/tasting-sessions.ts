import type {
  AddSessionWinesRequest,
  CreateTastingSessionRequest,
  DeepTastingNote,
  DeepTastingRequest,
  SessionComparisonResponse,
  TastingSessionDetailResponse,
  TastingSessionResponse,
  UpdateDeepTastingRequest,
  WineSummary,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";

type CommandResult<T> =
  | { kind: "conflict"; current?: T }
  | { kind: "success"; replayed: boolean; response: T }
  | { kind: "unavailable" };

type SessionWineComparison = SessionComparisonResponse["data"]["wines"][number];
type SessionWineDetail = TastingSessionDetailResponse["data"]["wines"][number];

type SessionRow = {
  created_at: string;
  created_by_user_id: string;
  description: string | null;
  ends_at: string | null;
  id: string;
  name: string;
  starts_at: string;
  status: "active" | "completed" | "draft";
  submitted_note_count: number;
  venue_text: string | null;
  version: number;
  wine_count: number;
};

type DeepRow = {
  acidity: number | null;
  alcohol_perception: number | null;
  appearance_clarity: "clear" | "hazy" | null;
  appearance_color_family: "brown" | "orange" | "red" | "rose" | "white" | null;
  appearance_hue: string | null;
  appearance_intensity: number | null;
  appearance_text: string | null;
  author_user_id: string;
  balance: number | null;
  body: number | null;
  complexity: number | null;
  conclusion_text: string | null;
  created_at: string;
  expectation_result: "above" | "below" | "met" | "unknown" | null;
  finish_length: number | null;
  flavor_intensity: number | null;
  id: string;
  memorable: number | null;
  nose_condition: "clean" | "possible_fault" | null;
  nose_development: number | null;
  nose_freshness: number | null;
  nose_intensity: number | null;
  nose_text: string | null;
  pairing_success: number | null;
  palate_text: string | null;
  palate_texture: "creamy" | "lean" | "oily" | "other" | "round" | null;
  perceived_value: number | null;
  rim_evolution: number | null;
  score_100: number | null;
  sentiment: "dislike" | "like" | "neutral" | null;
  session_wine_id: string | null;
  state: "draft" | "submitted";
  sweetness: number | null;
  tannin_level: number | null;
  tannin_texture: "coarse" | "fine" | "grippy" | "silky" | null;
  tasted_at: string;
  tasting_confidence: number | null;
  updated_at: string;
  version: number;
  viscosity: number | null;
  wine_id: string;
  would_buy: "no" | "unsure" | "yes" | null;
  would_drink_again: "no" | "unsure" | "yes" | null;
};

type ContextRow = {
  aeration_minutes: number | null;
  ambient_smell_level: number | null;
  bottle_condition: string | null;
  decanted: number | null;
  environment_code:
    "bar" | "class" | "event" | "home" | "other" | "outdoors" | "restaurant" | "winery" | null;
  food_text: string | null;
  glass_code: string | null;
  light_level: number | null;
  minutes_open: number | null;
  noise_level: number | null;
  opened_state: "just_opened" | "open" | "preserved" | "unknown" | null;
  palate_cleanser: string | null;
  preservation_method: string | null;
  previous_session_wine_id: string | null;
  room_temperature_tenths_c: number | null;
  serving_temperature_tenths_c: number | null;
};

type DescriptorRow = {
  descriptor_code: string;
  intensity: number | null;
  phase: "appearance" | "nose" | "palate";
};

function plusHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1_000).toISOString();
}

async function activeUserId(
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

function sessionResource(row: SessionRow): TastingSessionResponse["data"] {
  return {
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    description: row.description,
    endsAt: row.ends_at,
    id: row.id,
    name: row.name,
    startsAt: row.starts_at,
    status: row.status,
    submittedNoteCount: row.submitted_note_count,
    venueText: row.venue_text,
    version: row.version,
    wineCount: row.wine_count,
  };
}

const sessionSelect = `SELECT session.id, session.name, session.description, session.venue_text,
  session.starts_at, session.ends_at, session.status, session.created_by_user_id,
  session.version, session.created_at,
  (SELECT COUNT(*) FROM session_wines flight
    WHERE flight.session_id = session.id AND flight.deleted_at IS NULL) AS wine_count,
  (SELECT COUNT(*) FROM tasting_notes note
    JOIN session_wines flight ON flight.id = note.session_wine_id
    WHERE flight.session_id = session.id AND note.state = 'submitted'
      AND note.deleted_at IS NULL AND flight.deleted_at IS NULL) AS submitted_note_count
FROM tasting_sessions session`;

async function getSession(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  sessionId: string,
): Promise<TastingSessionResponse | null> {
  const row = await database
    .prepare(
      `${sessionSelect}
      JOIN space_memberships membership ON membership.space_id = session.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE session.id = ? AND session.space_id = ? AND session.deleted_at IS NULL
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'`,
    )
    .bind(sessionId, spaceId, principal.firebaseUid)
    .first<SessionRow>();
  return row === null ? null : { data: sessionResource(row) };
}

export async function createTastingSession(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreateTastingSessionRequest;
    spaceId: string;
  },
): Promise<CommandResult<TastingSessionResponse>> {
  const now = new Date().toISOString();
  const sessionId = options.request.clientId ?? ulid();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/sessions`;
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
        JOIN spaces space ON space.id = membership.space_id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.space_id = ? AND membership.status = 'active'
          AND space.deleted_at IS NULL
        ON CONFLICT(user_id, route_scope, key_hash) DO UPDATE SET
          request_hash = excluded.request_hash, resource_id = excluded.resource_id,
          expires_at = excluded.expires_at, created_at = excluded.created_at
        WHERE idempotency_keys.expires_at <= excluded.created_at`,
      )
      .bind(
        routeScope,
        keyHash,
        requestHash,
        sessionId,
        plusHours(now, 24),
        now,
        options.principal.firebaseUid,
        options.spaceId,
      ),
    database
      .prepare(
        `INSERT INTO tasting_sessions (
          id, space_id, name, description, venue_text, starts_at, ends_at,
          status, blind, created_by_user_id, version, created_at, updated_at, deleted_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, actor.id, 1, ?, ?, NULL
        FROM users actor
        JOIN idempotency_keys command ON command.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND command.route_scope = ? AND command.key_hash = ?
          AND command.request_hash = ? AND command.resource_id = ?
        ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        sessionId,
        options.spaceId,
        options.request.name,
        options.request.description ?? null,
        options.request.venueText ?? null,
        options.request.startsAt,
        options.request.endsAt ?? null,
        options.request.status,
        now,
        now,
        options.principal.firebaseUid,
        routeScope,
        keyHash,
        requestHash,
        sessionId,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'tasting_session', id, 'create', version, ?
          FROM tasting_sessions WHERE id = ? AND space_id = ? AND created_at = ?`,
      )
      .bind(now, sessionId, options.spaceId, now),
  ]);
  const command = await database
    .prepare(
      `SELECT command.request_hash, command.resource_id FROM idempotency_keys command
      JOIN users actor ON actor.id = command.user_id
      JOIN space_memberships membership ON membership.user_id = actor.id
      WHERE actor.firebase_uid = ? AND membership.space_id = ? AND membership.status = 'active'
        AND command.route_scope = ? AND command.key_hash = ? AND command.expires_at > ?`,
    )
    .bind(options.principal.firebaseUid, options.spaceId, routeScope, keyHash, now)
    .first<{ request_hash: string; resource_id: string }>();
  if (command === null) return { kind: "unavailable" };
  if (command.request_hash !== requestHash) return { kind: "conflict" };
  if (results[0]?.meta.changes === 1 && results[1]?.meta.changes !== 1) {
    return { kind: "conflict" };
  }
  const response = await getSession(
    database,
    options.principal,
    options.spaceId,
    command.resource_id,
  );
  return response === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: results[1]?.meta.changes !== 1, response };
}

export async function listTastingSessions(
  database: D1Database,
  options: { principal: FirebasePrincipal; spaceId: string },
): Promise<{ data: TastingSessionResponse["data"][] } | null> {
  if ((await activeUserId(database, options.principal, options.spaceId)) === null) return null;
  const result = await database
    .prepare(
      `${sessionSelect}
      WHERE session.space_id = ? AND session.deleted_at IS NULL
      ORDER BY session.starts_at DESC, session.id DESC LIMIT 100`,
    )
    .bind(options.spaceId)
    .all<SessionRow>();
  return { data: result.results.map(sessionResource) };
}

const wineSelect = `SELECT wine.id, wine.display_name, wine.producer_name, wine.vintage_year,
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
    ORDER BY link.sort_order, link.created_at LIMIT 1) AS media_id
FROM wine_records wine`;

type WineRow = {
  appellation: string | null;
  country_code: string | null;
  created_at: string;
  display_name: string;
  id: string;
  identity_status: WineSummary["identityStatus"];
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

function wineResource(row: WineRow): WineSummary {
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

export async function getTastingSessionDetail(
  database: D1Database,
  options: { principal: FirebasePrincipal; sessionId: string; spaceId: string },
): Promise<TastingSessionDetailResponse | null> {
  const session = await getSession(database, options.principal, options.spaceId, options.sessionId);
  if (session === null) return null;
  const result = await database
    .prepare(
      `SELECT flight.id AS flight_id, flight.position, flight.serving_label,
        flight.version AS flight_version,
        (SELECT note.id FROM tasting_notes note JOIN users author ON author.id = note.author_user_id
          WHERE note.session_wine_id = flight.id AND note.deleted_at IS NULL
            AND author.firebase_uid = ? LIMIT 1) AS own_note_id,
        (SELECT note.state FROM tasting_notes note JOIN users author ON author.id = note.author_user_id
          WHERE note.session_wine_id = flight.id AND note.deleted_at IS NULL
            AND author.firebase_uid = ? LIMIT 1) AS own_note_state,
        (SELECT COUNT(*) FROM tasting_notes note WHERE note.session_wine_id = flight.id
          AND note.state = 'submitted' AND note.deleted_at IS NULL) AS submitted_note_count,
        wine.* FROM session_wines flight
      JOIN (${wineSelect}) wine ON wine.id = flight.wine_id
      WHERE flight.session_id = ? AND flight.space_id = ? AND flight.deleted_at IS NULL
      ORDER BY flight.position, flight.id`,
    )
    .bind(
      options.principal.firebaseUid,
      options.principal.firebaseUid,
      options.sessionId,
      options.spaceId,
    )
    .all<
      WineRow & {
        flight_id: string;
        flight_version: number;
        own_note_id: string | null;
        own_note_state: "draft" | "submitted" | null;
        position: number;
        serving_label: string | null;
        submitted_note_count: number;
      }
    >();
  return {
    data: {
      session: session.data,
      wines: result.results.map((row) => ({
        id: row.flight_id,
        ownNoteId: row.own_note_id,
        ownNoteState: row.own_note_state,
        position: row.position,
        servingLabel: row.serving_label,
        submittedNoteCount: row.submitted_note_count,
        version: row.flight_version,
        wine: wineResource(row),
      })),
    },
  };
}

export async function addSessionWines(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: AddSessionWinesRequest;
    sessionId: string;
    spaceId: string;
  },
): Promise<CommandResult<TastingSessionDetailResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  const session = await getSession(database, options.principal, options.spaceId, options.sessionId);
  if (actorId === null || session === null) return { kind: "unavailable" };
  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/sessions/${options.sessionId}/wines`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await database
    .prepare(
      `SELECT request_hash FROM idempotency_keys
      WHERE user_id = ? AND route_scope = ? AND key_hash = ? AND expires_at > ?`,
    )
    .bind(actorId, routeScope, keyHash, now)
    .first<{ request_hash: string }>();
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const response = await getTastingSessionDetail(database, options);
    return response === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response };
  }
  const base = await database
    .prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM session_wines
      WHERE session_id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(options.sessionId, options.spaceId)
    .first<{ next_position: number }>();
  const requestedWineIds = [
    ...new Set(
      options.request.entries.map(
        (entry: AddSessionWinesRequest["entries"][number]) => entry.wineId,
      ),
    ),
  ];
  const winePlaceholders = requestedWineIds.map(() => "?").join(", ");
  const availableWines = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM wine_records
      WHERE space_id = ? AND deleted_at IS NULL AND id IN (${winePlaceholders})`,
    )
    .bind(options.spaceId, ...requestedWineIds)
    .first<{ count: number }>();
  if (availableWines?.count !== requestedWineIds.length) return { kind: "unavailable" };
  const commands: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 200, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, options.sessionId, plusHours(now, 24), now),
  ];
  options.request.entries.forEach(
    (entry: AddSessionWinesRequest["entries"][number], index: number) => {
      const flightId = entry.clientId ?? ulid();
      commands.push(
        database
          .prepare(
            `INSERT INTO session_wines (
            id, space_id, session_id, wine_id, position, serving_label,
            reveal_state, version, created_at, updated_at, deleted_at
          )
          SELECT ?, ?, ?, wine.id, ?, ?, 'revealed', 1, ?, ?, NULL
          FROM wine_records wine
          WHERE wine.id = ? AND wine.space_id = ? AND wine.deleted_at IS NULL`,
          )
          .bind(
            flightId,
            options.spaceId,
            options.sessionId,
            (base?.next_position ?? 0) + index,
            entry.servingLabel ?? null,
            now,
            now,
            entry.wineId,
            options.spaceId,
          ),
      );
    },
  );
  commands.push(
    database
      .prepare(
        `UPDATE tasting_sessions SET version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, options.sessionId, options.spaceId),
  );
  const results = await database.batch(commands);
  if (
    results.slice(1, 1 + options.request.entries.length).some((result) => result.meta.changes !== 1)
  ) {
    return { kind: "conflict" };
  }
  const response = await getTastingSessionDetail(database, options);
  return response === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response };
}

export async function reorderSessionWines(
  database: D1Database,
  options: {
    orderedSessionWineIds: string[];
    principal: FirebasePrincipal;
    sessionId: string;
    spaceId: string;
  },
): Promise<TastingSessionDetailResponse | null> {
  if ((await activeUserId(database, options.principal, options.spaceId)) === null) return null;
  const current = await database
    .prepare(
      `SELECT id FROM session_wines WHERE session_id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(options.sessionId, options.spaceId)
    .all<{ id: string }>();
  const expected = [...current.results.map((row) => row.id)].sort();
  const received = [...new Set(options.orderedSessionWineIds)].sort();
  if (expected.length === 0 || JSON.stringify(expected) !== JSON.stringify(received)) return null;
  const now = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `UPDATE session_wines SET position = position + 1000000, updated_at = ?
        WHERE session_id = ? AND space_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, options.sessionId, options.spaceId),
    ...options.orderedSessionWineIds.map((id, position) =>
      database
        .prepare(
          `UPDATE session_wines SET position = ?, version = version + 1, updated_at = ?
          WHERE id = ? AND session_id = ? AND space_id = ? AND deleted_at IS NULL`,
        )
        .bind(position, now, id, options.sessionId, options.spaceId),
    ),
    database
      .prepare(
        `UPDATE tasting_sessions SET version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, options.sessionId, options.spaceId),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'tasting_session', id, 'update', version, ?
          FROM tasting_sessions WHERE id = ? AND space_id = ? AND updated_at = ?`,
      )
      .bind(now, options.sessionId, options.spaceId, now),
  ]);
  return getTastingSessionDetail(database, options);
}

function nullableBoolean(value: number | null): boolean | undefined {
  return value === null ? undefined : value === 1;
}

async function getDeepNote(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  noteId: string,
): Promise<DeepTastingNote | null> {
  const row = await database
    .prepare(
      `SELECT note.* FROM tasting_notes note
      JOIN users author ON author.id = note.author_user_id
      JOIN space_memberships membership ON membership.user_id = author.id
        AND membership.space_id = note.space_id
      WHERE note.id = ? AND note.space_id = ? AND note.mode = 'deep'
        AND note.deleted_at IS NULL AND author.firebase_uid = ?
        AND membership.status = 'active'`,
    )
    .bind(noteId, spaceId, principal.firebaseUid)
    .first<DeepRow>();
  if (row === null) return null;
  const [context, descriptors] = await Promise.all([
    database
      .prepare(`SELECT * FROM tasting_contexts WHERE tasting_note_id = ? AND space_id = ?`)
      .bind(noteId, spaceId)
      .first<ContextRow>(),
    database
      .prepare(
        `SELECT phase, descriptor_code, intensity FROM tasting_descriptors
        WHERE tasting_note_id = ? AND space_id = ? ORDER BY phase, descriptor_code`,
      )
      .bind(noteId, spaceId)
      .all<DescriptorRow>(),
  ]);
  return {
    acidity: row.acidity ?? undefined,
    alcoholPerception: row.alcohol_perception ?? undefined,
    appearanceClarity: row.appearance_clarity ?? undefined,
    appearanceColorFamily: row.appearance_color_family ?? undefined,
    appearanceHue: row.appearance_hue ?? undefined,
    appearanceIntensity: row.appearance_intensity ?? undefined,
    appearanceText: row.appearance_text ?? undefined,
    authorUserId: row.author_user_id,
    balance: row.balance ?? undefined,
    body: row.body ?? undefined,
    complexity: row.complexity ?? undefined,
    conclusionText: row.conclusion_text ?? undefined,
    context:
      context === null
        ? null
        : {
            aerationMinutes: context.aeration_minutes ?? undefined,
            ambientSmellLevel: context.ambient_smell_level ?? undefined,
            bottleCondition: context.bottle_condition ?? undefined,
            decanted: nullableBoolean(context.decanted),
            environment: context.environment_code ?? undefined,
            foodText: context.food_text ?? undefined,
            glass:
              (context.glass_code as NonNullable<DeepTastingNote["context"]>["glass"]) ?? undefined,
            lightLevel: context.light_level ?? undefined,
            minutesOpen: context.minutes_open ?? undefined,
            noiseLevel: context.noise_level ?? undefined,
            openedState: context.opened_state ?? undefined,
            palateCleanser: context.palate_cleanser ?? undefined,
            preservationMethod: context.preservation_method ?? undefined,
            previousSessionWineId: context.previous_session_wine_id ?? undefined,
            roomTemperatureTenthsC: context.room_temperature_tenths_c ?? undefined,
            servingTemperatureTenthsC: context.serving_temperature_tenths_c ?? undefined,
          },
    createdAt: row.created_at,
    descriptors: descriptors.results.map((descriptor) => ({
      code: descriptor.descriptor_code,
      intensity: descriptor.intensity ?? undefined,
      phase: descriptor.phase,
    })),
    expectationResult: row.expectation_result ?? undefined,
    finishLength: row.finish_length ?? undefined,
    flavorIntensity: row.flavor_intensity ?? undefined,
    id: row.id,
    memorable: nullableBoolean(row.memorable),
    mode: "deep",
    noseCondition: row.nose_condition ?? undefined,
    noseDevelopment: row.nose_development ?? undefined,
    noseFreshness: row.nose_freshness ?? undefined,
    noseIntensity: row.nose_intensity ?? undefined,
    noseText: row.nose_text ?? undefined,
    ontologyVersion: "2026.1",
    pairingSuccess: row.pairing_success ?? undefined,
    palateText: row.palate_text ?? undefined,
    palateTexture: row.palate_texture ?? undefined,
    perceivedValue: row.perceived_value ?? undefined,
    rimEvolution: row.rim_evolution ?? undefined,
    score100: row.score_100 ?? undefined,
    sentiment: row.sentiment ?? undefined,
    sessionWineId: row.session_wine_id,
    state: row.state,
    sweetness: row.sweetness ?? undefined,
    tanninLevel: row.tannin_level ?? undefined,
    tanninTexture: row.tannin_texture ?? undefined,
    tastedAt: row.tasted_at,
    tastingConfidence: row.tasting_confidence ?? undefined,
    updatedAt: row.updated_at,
    version: row.version,
    viscosity: row.viscosity ?? undefined,
    wineId: row.wine_id,
    wouldBuy: row.would_buy ?? undefined,
    wouldDrinkAgain: row.would_drink_again ?? undefined,
  };
}

export async function getDeepTastingNote(
  database: D1Database,
  options: { noteId: string; principal: FirebasePrincipal; spaceId: string },
): Promise<{ data: DeepTastingNote } | null> {
  const note = await getDeepNote(database, options.principal, options.spaceId, options.noteId);
  return note === null ? null : { data: note };
}

function deepValues(request: DeepTastingRequest | UpdateDeepTastingRequest) {
  return [
    request.score100 ?? null,
    request.sentiment ?? null,
    request.wouldDrinkAgain ?? null,
    request.wouldBuy ?? null,
    request.perceivedValue ?? null,
    request.memorable === undefined ? null : request.memorable ? 1 : 0,
    request.pairingSuccess ?? null,
    request.expectationResult ?? null,
    request.tastingConfidence ?? null,
    request.appearanceText ?? null,
    request.noseText ?? null,
    request.palateText ?? null,
    request.conclusionText ?? null,
    request.appearanceClarity ?? null,
    request.appearanceColorFamily ?? null,
    request.appearanceHue ?? null,
    request.appearanceIntensity ?? null,
    request.rimEvolution ?? null,
    request.viscosity ?? null,
    request.noseCondition ?? null,
    request.noseIntensity ?? null,
    request.noseFreshness ?? null,
    request.noseDevelopment ?? null,
    request.sweetness ?? null,
    request.acidity ?? null,
    request.tanninLevel ?? null,
    request.tanninTexture ?? null,
    request.alcoholPerception ?? null,
    request.body ?? null,
    request.flavorIntensity ?? null,
    request.palateTexture ?? null,
    request.finishLength ?? null,
    request.balance ?? null,
    request.complexity ?? null,
  ] as const;
}

export async function createDeepTastingNote(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: DeepTastingRequest;
    spaceId: string;
  },
): Promise<CommandResult<{ data: DeepTastingNote }>> {
  const now = new Date().toISOString();
  const noteId = options.request.clientId ?? ulid();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/tasting-notes`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const values = deepValues(options.request);
  const commands: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        )
        SELECT actor.id, ?, ?, ?, 201, NULL, ?, ?, ? FROM users actor
        JOIN space_memberships membership ON membership.user_id = actor.id
        JOIN wine_records wine ON wine.space_id = membership.space_id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.space_id = ? AND membership.status = 'active'
          AND wine.id = ? AND wine.deleted_at IS NULL
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM session_wines flight
            WHERE flight.id = ? AND flight.space_id = membership.space_id
              AND flight.wine_id = wine.id AND flight.deleted_at IS NULL))
        ON CONFLICT(user_id, route_scope, key_hash) DO UPDATE SET
          request_hash = excluded.request_hash, resource_id = excluded.resource_id,
          expires_at = excluded.expires_at, created_at = excluded.created_at
        WHERE idempotency_keys.expires_at <= excluded.created_at`,
      )
      .bind(
        routeScope,
        keyHash,
        requestHash,
        noteId,
        plusHours(now, 24),
        now,
        options.principal.firebaseUid,
        options.spaceId,
        options.request.wineId,
        options.request.sessionWineId ?? null,
        options.request.sessionWineId ?? null,
      ),
    database
      .prepare(
        `INSERT INTO tasting_notes (
          id, space_id, wine_id, session_wine_id, author_user_id, mode, state, tasted_at,
          score_100, sentiment, would_drink_again, would_buy, perceived_value, comment,
          version, created_at, updated_at, deleted_at, memorable, pairing_success,
          expectation_result, tasting_confidence, appearance_text, nose_text, palate_text,
          conclusion_text, appearance_clarity, appearance_color_family, appearance_hue,
          appearance_intensity, rim_evolution, viscosity, nose_condition, nose_intensity,
          nose_freshness, nose_development, sweetness, acidity, tannin_level, tannin_texture,
          alcohol_perception, body, flavor_intensity, palate_texture, finish_length, balance, complexity
        )
        SELECT ?, ?, ?, ?, actor.id, 'deep', ?, ?, ?, ?, ?, ?, ?, NULL,
          1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM users actor JOIN idempotency_keys command ON command.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND command.route_scope = ? AND command.key_hash = ?
          AND command.request_hash = ? AND command.resource_id = ?
        ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        noteId,
        options.spaceId,
        options.request.wineId,
        options.request.sessionWineId ?? null,
        options.request.state,
        options.request.tastedAt,
        ...values.slice(0, 5),
        now,
        now,
        ...values.slice(5),
        options.principal.firebaseUid,
        routeScope,
        keyHash,
        requestHash,
        noteId,
      ),
  ];
  const context = options.request.context;
  if (context !== undefined) {
    commands.push(
      database
        .prepare(
          `INSERT INTO tasting_contexts (
            tasting_note_id, space_id, food_text, environment_code, glass_code,
            created_at, updated_at, serving_temperature_tenths_c, opened_state,
            minutes_open, decanted, aeration_minutes, preservation_method, bottle_condition,
            room_temperature_tenths_c, light_level, noise_level, ambient_smell_level,
            palate_cleanser, previous_session_wine_id
          ) SELECT id, space_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM tasting_notes WHERE id = ? AND space_id = ?
          ON CONFLICT(tasting_note_id) DO NOTHING`,
        )
        .bind(
          context.foodText ?? null,
          context.environment ?? null,
          context.glass ?? null,
          now,
          now,
          context.servingTemperatureTenthsC ?? null,
          context.openedState ?? null,
          context.minutesOpen ?? null,
          context.decanted === undefined ? null : context.decanted ? 1 : 0,
          context.aerationMinutes ?? null,
          context.preservationMethod ?? null,
          context.bottleCondition ?? null,
          context.roomTemperatureTenthsC ?? null,
          context.lightLevel ?? null,
          context.noiseLevel ?? null,
          context.ambientSmellLevel ?? null,
          context.palateCleanser ?? null,
          context.previousSessionWineId ?? null,
          noteId,
          options.spaceId,
        ),
    );
  }
  for (const descriptor of options.request.descriptors) {
    commands.push(
      database
        .prepare(
          `INSERT INTO tasting_descriptors (
            id, space_id, tasting_note_id, phase, descriptor_code,
            label_snapshot, intensity, created_at, updated_at
          ) SELECT ?, space_id, id, ?, ?, ?, ?, ?, ? FROM tasting_notes
          WHERE id = ? AND space_id = ?
          ON CONFLICT(tasting_note_id, descriptor_code) DO NOTHING`,
        )
        .bind(
          ulid(),
          descriptor.phase,
          descriptor.code,
          descriptor.code,
          descriptor.intensity ?? null,
          now,
          now,
          noteId,
          options.spaceId,
        ),
    );
  }
  commands.push(
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'tasting_note', id, 'create', version, ? FROM tasting_notes
          WHERE id = ? AND space_id = ? AND created_at = ?`,
      )
      .bind(now, noteId, options.spaceId, now),
  );
  let results: D1Result[];
  try {
    results = await database.batch(commands);
  } catch {
    return { kind: "conflict" };
  }
  const command = await database
    .prepare(
      `SELECT command.request_hash, command.resource_id FROM idempotency_keys command
      JOIN users actor ON actor.id = command.user_id
      WHERE actor.firebase_uid = ? AND command.route_scope = ? AND command.key_hash = ?
        AND command.expires_at > ?`,
    )
    .bind(options.principal.firebaseUid, routeScope, keyHash, now)
    .first<{ request_hash: string; resource_id: string }>();
  if (command === null) return { kind: "unavailable" };
  if (command.request_hash !== requestHash) return { kind: "conflict" };
  if (results[0]?.meta.changes === 1 && results[1]?.meta.changes !== 1) {
    return { kind: "conflict" };
  }
  const note = await getDeepNote(database, options.principal, options.spaceId, command.resource_id);
  return note === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: results[1]?.meta.changes !== 1, response: { data: note } };
}

export async function updateDeepTastingNote(
  database: D1Database,
  options: {
    noteId: string;
    principal: FirebasePrincipal;
    request: UpdateDeepTastingRequest;
    spaceId: string;
  },
): Promise<CommandResult<{ data: DeepTastingNote }>> {
  const current = await getDeepNote(database, options.principal, options.spaceId, options.noteId);
  if (current === null) return { kind: "unavailable" };
  if (current.version !== options.request.version) {
    return { kind: "conflict", current: { data: current } };
  }
  const now = new Date().toISOString();
  const values = deepValues(options.request);
  const commands: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE tasting_notes SET
          score_100 = COALESCE(?, score_100), sentiment = COALESCE(?, sentiment),
          would_drink_again = COALESCE(?, would_drink_again), would_buy = COALESCE(?, would_buy),
          perceived_value = COALESCE(?, perceived_value), memorable = COALESCE(?, memorable),
          pairing_success = COALESCE(?, pairing_success), expectation_result = COALESCE(?, expectation_result),
          tasting_confidence = COALESCE(?, tasting_confidence), appearance_text = COALESCE(?, appearance_text),
          nose_text = COALESCE(?, nose_text), palate_text = COALESCE(?, palate_text),
          conclusion_text = COALESCE(?, conclusion_text), appearance_clarity = COALESCE(?, appearance_clarity),
          appearance_color_family = COALESCE(?, appearance_color_family), appearance_hue = COALESCE(?, appearance_hue),
          appearance_intensity = COALESCE(?, appearance_intensity), rim_evolution = COALESCE(?, rim_evolution),
          viscosity = COALESCE(?, viscosity), nose_condition = COALESCE(?, nose_condition),
          nose_intensity = COALESCE(?, nose_intensity), nose_freshness = COALESCE(?, nose_freshness),
          nose_development = COALESCE(?, nose_development), sweetness = COALESCE(?, sweetness),
          acidity = COALESCE(?, acidity), tannin_level = COALESCE(?, tannin_level),
          tannin_texture = COALESCE(?, tannin_texture), alcohol_perception = COALESCE(?, alcohol_perception),
          body = COALESCE(?, body), flavor_intensity = COALESCE(?, flavor_intensity),
          palate_texture = COALESCE(?, palate_texture), finish_length = COALESCE(?, finish_length),
          balance = COALESCE(?, balance), complexity = COALESCE(?, complexity),
          tasted_at = COALESCE(?, tasted_at), version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND mode = 'deep' AND deleted_at IS NULL
          AND version = ? AND author_user_id = (
            SELECT id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL)`,
      )
      .bind(
        ...values,
        options.request.tastedAt ?? null,
        now,
        options.noteId,
        options.spaceId,
        options.request.version,
        options.principal.firebaseUid,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'tasting_note', id, 'update', version, ? FROM tasting_notes
          WHERE id = ? AND space_id = ? AND updated_at = ?`,
      )
      .bind(now, options.noteId, options.spaceId, now),
  ];
  const context = options.request.context;
  if (context !== undefined) {
    commands.push(
      database
        .prepare(
          `INSERT INTO tasting_contexts (
            tasting_note_id, space_id, food_text, environment_code, glass_code,
            created_at, updated_at, serving_temperature_tenths_c, opened_state,
            minutes_open, decanted, aeration_minutes, preservation_method, bottle_condition,
            room_temperature_tenths_c, light_level, noise_level, ambient_smell_level,
            palate_cleanser, previous_session_wine_id
          ) SELECT id, space_id, ?, ?, ?, created_at, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM tasting_notes WHERE id = ? AND space_id = ? AND updated_at = ?
          ON CONFLICT(tasting_note_id) DO UPDATE SET
            food_text = COALESCE(excluded.food_text, tasting_contexts.food_text),
            environment_code = COALESCE(excluded.environment_code, tasting_contexts.environment_code),
            glass_code = COALESCE(excluded.glass_code, tasting_contexts.glass_code),
            updated_at = excluded.updated_at,
            serving_temperature_tenths_c = COALESCE(excluded.serving_temperature_tenths_c, tasting_contexts.serving_temperature_tenths_c),
            opened_state = COALESCE(excluded.opened_state, tasting_contexts.opened_state),
            minutes_open = COALESCE(excluded.minutes_open, tasting_contexts.minutes_open),
            decanted = COALESCE(excluded.decanted, tasting_contexts.decanted),
            aeration_minutes = COALESCE(excluded.aeration_minutes, tasting_contexts.aeration_minutes),
            preservation_method = COALESCE(excluded.preservation_method, tasting_contexts.preservation_method),
            bottle_condition = COALESCE(excluded.bottle_condition, tasting_contexts.bottle_condition),
            room_temperature_tenths_c = COALESCE(excluded.room_temperature_tenths_c, tasting_contexts.room_temperature_tenths_c),
            light_level = COALESCE(excluded.light_level, tasting_contexts.light_level),
            noise_level = COALESCE(excluded.noise_level, tasting_contexts.noise_level),
            ambient_smell_level = COALESCE(excluded.ambient_smell_level, tasting_contexts.ambient_smell_level),
            palate_cleanser = COALESCE(excluded.palate_cleanser, tasting_contexts.palate_cleanser),
            previous_session_wine_id = COALESCE(excluded.previous_session_wine_id, tasting_contexts.previous_session_wine_id)`,
        )
        .bind(
          context.foodText ?? null,
          context.environment ?? null,
          context.glass ?? null,
          now,
          context.servingTemperatureTenthsC ?? null,
          context.openedState ?? null,
          context.minutesOpen ?? null,
          context.decanted === undefined ? null : context.decanted ? 1 : 0,
          context.aerationMinutes ?? null,
          context.preservationMethod ?? null,
          context.bottleCondition ?? null,
          context.roomTemperatureTenthsC ?? null,
          context.lightLevel ?? null,
          context.noiseLevel ?? null,
          context.ambientSmellLevel ?? null,
          context.palateCleanser ?? null,
          context.previousSessionWineId ?? null,
          options.noteId,
          options.spaceId,
          now,
        ),
    );
  }
  if (options.request.descriptors !== undefined) {
    commands.push(
      database
        .prepare(
          `DELETE FROM tasting_descriptors WHERE tasting_note_id = ? AND space_id = ?
          AND EXISTS (
            SELECT 1 FROM tasting_notes WHERE id = ? AND space_id = ? AND updated_at = ?)`,
        )
        .bind(options.noteId, options.spaceId, options.noteId, options.spaceId, now),
      ...options.request.descriptors.map(
        (descriptor: NonNullable<UpdateDeepTastingRequest["descriptors"]>[number]) =>
          database
            .prepare(
              `INSERT INTO tasting_descriptors (
              id, space_id, tasting_note_id, phase, descriptor_code,
              label_snapshot, intensity, created_at, updated_at
            ) SELECT ?, space_id, id, ?, ?, ?, ?, ?, ? FROM tasting_notes
            WHERE id = ? AND space_id = ? AND updated_at = ?`,
            )
            .bind(
              ulid(),
              descriptor.phase,
              descriptor.code,
              descriptor.code,
              descriptor.intensity ?? null,
              now,
              now,
              options.noteId,
              options.spaceId,
              now,
            ),
      ),
    );
  }
  const results = await database.batch(commands);
  if (results[0]?.meta.changes !== 1) {
    const latest = await getDeepNote(database, options.principal, options.spaceId, options.noteId);
    return latest === null
      ? { kind: "unavailable" }
      : { kind: "conflict", current: { data: latest } };
  }
  const note = await getDeepNote(database, options.principal, options.spaceId, options.noteId);
  return note === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: { data: note } };
}

export async function submitDeepTastingNote(
  database: D1Database,
  options: {
    noteId: string;
    principal: FirebasePrincipal;
    spaceId: string;
    version: number;
  },
): Promise<CommandResult<{ data: DeepTastingNote }>> {
  const current = await getDeepNote(database, options.principal, options.spaceId, options.noteId);
  if (current === null) return { kind: "unavailable" };
  if (current.version !== options.version) return { kind: "conflict", current: { data: current } };
  if (current.state === "submitted") {
    return { kind: "success", replayed: true, response: { data: current } };
  }
  const now = new Date().toISOString();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE tasting_notes SET state = 'submitted', version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND mode = 'deep' AND state = 'draft'
          AND version = ? AND deleted_at IS NULL AND author_user_id = (
            SELECT id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL)`,
      )
      .bind(now, options.noteId, options.spaceId, options.version, options.principal.firebaseUid),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'tasting_note', id, 'update', version, ? FROM tasting_notes
          WHERE id = ? AND space_id = ? AND updated_at = ?`,
      )
      .bind(now, options.noteId, options.spaceId, now),
  ]);
  if (results[0]?.meta.changes !== 1) return { kind: "conflict", current: { data: current } };
  const note = await getDeepNote(database, options.principal, options.spaceId, options.noteId);
  return note === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: { data: note } };
}

type ComparisonRow = {
  author_user_id: string;
  descriptor_codes: string | null;
  display_name: string;
  note_id: string;
  note_version: number;
  score_100: number | null;
  session_wine_id: string;
  wine_id: string;
  would_buy: "no" | "unsure" | "yes" | null;
};

export async function getSessionComparison(
  database: D1Database,
  options: { principal: FirebasePrincipal; sessionId: string; spaceId: string },
): Promise<SessionComparisonResponse | null> {
  const detail = await getTastingSessionDetail(database, options);
  if (detail === null) return null;
  const result = await database
    .prepare(
      `SELECT flight.id AS session_wine_id, flight.wine_id, note.id AS note_id,
        note.version AS note_version, note.author_user_id, actor.display_name,
        note.score_100, note.would_buy,
        (SELECT GROUP_CONCAT(descriptor_code, ',') FROM (
          SELECT descriptor.descriptor_code FROM tasting_descriptors descriptor
          WHERE descriptor.tasting_note_id = note.id ORDER BY descriptor.descriptor_code
        )) AS descriptor_codes
      FROM session_wines flight
      JOIN tasting_notes note ON note.session_wine_id = flight.id
        AND note.state = 'submitted' AND note.deleted_at IS NULL
      JOIN users actor ON actor.id = note.author_user_id AND actor.deleted_at IS NULL
      WHERE flight.session_id = ? AND flight.space_id = ? AND flight.deleted_at IS NULL
      ORDER BY flight.position, flight.id, actor.id`,
    )
    .bind(options.sessionId, options.spaceId)
    .all<ComparisonRow>();
  const rowsByFlight = new Map<string, ComparisonRow[]>();
  for (const row of result.results) {
    rowsByFlight.set(row.session_wine_id, [...(rowsByFlight.get(row.session_wine_id) ?? []), row]);
  }
  const comparisons: SessionComparisonResponse["data"]["wines"] = detail.data.wines.map(
    (flight: SessionWineDetail) => {
      const rows = rowsByFlight.get(flight.id) ?? [];
      const scores = rows.flatMap((row) => (row.score_100 === null ? [] : [row.score_100]));
      const groupScore =
        scores.length >= 2 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
      const dispersion =
        groupScore === null
          ? null
          : Math.sqrt(
              scores.reduce((sum, score) => sum + (score - groupScore) ** 2, 0) / scores.length,
            );
      const descriptorCounts = new Map<string, number>();
      for (const row of rows) {
        for (const code of row.descriptor_codes?.split(",").filter(Boolean) ?? []) {
          descriptorCounts.set(code, (descriptorCounts.get(code) ?? 0) + 1);
        }
      }
      return {
        buyAgainCount: rows.filter((row) => row.would_buy === "yes").length,
        descriptorOverlap: [...descriptorCounts]
          .filter(([, count]) => count >= 2)
          .map(([code]) => code)
          .sort(),
        dispersion,
        groupScore,
        noteCount: rows.length,
        participants: rows.map((row) => ({
          authorUserId: row.author_user_id,
          displayName: row.display_name,
          score100: row.score_100,
          wouldBuy: row.would_buy,
        })),
        rank: null,
        sessionWineId: flight.id,
        wineId: flight.wine.id,
      };
    },
  );
  const ranked = comparisons
    .filter((comparison: SessionWineComparison) => comparison.groupScore !== null)
    .sort(
      (left: SessionWineComparison, right: SessionWineComparison) =>
        (right.groupScore ?? 0) - (left.groupScore ?? 0) ||
        left.sessionWineId.localeCompare(right.sessionWineId),
    );
  ranked.forEach((comparison: SessionWineComparison, index: number) => {
    comparison.rank = index + 1;
  });
  const divisive = comparisons
    .filter((comparison: SessionWineComparison) => comparison.dispersion !== null)
    .sort(
      (left: SessionWineComparison, right: SessionWineComparison) =>
        (right.dispersion ?? 0) - (left.dispersion ?? 0) ||
        left.sessionWineId.localeCompare(right.sessionWineId),
    )[0];
  const response: SessionComparisonResponse = {
    data: {
      algorithmVersion: "2026.1",
      mostDivisiveSessionWineId: divisive?.sessionWineId ?? null,
      sessionId: options.sessionId,
      wines: comparisons,
    },
  };
  const now = new Date().toISOString();
  const summaryStatements = await Promise.all(
    comparisons.map(async (comparison: SessionWineComparison) => {
      const rows = rowsByFlight.get(comparison.sessionWineId) ?? [];
      const source = rows
        .map((row) => `${row.note_id}:${row.note_version}`)
        .sort()
        .join("|");
      const sourceVersionHash = await sha256Base64Url(source);
      return database
        .prepare(
          `INSERT INTO session_wine_summaries (
            id, space_id, session_wine_id, included_note_count, algorithm_version,
            computed_score_milli, dispersion_milli, comparison_json,
            source_version_hash, computed_at
          ) VALUES (?, ?, ?, ?, '2026.1', ?, ?, ?, ?, ?)
          ON CONFLICT(session_wine_id, algorithm_version) DO UPDATE SET
            included_note_count = excluded.included_note_count,
            computed_score_milli = excluded.computed_score_milli,
            dispersion_milli = excluded.dispersion_milli,
            comparison_json = excluded.comparison_json,
            source_version_hash = excluded.source_version_hash,
            computed_at = excluded.computed_at`,
        )
        .bind(
          ulid(),
          options.spaceId,
          comparison.sessionWineId,
          comparison.noteCount,
          comparison.groupScore === null ? null : Math.round(comparison.groupScore * 1_000),
          comparison.dispersion === null ? null : Math.round(comparison.dispersion * 1_000),
          JSON.stringify(comparison),
          sourceVersionHash,
          now,
        );
    }),
  );
  await database.batch(summaryStatements);
  return response;
}
