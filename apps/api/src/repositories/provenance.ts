import type {
  CreateSourceRequest,
  CreateWineFactRequest,
  Fact,
  FactResponse,
  Source,
  SourceResponse,
  WineFactsResponse,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";

type CommandResult<T> =
  | { kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: T }
  | { kind: "unavailable" };

type VersionedResult<T> =
  | { current: T | null; kind: "conflict" }
  | { kind: "success"; response: T }
  | { kind: "unavailable" };

type SourceRow = {
  canonical_url: string;
  content_hash: string | null;
  created_at: string;
  created_by_provider: string | null;
  created_by_user_id: string | null;
  id: string;
  last_checked_at: string | null;
  license_identifier: string | null;
  publisher: string;
  retrieved_at: string;
  source_type: Source["sourceType"];
  title: string;
  updated_at: string;
};

type FactRow = {
  confidence_milli: number | null;
  created_at: string;
  evidence_class: Fact["evidenceClass"];
  id: string;
  observed_by_user_id: string | null;
  predicate: Fact["predicate"];
  research_method: string | null;
  status: Fact["status"];
  subject_id: string;
  subject_type: Fact["subjectType"];
  updated_at: string;
  value_json: string;
  verified_at: string | null;
  verified_by_user_id: string | null;
  version: number;
};

type CitationRow = SourceRow & {
  fact_id: string;
  locator: string | null;
  support_strength: Fact["citations"][number]["supportStrength"];
};

function plusHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1_000).toISOString();
}

function canonicalSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function sourceResource(row: SourceRow): Source {
  return {
    canonicalUrl: row.canonical_url,
    contentHash: row.content_hash ?? undefined,
    createdAt: row.created_at,
    createdByProvider: row.created_by_provider,
    createdByUserId: row.created_by_user_id,
    id: row.id,
    lastCheckedAt: row.last_checked_at ?? undefined,
    licenseIdentifier: row.license_identifier ?? undefined,
    publisher: row.publisher,
    retrievedAt: row.retrieved_at,
    sourceType: row.source_type,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function factResource(row: FactRow, citations: Fact["citations"]): Fact {
  return {
    citations,
    confidenceMilli: row.confidence_milli,
    createdAt: row.created_at,
    evidenceClass: row.evidence_class,
    id: row.id,
    observedByUserId: row.observed_by_user_id,
    predicate: row.predicate,
    researchMethod: row.research_method,
    status: row.status,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    updatedAt: row.updated_at,
    value: JSON.parse(row.value_json) as Fact["value"],
    verifiedAt: row.verified_at,
    verifiedByUserId: row.verified_by_user_id,
    version: row.version,
  };
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

async function authorizedWineExists(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT wine.id FROM wine_records wine
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE wine.id = ? AND wine.space_id = ? AND wine.deleted_at IS NULL
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'`,
    )
    .bind(wineId, spaceId, principal.firebaseUid)
    .first<{ id: string }>();
  return row !== null;
}

async function activeCommand(
  database: D1Database,
  actorId: string,
  routeScope: string,
  keyHash: string,
  now: string,
) {
  return database
    .prepare(
      `SELECT request_hash, resource_id FROM idempotency_keys
      WHERE user_id = ? AND route_scope = ? AND key_hash = ? AND expires_at > ?`,
    )
    .bind(actorId, routeScope, keyHash, now)
    .first<{ request_hash: string; resource_id: string }>();
}

async function sourceById(database: D1Database, spaceId: string, sourceId: string) {
  return database
    .prepare(
      `SELECT id, canonical_url, title, publisher, source_type, license_identifier,
        retrieved_at, last_checked_at, content_hash, created_by_user_id,
        created_by_provider, created_at, updated_at
      FROM sources WHERE id = ? AND space_id = ?`,
    )
    .bind(sourceId, spaceId)
    .first<SourceRow>();
}

export async function getSource(
  database: D1Database,
  options: { principal: FirebasePrincipal; sourceId: string; spaceId: string },
): Promise<SourceResponse | null> {
  if ((await activeUserId(database, options.principal, options.spaceId)) === null) return null;
  const row = await sourceById(database, options.spaceId, options.sourceId);
  return row === null ? null : { data: sourceResource(row) };
}

export async function createSource(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreateSourceRequest;
    requestId: string;
    spaceId: string;
  },
): Promise<CommandResult<SourceResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/sources`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await activeCommand(database, actorId, routeScope, keyHash, now);
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const response = await getSource(database, {
      principal: options.principal,
      sourceId: previous.resource_id,
      spaceId: options.spaceId,
    });
    return response === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response };
  }

  const canonicalUrl = canonicalSourceUrl(options.request.canonicalUrl);
  const existing = await database
    .prepare(`SELECT id FROM sources WHERE space_id = ? AND canonical_url = ?`)
    .bind(options.spaceId, canonicalUrl)
    .first<{ id: string }>();
  const sourceId = existing?.id ?? options.request.clientId ?? ulid();
  const commands: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, sourceId, plusHours(now, 24), now),
  ];
  if (existing === null) {
    commands.push(
      database
        .prepare(
          `INSERT INTO sources (
            id, space_id, canonical_url, title, publisher, source_type,
            license_identifier, retrieved_at, last_checked_at, content_hash,
            created_by_user_id, created_by_provider, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          sourceId,
          options.spaceId,
          canonicalUrl,
          options.request.title,
          options.request.publisher,
          options.request.sourceType,
          options.request.licenseIdentifier ?? null,
          options.request.retrievedAt,
          options.request.lastCheckedAt ?? null,
          options.request.contentHash ?? null,
          actorId,
          now,
          now,
        ),
      database
        .prepare(
          `INSERT INTO change_events (
            space_id, resource_type, resource_id, operation, resource_version, changed_at
          ) VALUES (?, 'source', ?, 'create', 1, ?)`,
        )
        .bind(options.spaceId, sourceId, now),
      database
        .prepare(
          `INSERT INTO audit_events (
            id, actor_user_id, space_id, action, target_type, target_id,
            request_id, safe_metadata_json, created_at
          ) VALUES (?, ?, ?, 'source.created', 'source', ?, ?, NULL, ?)`,
        )
        .bind(ulid(), actorId, options.spaceId, sourceId, options.requestId, now),
    );
  }
  const results = await database.batch(commands);
  if (existing === null && results[1]?.meta.changes !== 1) return { kind: "conflict" };
  const response = await getSource(database, {
    principal: options.principal,
    sourceId,
    spaceId: options.spaceId,
  });
  return response === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response };
}

async function citationsByFactIds(
  database: D1Database,
  spaceId: string,
  factIds: string[],
): Promise<Map<string, Fact["citations"]>> {
  const byFact = new Map<string, Fact["citations"]>();
  if (factIds.length === 0) return byFact;
  const placeholders = factIds.map(() => "?").join(", ");
  const rows = await database
    .prepare(
      `SELECT citation.fact_id, citation.locator, citation.support_strength,
        source.id, source.canonical_url, source.title, source.publisher, source.source_type,
        source.license_identifier, source.retrieved_at, source.last_checked_at,
        source.content_hash, source.created_by_user_id, source.created_by_provider,
        source.created_at, source.updated_at
      FROM fact_citations citation
      JOIN sources source ON source.id = citation.source_id AND source.space_id = ?
      WHERE citation.fact_id IN (${placeholders})
      ORDER BY citation.fact_id, source.publisher, source.title, source.id`,
    )
    .bind(spaceId, ...factIds)
    .all<CitationRow>();
  for (const row of rows.results) {
    const items = byFact.get(row.fact_id) ?? [];
    items.push({
      locator: row.locator,
      source: sourceResource(row),
      supportStrength: row.support_strength,
    });
    byFact.set(row.fact_id, items);
  }
  return byFact;
}

async function factById(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  factId: string,
): Promise<FactResponse | null> {
  const row = await database
    .prepare(
      `SELECT fact.id, fact.subject_type, fact.subject_id, fact.predicate, fact.value_json,
        fact.evidence_class, fact.confidence_milli, fact.status, fact.observed_by_user_id,
        fact.verified_by_user_id, fact.verified_at, fact.research_method, fact.version,
        fact.created_at, fact.updated_at
      FROM facts fact
      JOIN space_memberships membership ON membership.space_id = fact.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE fact.id = ? AND fact.space_id = ? AND fact.deleted_at IS NULL
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'`,
    )
    .bind(factId, spaceId, principal.firebaseUid)
    .first<FactRow>();
  if (row === null) return null;
  const citations = await citationsByFactIds(database, spaceId, [row.id]);
  return { data: factResource(row, citations.get(row.id) ?? []) };
}

export async function listWineFacts(
  database: D1Database,
  options: { principal: FirebasePrincipal; spaceId: string; wineId: string },
): Promise<WineFactsResponse | null> {
  if (!(await authorizedWineExists(database, options.principal, options.spaceId, options.wineId))) {
    return null;
  }
  const rows = await database
    .prepare(
      `SELECT id, subject_type, subject_id, predicate, value_json, evidence_class,
        confidence_milli, status, observed_by_user_id, verified_by_user_id, verified_at,
        research_method, version, created_at, updated_at
      FROM facts
      WHERE space_id = ? AND subject_type = 'wine' AND subject_id = ? AND deleted_at IS NULL
      ORDER BY predicate,
        CASE status WHEN 'accepted' THEN 0 WHEN 'proposed' THEN 1 WHEN 'disputed' THEN 2 ELSE 3 END,
        created_at, id`,
    )
    .bind(options.spaceId, options.wineId)
    .all<FactRow>();
  const citations = await citationsByFactIds(
    database,
    options.spaceId,
    rows.results.map((row) => row.id),
  );
  const facts = rows.results.map((row) => factResource(row, citations.get(row.id) ?? []));
  const byPredicate = new Map<Fact["predicate"], Fact[]>();
  for (const fact of facts.filter((candidate) => candidate.status !== "retired")) {
    const items = byPredicate.get(fact.predicate) ?? [];
    items.push(fact);
    byPredicate.set(fact.predicate, items);
  }
  const conflicts: WineFactsResponse["data"]["conflicts"] = [];
  for (const [predicate, candidates] of byPredicate) {
    if (new Set(candidates.map((candidate) => JSON.stringify(candidate.value))).size < 2) continue;
    conflicts.push({
      acceptedFactId: candidates.find((candidate) => candidate.status === "accepted")?.id ?? null,
      factIds: candidates.map((candidate) => candidate.id),
      predicate,
    });
  }
  return { data: { conflicts, facts } };
}

export async function createWineFact(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreateWineFactRequest;
    requestId: string;
    spaceId: string;
    wineId: string;
  },
): Promise<CommandResult<FactResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (
    actorId === null ||
    !(await authorizedWineExists(database, options.principal, options.spaceId, options.wineId))
  ) {
    return { kind: "unavailable" };
  }
  const sourceIds = options.request.citations.map(
    (citation: CreateWineFactRequest["citations"][number]) => citation.sourceId,
  );
  if (sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => "?").join(", ");
    const sources = await database
      .prepare(
        `SELECT COUNT(*) AS count FROM sources
        WHERE space_id = ? AND id IN (${placeholders})`,
      )
      .bind(options.spaceId, ...sourceIds)
      .first<{ count: number }>();
    if (sources?.count !== sourceIds.length) return { kind: "unavailable" };
  }

  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/wines/${options.wineId}/facts`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await activeCommand(database, actorId, routeScope, keyHash, now);
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const response = await factById(
      database,
      options.principal,
      options.spaceId,
      previous.resource_id,
    );
    return response === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response };
  }

  const factId = options.request.clientId ?? ulid();
  const commands: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, factId, plusHours(now, 24), now),
    database
      .prepare(
        `INSERT INTO facts (
          id, space_id, subject_type, subject_id, predicate, value_json,
          evidence_class, confidence_milli, status, observed_by_user_id,
          verified_by_user_id, verified_at, research_method, version,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, 'wine', ?, ?, ?, ?, ?, 'proposed', ?, NULL, NULL, ?, 1, ?, ?, NULL)`,
      )
      .bind(
        factId,
        options.spaceId,
        options.wineId,
        options.request.predicate,
        JSON.stringify(options.request.value),
        options.request.evidenceClass,
        options.request.confidenceMilli ?? null,
        options.request.evidenceClass === "observed" || options.request.evidenceClass === "personal"
          ? actorId
          : null,
        options.request.evidenceClass === "researched" ? "manual_citation" : null,
        now,
        now,
      ),
  ];
  for (const citation of options.request.citations) {
    commands.push(
      database
        .prepare(
          `INSERT INTO fact_citations (
            fact_id, source_id, locator, support_strength, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(factId, citation.sourceId, citation.locator ?? null, citation.supportStrength, now),
    );
  }
  commands.push(
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) VALUES (?, 'fact', ?, 'create', 1, ?)`,
      )
      .bind(options.spaceId, factId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'fact.created', 'fact', ?, ?, NULL, ?)`,
      )
      .bind(ulid(), actorId, options.spaceId, factId, options.requestId, now),
  );
  const results = await database.batch(commands);
  if (results[1]?.meta.changes !== 1) return { kind: "conflict" };
  const response = await factById(database, options.principal, options.spaceId, factId);
  return response === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response };
}

export async function acceptFact(
  database: D1Database,
  options: {
    factId: string;
    principal: FirebasePrincipal;
    requestId: string;
    spaceId: string;
    version: number;
  },
): Promise<VersionedResult<FactResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  const current = await factById(database, options.principal, options.spaceId, options.factId);
  if (current === null || current.data.status === "retired") return { kind: "unavailable" };
  if (current.data.version !== options.version) return { current, kind: "conflict" };
  const now = new Date().toISOString();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE facts SET status = 'disputed', version = version + 1, updated_at = ?
        WHERE space_id = ? AND subject_type = ? AND subject_id = ? AND predicate = ?
          AND status = 'accepted' AND id <> ? AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM facts chosen WHERE chosen.id = ? AND chosen.space_id = ?
              AND chosen.version = ? AND chosen.deleted_at IS NULL
          )`,
      )
      .bind(
        now,
        options.spaceId,
        current.data.subjectType,
        current.data.subjectId,
        current.data.predicate,
        options.factId,
        options.factId,
        options.spaceId,
        options.version,
      ),
    database
      .prepare(
        `UPDATE facts SET status = 'accepted', verified_by_user_id = ?, verified_at = ?,
          version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL
          AND status <> 'retired'`,
      )
      .bind(actorId, now, now, options.factId, options.spaceId, options.version),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'fact', id, 'update', version, ?
          FROM facts WHERE id = ? AND space_id = ? AND updated_at = ?`,
      )
      .bind(now, options.factId, options.spaceId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) SELECT ?, ?, ?, 'fact.accepted', 'fact', ?, ?, NULL, ?
        WHERE EXISTS (
          SELECT 1 FROM facts WHERE id = ? AND space_id = ? AND updated_at = ?
        )`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        options.factId,
        options.requestId,
        now,
        options.factId,
        options.spaceId,
        now,
      ),
  ]);
  if (results[1]?.meta.changes !== 1) {
    return {
      current: await factById(database, options.principal, options.spaceId, options.factId),
      kind: "conflict",
    };
  }
  const response = await factById(database, options.principal, options.spaceId, options.factId);
  return response === null ? { kind: "unavailable" } : { kind: "success", response };
}

/**
 * Withdraw a claim the reader does not want kept — typically a wrong research
 * proposal (an unrelated entity the picker did not catch). Retiring, never
 * deleting: the row stays for the audit trail but leaves the actionable set, and
 * an accepted fact is left alone so verified evidence cannot be discarded here.
 */
export async function rejectFact(
  database: D1Database,
  options: {
    factId: string;
    principal: FirebasePrincipal;
    requestId: string;
    spaceId: string;
    version: number;
  },
): Promise<VersionedResult<FactResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  const current = await factById(database, options.principal, options.spaceId, options.factId);
  if (current === null || current.data.status === "retired" || current.data.status === "accepted") {
    return { kind: "unavailable" };
  }
  if (current.data.version !== options.version) return { current, kind: "conflict" };
  const now = new Date().toISOString();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE facts SET status = 'retired', version = version + 1, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL
          AND status <> 'accepted' AND status <> 'retired'`,
      )
      .bind(now, options.factId, options.spaceId, options.version),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'fact', id, 'update', version, ?
          FROM facts WHERE id = ? AND space_id = ? AND updated_at = ?`,
      )
      .bind(now, options.factId, options.spaceId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) SELECT ?, ?, ?, 'fact.rejected', 'fact', ?, ?, NULL, ?
        WHERE EXISTS (
          SELECT 1 FROM facts WHERE id = ? AND space_id = ? AND updated_at = ?
        )`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        options.factId,
        options.requestId,
        now,
        options.factId,
        options.spaceId,
        now,
      ),
  ]);
  if (results[0]?.meta.changes !== 1) {
    return {
      current: await factById(database, options.principal, options.spaceId, options.factId),
      kind: "conflict",
    };
  }
  const response = await factById(database, options.principal, options.spaceId, options.factId);
  return response === null ? { kind: "unavailable" } : { kind: "success", response };
}
