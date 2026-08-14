import {
  HttpsSourceUrlSchema,
  type CreateResearchJobRequest,
  type ResearchAttempt,
  type ResearchJob,
  type ResearchJobResponse,
  type ResearchJobWarning,
} from "@vadevi/contracts";
import type { ProposedFact, ProductCandidate, ResearchPorts } from "@vadevi/domain";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";

type ResearchAccessRow = {
  actor_user_id: string;
  barcode: string | null;
  wine_id: string;
};

type ResearchJobRow = {
  attempts_json: string;
  completed_at: string | null;
  created_at: string;
  fact_ids_json: string;
  id: string;
  locale: ResearchJob["locale"];
  provider_mode: ResearchJob["providerMode"];
  source_ids_json: string;
  status: ResearchJob["status"];
  topics_json: string;
  warnings_json: string;
  wine_id: string;
};

type StoredProposal = Readonly<{
  factId: string;
  proposal: ProposedFact;
  provider: string;
  sourceId: string;
  sourceIsNew: boolean;
}>;

function plusHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1_000).toISOString();
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function researchJobResource(row: ResearchJobRow): ResearchJob {
  return {
    attempts: parseJsonArray<ResearchAttempt>(row.attempts_json),
    completedAt: row.completed_at,
    createdAt: row.created_at,
    factIds: parseJsonArray<string>(row.fact_ids_json),
    id: row.id,
    locale: row.locale,
    providerMode: row.provider_mode,
    sourceIds: parseJsonArray<string>(row.source_ids_json),
    status: row.status,
    topics: parseJsonArray<ResearchJob["topics"][number]>(row.topics_json),
    warnings: parseJsonArray<ResearchJobWarning>(row.warnings_json),
    wineId: row.wine_id,
  };
}

async function researchAccess(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineId: string,
): Promise<ResearchAccessRow | null> {
  return database
    .prepare(
      `SELECT actor.id AS actor_user_id, wine.id AS wine_id, wine.barcode
      FROM wine_records wine
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      JOIN spaces space ON space.id = wine.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND space.deleted_at IS NULL
        AND wine.space_id = ? AND wine.id = ? AND wine.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid, spaceId, wineId)
    .first<ResearchAccessRow>();
}

async function jobById(database: D1Database, spaceId: string, jobId: string) {
  return database
    .prepare(
      `SELECT id, wine_id, status, locale, topics_json, provider_mode,
        attempts_json, fact_ids_json, source_ids_json, warnings_json,
        created_at, completed_at
      FROM research_jobs WHERE id = ? AND space_id = ?`,
    )
    .bind(jobId, spaceId)
    .first<ResearchJobRow>();
}

export async function getResearchJob(
  database: D1Database,
  options: {
    jobId: string;
    principal: FirebasePrincipal;
    spaceId: string;
  },
): Promise<ResearchJobResponse | null> {
  const allowed = await database
    .prepare(
      `SELECT 1 AS allowed FROM research_jobs job
      JOIN space_memberships membership ON membership.space_id = job.space_id
      JOIN users actor ON actor.id = membership.user_id
      JOIN spaces space ON space.id = job.space_id
      WHERE job.id = ? AND job.space_id = ? AND actor.firebase_uid = ?
        AND actor.deleted_at IS NULL AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(options.jobId, options.spaceId, options.principal.firebaseUid)
    .first<{ allowed: number }>();
  if (allowed === null) return null;
  const row = await jobById(database, options.spaceId, options.jobId);
  return row === null ? null : { data: researchJobResource(row) };
}

function unavailableAttempt(
  provider: ResearchAttempt["provider"],
  reason: NonNullable<ResearchAttempt["reason"]>,
  retryAfterSeconds: number | null,
): ResearchAttempt {
  return { cached: null, provider, reason, retryAfterSeconds, status: "unavailable" };
}

function successAttempt(provider: ResearchAttempt["provider"], cached: boolean): ResearchAttempt {
  return { cached, provider, reason: null, retryAfterSeconds: null, status: "success" };
}

function productProposal(candidate: ProductCandidate): ProposedFact | null {
  if (candidate.name === null) return null;
  return {
    confidenceMilli: 550,
    predicate: "identity.canonical_name",
    researchMethod: "open_food_facts.product.v3.6",
    source: candidate.source,
    value: candidate.name,
  };
}

async function collectProposals(
  access: ResearchAccessRow,
  request: CreateResearchJobRequest,
  ports: ResearchPorts,
): Promise<{
  attempts: ResearchAttempt[];
  proposals: ProposedFact[];
  warnings: ResearchJobWarning[];
}> {
  const attempts: ResearchAttempt[] = [];
  const proposals: ProposedFact[] = [];
  const warnings = new Set<ResearchJobWarning>();
  if (ports.providerMode === "none") {
    warnings.add("provider_disabled");
    warnings.add("no_results");
    return { attempts, proposals, warnings: [...warnings] };
  }

  if (request.topics.includes("identity")) {
    if (access.barcode === null || ports.product === null) {
      warnings.add("missing_barcode");
    } else {
      try {
        const result = await ports.product.lookupBarcode({
          barcode: access.barcode,
          locale: request.locale,
        });
        if (result.status === "success") {
          attempts.push(successAttempt("open_food_facts", result.cached));
          const proposal = productProposal(result.data);
          if (proposal !== null) proposals.push(proposal);
        } else {
          attempts.push(
            unavailableAttempt("open_food_facts", result.reason, result.retryAfterSeconds),
          );
        }
      } catch {
        attempts.push(unavailableAttempt("open_food_facts", "provider_error", null));
      }
    }
  }

  const knowledgeRequests = [
    request.topics.includes("identity") && request.wikidataEntityIds.wine !== undefined
      ? { entityId: request.wikidataEntityIds.wine, subjectType: "wine" as const }
      : null,
    request.topics.includes("producer") && request.wikidataEntityIds.producer !== undefined
      ? { entityId: request.wikidataEntityIds.producer, subjectType: "producer" as const }
      : null,
    request.topics.includes("region") && request.wikidataEntityIds.region !== undefined
      ? { entityId: request.wikidataEntityIds.region, subjectType: "region" as const }
      : null,
  ].filter((candidate) => candidate !== null);
  const requestedKnowledgeTopics = ["identity", "producer", "region"].filter((topic) =>
    request.topics.includes(topic as ResearchJob["topics"][number]),
  );
  if (requestedKnowledgeTopics.length > knowledgeRequests.length) {
    warnings.add("missing_wikidata_entity");
  }
  if (ports.knowledge !== null) {
    for (const knowledgeRequest of knowledgeRequests) {
      try {
        const result = await ports.knowledge.research({
          ...knowledgeRequest,
          locale: request.locale,
        });
        if (result.status === "success") {
          attempts.push(successAttempt("wikidata", result.cached));
          proposals.push(...result.data);
        } else {
          attempts.push(unavailableAttempt("wikidata", result.reason, result.retryAfterSeconds));
        }
      } catch {
        attempts.push(unavailableAttempt("wikidata", "provider_error", null));
      }
    }
  }
  if (proposals.length === 0) warnings.add("no_results");
  if (attempts.some((attempt) => attempt.status === "unavailable") && proposals.length > 0) {
    warnings.add("partial_results");
  }
  return { attempts, proposals, warnings: [...warnings] };
}

async function resolveStoredProposals(
  database: D1Database,
  spaceId: string,
  proposals: ProposedFact[],
  maxSources: number,
): Promise<{ proposals: StoredProposal[]; sourceLimitReached: boolean }> {
  const deduplicated = new Map<string, ProposedFact>();
  for (const proposal of proposals) {
    if (!HttpsSourceUrlSchema.safeParse(proposal.source.canonicalUrl).success) continue;
    const key = `${proposal.predicate}:${JSON.stringify(proposal.value)}:${proposal.source.canonicalUrl}`;
    deduplicated.set(key, proposal);
  }
  const allowedSourceUrls = new Set(
    [...new Set([...deduplicated.values()].map((proposal) => proposal.source.canonicalUrl))].slice(
      0,
      maxSources,
    ),
  );
  const stored: StoredProposal[] = [];
  const resolvedSources = new Map<string, { id: string; isNew: boolean }>();
  for (const proposal of deduplicated.values()) {
    if (!allowedSourceUrls.has(proposal.source.canonicalUrl)) continue;
    let source = resolvedSources.get(proposal.source.canonicalUrl);
    if (source === undefined) {
      const existingSource = await database
        .prepare(`SELECT id FROM sources WHERE space_id = ? AND canonical_url = ?`)
        .bind(spaceId, proposal.source.canonicalUrl)
        .first<{ id: string }>();
      source = { id: existingSource?.id ?? ulid(), isNew: existingSource === null };
      resolvedSources.set(proposal.source.canonicalUrl, source);
    }
    stored.push({
      factId: ulid(),
      proposal,
      provider: proposal.researchMethod.split(".")[0] ?? "external",
      sourceId: source.id,
      sourceIsNew: source.isNew,
    });
  }
  return {
    proposals: stored,
    sourceLimitReached:
      allowedSourceUrls.size <
      new Set([...deduplicated.values()].map((proposal) => proposal.source.canonicalUrl)).size,
  };
}

async function persistCompletedJob(
  database: D1Database,
  options: {
    actorId: string;
    attempts: ResearchAttempt[];
    jobId: string;
    proposals: StoredProposal[];
    requestId: string;
    spaceId: string;
    status: ResearchJob["status"];
    warnings: ResearchJobWarning[];
    wineId: string;
  },
) {
  const now = new Date().toISOString();
  const commands: D1PreparedStatement[] = [];
  const sourceIdByUrl = new Map<string, string>();
  for (const stored of options.proposals) {
    const canonicalUrl = stored.proposal.source.canonicalUrl;
    if (sourceIdByUrl.has(canonicalUrl)) continue;
    if (stored.sourceIsNew) {
      const source = await database
        .prepare(
          `INSERT INTO sources (
              id, space_id, canonical_url, title, publisher, source_type,
              license_identifier, retrieved_at, last_checked_at, content_hash,
              created_by_user_id, created_by_provider, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'open_dataset', ?, ?, NULL, NULL, NULL, ?, ?, ?)
            ON CONFLICT(space_id, canonical_url) DO UPDATE SET
              canonical_url = excluded.canonical_url
            RETURNING id`,
        )
        .bind(
          stored.sourceId,
          options.spaceId,
          canonicalUrl,
          stored.proposal.source.title,
          stored.proposal.source.publisher,
          stored.proposal.source.licenseIdentifier,
          stored.proposal.source.retrievedAt,
          stored.provider,
          now,
          now,
        )
        .first<{ id: string }>();
      if (source === null) throw new Error("Research source persistence failed.");
      sourceIdByUrl.set(canonicalUrl, source.id);
    } else {
      sourceIdByUrl.set(canonicalUrl, stored.sourceId);
    }
  }
  const factIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const stored of options.proposals) {
    const sourceId = sourceIdByUrl.get(stored.proposal.source.canonicalUrl);
    if (sourceId === undefined) throw new Error("Research source resolution failed.");
    sourceIds.add(sourceId);
    const existingFact = await database
      .prepare(
        `SELECT fact.id FROM facts fact
        JOIN fact_citations citation ON citation.fact_id = fact.id
        WHERE fact.space_id = ? AND fact.subject_type = 'wine' AND fact.subject_id = ?
          AND fact.predicate = ? AND fact.value_json = ? AND fact.research_method = ?
          AND fact.deleted_at IS NULL AND citation.source_id = ?
        LIMIT 1`,
      )
      .bind(
        options.spaceId,
        options.wineId,
        stored.proposal.predicate,
        JSON.stringify(stored.proposal.value),
        stored.proposal.researchMethod,
        sourceId,
      )
      .first<{ id: string }>();
    const factId = existingFact?.id ?? stored.factId;
    factIds.add(factId);
    if (existingFact === null) {
      commands.push(
        database
          .prepare(
            `INSERT INTO facts (
              id, space_id, subject_type, subject_id, predicate, value_json,
              evidence_class, confidence_milli, status, observed_by_user_id,
              verified_by_user_id, verified_at, research_method, version,
              created_at, updated_at, deleted_at
            ) VALUES (?, ?, 'wine', ?, ?, ?, 'researched', ?, 'proposed', NULL,
              NULL, NULL, ?, 1, ?, ?, NULL)`,
          )
          .bind(
            factId,
            options.spaceId,
            options.wineId,
            stored.proposal.predicate,
            JSON.stringify(stored.proposal.value),
            stored.proposal.confidenceMilli,
            stored.proposal.researchMethod,
            now,
            now,
          ),
        database
          .prepare(
            `INSERT INTO fact_citations (
              fact_id, source_id, locator, support_strength, created_at
            ) VALUES (?, ?, NULL, 'direct', ?)`,
          )
          .bind(factId, sourceId, now),
        database
          .prepare(
            `INSERT INTO change_events (
              space_id, resource_type, resource_id, operation, resource_version, changed_at
            ) SELECT ?, 'fact', ?, 'create', 1, ?
            WHERE EXISTS (SELECT 1 FROM facts WHERE id = ? AND created_at = ?)`,
          )
          .bind(options.spaceId, factId, now, factId, now),
      );
    }
  }
  const persistedFactIds = [...factIds];
  const persistedSourceIds = [...sourceIds];
  commands.push(
    database
      .prepare(
        `UPDATE research_jobs SET status = ?, attempts_json = ?, fact_ids_json = ?,
          source_ids_json = ?, warnings_json = ?, completed_at = ?
        WHERE id = ? AND space_id = ? AND status = 'running'`,
      )
      .bind(
        options.status,
        JSON.stringify(options.attempts),
        JSON.stringify(persistedFactIds),
        JSON.stringify(persistedSourceIds),
        JSON.stringify(options.warnings),
        now,
        options.jobId,
        options.spaceId,
      ),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'research.completed', 'research_job', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        options.actorId,
        options.spaceId,
        options.jobId,
        options.requestId,
        JSON.stringify({ factCount: persistedFactIds.length, status: options.status }),
        now,
      ),
  );
  await database.batch(commands);
}

export async function createResearchJob(
  database: D1Database,
  options: {
    idempotencyKey: string;
    ports: ResearchPorts;
    principal: FirebasePrincipal;
    request: CreateResearchJobRequest;
    requestId: string;
    spaceId: string;
    wineId: string;
  },
): Promise<
  | { kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: ResearchJobResponse }
  | { kind: "unavailable" }
> {
  const access = await researchAccess(database, options.principal, options.spaceId, options.wineId);
  if (access === null) return { kind: "unavailable" };
  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/wines/${options.wineId}/research-jobs`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await database
    .prepare(
      `SELECT request_hash, resource_id FROM idempotency_keys
      WHERE user_id = ? AND route_scope = ? AND key_hash = ? AND expires_at > ?`,
    )
    .bind(access.actor_user_id, routeScope, keyHash, now)
    .first<{ request_hash: string; resource_id: string }>();
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const response = await getResearchJob(database, {
      jobId: previous.resource_id,
      principal: options.principal,
      spaceId: options.spaceId,
    });
    return response === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response };
  }

  const jobId = ulid();
  const initial = await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(access.actor_user_id, routeScope, keyHash, requestHash, jobId, plusHours(now, 24), now),
    database
      .prepare(
        `INSERT INTO research_jobs (
          id, space_id, wine_id, requested_by_user_id, status, locale,
          topics_json, provider_mode, attempts_json, fact_ids_json,
          source_ids_json, warnings_json, created_at, completed_at
        ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, '[]', '[]', '[]', '[]', ?, NULL)`,
      )
      .bind(
        jobId,
        options.spaceId,
        options.wineId,
        access.actor_user_id,
        options.request.locale,
        JSON.stringify(options.request.topics),
        options.ports.providerMode,
        now,
      ),
  ]);
  if (initial[1]?.meta.changes !== 1) return { kind: "conflict" };

  const collected = await collectProposals(access, options.request, options.ports);
  const resolved = await resolveStoredProposals(
    database,
    options.spaceId,
    collected.proposals,
    options.request.maxSources,
  );
  const warningSet = new Set(collected.warnings);
  if (resolved.sourceLimitReached) warningSet.add("source_limit_reached");
  const status: ResearchJob["status"] =
    resolved.proposals.length > 0 && !warningSet.has("partial_results") ? "completed" : "degraded";
  await persistCompletedJob(database, {
    actorId: access.actor_user_id,
    attempts: collected.attempts,
    jobId,
    proposals: resolved.proposals,
    requestId: options.requestId,
    spaceId: options.spaceId,
    status,
    warnings: [...warningSet],
    wineId: options.wineId,
  });
  const response = await getResearchJob(database, {
    jobId,
    principal: options.principal,
    spaceId: options.spaceId,
  });
  return response === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response };
}
