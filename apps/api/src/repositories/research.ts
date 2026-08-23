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
import { resolveAppellationFacts } from "./eambrosia";
import { normalizeWineText } from "./wine-memory";

/**
 * Whether a candidate entity's label is close enough to the wine's own text to
 * attach its facts. A resolved fact is only ever proposed, never applied, so a
 * near miss is the reader's to reject — but a name that shares nothing is not
 * offered at all, which is what stops "Casa Madero" from pulling in a person
 * called Madero.
 */
function nameMatches(field: string, label: string): boolean {
  const a = normalizeWineText(field);
  const b = normalizeWineText(label);
  if (a.length < 3 || b.length < 3) return false;
  return a === b || a.includes(b) || b.includes(a);
}

// Grape names collide with ordinary words far more than producer names do —
// "garnacha" is also a Mexican antojito, "moscatel" a dessert, "malbec" a
// restaurant. A grape entity is a plant, so the general non-place reject cannot
// be used here; instead the description must POSITIVELY say it is a grape or
// vine variety. A description that does not say so is not researched at all,
// which is the honest outcome for a name we cannot confirm.
const grapePattern =
  /\b(grape|vine|vitis|cultivar|variet\w*|cepa|cepaje|uva|uvas|vid|vino|wine|rebsorte|traube|weinrebe|druif|druiven|vitigno|vigne|cepage|castas?|videira)\b/i;

function isPlausibleGrapeEntity(description: string | null): boolean {
  return grapePattern.test(description ?? "");
}

type ResearchAccessRow = {
  actor_user_id: string;
  barcode: string | null;
  display_name: string;
  producer_name: string;
  region: string | null;
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
      `SELECT actor.id AS actor_user_id, wine.id AS wine_id, wine.barcode,
        wine.display_name, wine.producer_name, wine.region
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

/** The wine's registered grape names, in position order. */
async function wineGrapeNames(
  database: D1Database,
  spaceId: string,
  wineId: string,
): Promise<string[]> {
  const rows = await database
    .prepare(
      `SELECT grape.name_snapshot AS name
        FROM wine_grapes grape
        JOIN wine_records wine ON wine.id = grape.wine_id
        WHERE grape.wine_id = ? AND wine.space_id = ?
        ORDER BY grape.position`,
    )
    .bind(wineId, spaceId)
    .all<{ name: string }>();
  return rows.results.map((row) => row.name);
}

async function collectProposals(
  access: ResearchAccessRow,
  request: CreateResearchJobRequest,
  ports: ResearchPorts,
  grapeNames: string[],
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

  // eAmbrosia (the EU's regulatory register, curated offline): the wine's region
  // resolved to the country it lies in and its protection category. Regulatory
  // place facts — higher-confidence and cited — that carry the region dimension
  // Wikidata handled badly. No network; the fact is authored and cited to the
  // public register.
  if (request.topics.includes("region")) {
    const appellationFacts = resolveAppellationFacts(access.region, new Date().toISOString());
    proposals.push(...appellationFacts);
  }

  // Wikidata is no longer asked about the producer or the region. Wine and winery
  // names are fanciful, so name resolution kept attaching the wrong entity (a
  // flower genus for "Áster") or the right entity's wrong detail (the winery's
  // head office presented as the wine's appellation — a Penedès wine labelled
  // Ribera del Duero). The open web answers those far better in prose, and the
  // regulatory register still answers the region's country and category exactly.
  // What Wikidata IS precise about is the grape, so that is all it is asked.
  //
  // Grapes are resolved and researched by name, so the wine's varieties
  // contribute their own open highlights (colour, origin, and whatever else the
  // entity carries). There is no picker — a blend has several — so a close-enough
  // name match whose description confirms it is a grape is researched directly,
  // and a wrong one can be discarded like any other.
  if (request.topics.includes("grapes") && ports.knowledge !== null) {
    const seen = new Set<string>();
    const names = grapeNames
      .map((name) => name.trim())
      .filter(
        (name) =>
          name.length > 0 && (seen.has(name.toLowerCase()) ? false : seen.add(name.toLowerCase())),
      )
      .slice(0, 4);
    for (const name of names) {
      try {
        const found = await ports.knowledge.searchEntities({
          locale: request.locale,
          subjectType: "grape",
          term: name,
        });
        if (found.status !== "success") continue;
        const match = found.data.find(
          (candidate) =>
            isPlausibleGrapeEntity(candidate.description) && nameMatches(name, candidate.label),
        );
        if (match === undefined) continue;
        const result = await ports.knowledge.research({
          entityId: match.id,
          locale: request.locale,
          subjectType: "grape",
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

  // Open web (optional): for wines the structured sources do not hold — a small
  // producer with a fanciful name that is not in Wikidata — a single search over
  // the wine's identity brings back cited snippets. They are low-confidence
  // proposals, sanitized by the adapter, that the reader confirms or discards.
  const webSearch = ports.webSearch ?? null;
  if (webSearch !== null) {
    const query = [access.producer_name, access.display_name, access.region]
      .map((part) => (part ?? "").trim())
      .filter((part) => part.length > 0)
      .join(" ");
    if (query.length >= 3) {
      try {
        const result = await webSearch.search({ locale: request.locale, query });
        if (result.status === "success") {
          attempts.push(successAttempt("web_search", result.cached));
          for (const hit of result.data) {
            proposals.push({
              confidenceMilli: 400,
              predicate: "curiosity.note",
              researchMethod: "web_search.v1",
              source: hit.source,
              value: hit.snippet,
            });
          }
        } else {
          attempts.push(unavailableAttempt("web_search", result.reason, result.retryAfterSeconds));
        }
      } catch {
        attempts.push(unavailableAttempt("web_search", "provider_error", null));
      }
    }
  }

  // Translate the prose we gathered into the reader's language in one pass — web
  // snippets (and their page titles) come back mostly in English, and a Wikipedia
  // summary falls back to the English article when there is no local one. It is a
  // faithful transform that keeps the original on any failure, and the highlights
  // are already localized by their source so they are left alone.
  const translated = await translateProse(proposals, ports.translation ?? null, request.locale);

  // With translation done, an LLM can weave the summary and the discovered
  // highlights into one short, grounded "about this wine" paragraph in the
  // reader's language, in place of the raw encyclopedic opener.
  const composed = await composeNarrative(
    translated,
    ports.narrative ?? null,
    request.locale,
    access.display_name,
  );

  if (composed.length === 0) warnings.add("no_results");
  if (attempts.some((attempt) => attempt.status === "unavailable") && composed.length > 0) {
    warnings.add("partial_results");
  }
  return { attempts, proposals: composed, warnings: [...warnings] };
}

/** Replace the research summary with a grounded paragraph the model writes from
 *  the summary plus the discovered highlights. Only runs when a Wikipedia-backed
 *  summary already exists (it carries the citation); keeps it on any failure. */
async function composeNarrative(
  proposals: ProposedFact[],
  narrative: ResearchPorts["narrative"],
  locale: CreateResearchJobRequest["locale"],
  wine: string,
): Promise<ProposedFact[]> {
  if (narrative === null || narrative === undefined) return proposals;
  const summaryIndex = proposals.findIndex((proposal) => proposal.predicate === "research.summary");
  if (summaryIndex === -1) return proposals;
  const statements = [
    String(proposals[summaryIndex]!.value),
    ...proposals
      .filter((proposal) => proposal.predicate === "curiosity.highlight")
      .map((proposal) => String(proposal.value)),
  ];
  let paragraph: string | null;
  try {
    paragraph = await narrative.compose({ locale, statements, wine });
  } catch {
    return proposals;
  }
  if (paragraph === null) return proposals;
  return proposals.map((proposal, index) =>
    index === summaryIndex ? { ...proposal, value: paragraph } : proposal,
  );
}

/** Translate the value (and, for a web note, its source title) of every prose
 *  proposal, returning a new array; originals are kept on any failure. */
async function translateProse(
  proposals: ProposedFact[],
  translation: ResearchPorts["translation"],
  locale: CreateResearchJobRequest["locale"],
): Promise<ProposedFact[]> {
  if (translation === null || translation === undefined || locale === "en") return proposals;
  const slots: { index: number; kind: "title" | "value" }[] = [];
  const texts: string[] = [];
  proposals.forEach((proposal, index) => {
    if (proposal.predicate === "research.summary") {
      slots.push({ index, kind: "value" });
      texts.push(String(proposal.value));
    } else if (proposal.predicate === "curiosity.note") {
      slots.push({ index, kind: "title" });
      texts.push(proposal.source.title);
      slots.push({ index, kind: "value" });
      texts.push(String(proposal.value));
    }
  });
  if (texts.length === 0) return proposals;
  let result: (string | null)[] | null;
  try {
    result = await translation.translate({ locale, texts });
  } catch {
    return proposals;
  }
  if (result === null || result.length !== texts.length) return proposals;
  const patches = new Map<number, { title?: string; value?: string }>();
  slots.forEach((slot, position) => {
    const value = result[position];
    if (value === null || value === undefined) return;
    patches.set(slot.index, { ...patches.get(slot.index), [slot.kind]: value });
  });
  return proposals.map((proposal, index) => {
    const patch = patches.get(index);
    if (patch === undefined) return proposal;
    return {
      ...proposal,
      ...(patch.value === undefined ? {} : { value: patch.value }),
      ...(patch.title === undefined ? {} : { source: { ...proposal.source, title: patch.title } }),
    };
  });
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
    // Deduplicate on predicate + value only, not the source: the same fact found
    // through two entities (a producer and a grape both giving "Country: Spain")
    // is one card, not two. The first occurrence — and its source — is kept.
    const key = `${proposal.predicate}:${JSON.stringify(proposal.value)}`;
    if (!deduplicated.has(key)) deduplicated.set(key, proposal);
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
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
          stored.proposal.source.sourceType,
          stored.proposal.source.licenseIdentifier ?? null,
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
    // Reuse any researched fact already carrying this exact predicate+value, so
    // researching the same wine twice — or reaching the same value by a different
    // method or source — never stacks duplicate cards.
    const existingFact = await database
      .prepare(
        `SELECT fact.id FROM facts fact
        WHERE fact.space_id = ? AND fact.subject_type = 'wine' AND fact.subject_id = ?
          AND fact.predicate = ? AND fact.value_json = ? AND fact.evidence_class = 'researched'
          AND fact.deleted_at IS NULL
        LIMIT 1`,
      )
      .bind(
        options.spaceId,
        options.wineId,
        stored.proposal.predicate,
        JSON.stringify(stored.proposal.value),
      )
      .first<{ id: string }>();
    const factId = existingFact?.id ?? stored.factId;
    factIds.add(factId);
    if (existingFact === null) {
      // There is only ever one live narrative per wine: a freshly composed one
      // replaces the last, so re-running research regenerates the paragraph
      // instead of stacking a new copy beside the stale one.
      if (stored.proposal.predicate === "research.summary") {
        commands.push(
          database
            .prepare(
              `UPDATE facts SET status = 'retired', version = version + 1, updated_at = ?
              WHERE space_id = ? AND subject_type = 'wine' AND subject_id = ?
                AND predicate = 'research.summary' AND id <> ?
                AND status <> 'retired' AND deleted_at IS NULL`,
            )
            .bind(now, options.spaceId, options.wineId, factId),
        );
      }
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

  const grapeNames = options.request.topics.includes("grapes")
    ? await wineGrapeNames(database, options.spaceId, options.wineId)
    : [];
  const collected = await collectProposals(access, options.request, options.ports, grapeNames);
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
