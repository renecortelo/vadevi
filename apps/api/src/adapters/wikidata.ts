import type {
  ExternalCachePort,
  ExternalRateLimitPort,
  ExternalResult,
  KnowledgeEntityCandidate,
  KnowledgeEntitySearch,
  KnowledgeResearchRequest,
  KnowledgeResearchPort,
  ProposedFact,
} from "@vadevi/domain";
import { sanitizeExternalText } from "@vadevi/domain";
import { z } from "zod";

import {
  fetchFromProvider,
  ProviderFetchError,
  type ProviderFetcher,
  readBoundedJson,
  retryAfterSeconds,
} from "./provider-fetch";

const wikidataBaseUrl = new URL("https://www.wikidata.org/w/api.php");

const TermSchema = z.object({ language: z.string(), value: z.string() }).passthrough();
const WikidataResponseSchema = z
  .object({
    entities: z.record(
      z.string(),
      z
        .object({
          descriptions: z.record(z.string(), TermSchema).optional(),
          id: z.string(),
          labels: z.record(z.string(), TermSchema).optional(),
          missing: z.union([z.string(), z.boolean()]).optional(),
        })
        .passthrough(),
    ),
    error: z.object({ code: z.string() }).passthrough().optional(),
  })
  .passthrough();

const WikidataSearchResponseSchema = z
  .object({
    error: z.object({ code: z.string() }).passthrough().optional(),
    search: z
      .array(
        z
          .object({
            description: z.string().optional(),
            id: z.string(),
            label: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

// Wikidata properties worth surfacing as human-readable highlights. Deliberately
// broad and cross-cutting — a producer, a region, and a grape each expose a
// different subset — because the goal is to expand what we know about THIS wine,
// not to fill a fixed template. Wikidata returns each property's label in the
// reader's language, so no field name is hardcoded here; each wine shows whatever
// it happens to have.
const highlightPropertyIds = [
  "P571", // inception (when the producer was founded)
  "P112", // founded by
  "P127", // owned by
  "P169", // chief executive officer
  "P17", // country
  "P159", // headquarters location
  "P740", // location of formation
  "P452", // industry
  "P462", // color (of a grape variety)
  "P495", // country of origin
  "P189", // location of discovery / place of origin
] as const;

const maxHighlights = 8;

const SnakSchema = z
  .object({
    mainsnak: z
      .object({
        datavalue: z
          .object({ type: z.string().optional(), value: z.unknown() })
          .passthrough()
          .optional(),
        snaktype: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const ClaimsSchema = z.record(z.string(), z.array(SnakSchema));

const SitelinksSchema = z.record(z.string(), z.object({ title: z.string() }).passthrough());

const WikipediaSummarySchema = z
  .object({
    content_urls: z
      .object({ desktop: z.object({ page: z.string() }).passthrough().optional() })
      .passthrough()
      .optional(),
    extract: z.string().optional(),
    title: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

type HighlightValue = { id: string; kind: "entity" } | { kind: "literal"; text: string };

/** The first usable value of a claim, as either an entity reference or a literal. */
function claimValue(snak: z.infer<typeof SnakSchema>): HighlightValue | null {
  const mainsnak = snak.mainsnak;
  if (mainsnak?.snaktype !== "value" || mainsnak.datavalue === undefined) return null;
  const { type, value } = mainsnak.datavalue;
  if (type === "wikibase-entityid") {
    const id = (value as { id?: unknown } | null)?.id;
    return typeof id === "string" ? { id, kind: "entity" } : null;
  }
  if (type === "time") {
    const time = (value as { time?: unknown } | null)?.time;
    if (typeof time !== "string") return null;
    const year = /^[+-](\d{1,4})-/.exec(time);
    return year ? { kind: "literal", text: String(Number.parseInt(year[1]!, 10)) } : null;
  }
  if (type === "string" && typeof value === "string") return { kind: "literal", text: value };
  if (type === "monolingualtext") {
    const text = (value as { text?: unknown } | null)?.text;
    return typeof text === "string" ? { kind: "literal", text } : null;
  }
  return null;
}

function providerLocale(locale: string) {
  return locale === "pt-PT" ? "pt" : locale;
}

function localizedTerm(
  terms: Record<string, { language: string; value: string }> | undefined,
  locale: string,
) {
  return terms?.[locale]?.value ?? terms?.en?.value ?? Object.values(terms ?? {})[0]?.value ?? null;
}

export class WikidataAdapter implements KnowledgeResearchPort {
  private readonly baseUrl: URL;
  private readonly allowedHosts: ReadonlySet<string>;
  private readonly cacheTtlMilliseconds: number;
  private readonly fetcher: ProviderFetcher;
  private readonly limitPerMinute: number;
  private readonly now: () => Date;

  constructor(
    private readonly cache: ExternalCachePort,
    private readonly rateLimiter: ExternalRateLimitPort,
    private readonly userAgent: string,
    options: {
      cacheTtlMilliseconds?: number;
      fetcher?: ProviderFetcher;
      limitPerMinute?: number;
      now?: () => Date;
    } = {},
  ) {
    this.baseUrl = new URL(wikidataBaseUrl);
    this.allowedHosts = new Set([this.baseUrl.hostname.toLowerCase()]);
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? 7 * 24 * 60 * 60 * 1_000;
    this.fetcher = options.fetcher ?? fetch;
    this.limitPerMinute = Math.min(options.limitPerMinute ?? 60, 200);
    this.now = options.now ?? (() => new Date());
  }

  async searchEntities(
    input: KnowledgeEntitySearch,
  ): Promise<ExternalResult<KnowledgeEntityCandidate[]>> {
    const term = input.term.trim().slice(0, 200);
    if (term.length < 2) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const locale = providerLocale(input.locale);
    const now = this.now();
    const nowTimestamp = now.toISOString();
    const cacheKey = `wbsearch-v1:${term.toLowerCase()}:${locale}:${input.subjectType}`;
    const cached = await this.cache.get<KnowledgeEntityCandidate[]>(
      "wikidata",
      cacheKey,
      nowTimestamp,
    );
    if (cached !== null) return { cached: true, data: cached, status: "success" };

    const rate = await this.rateLimiter.consume("wikidata", this.limitPerMinute, 60, nowTimestamp);
    if (!rate.allowed) {
      return {
        reason: "rate_limited",
        retryAfterSeconds: rate.retryAfterSeconds,
        status: "unavailable",
      };
    }

    const url = new URL(this.baseUrl);
    for (const [name, value] of Object.entries({
      action: "wbsearchentities",
      format: "json",
      formatversion: "2",
      language: locale,
      limit: "5",
      origin: "*",
      search: term,
      type: "item",
      uselang: locale,
    })) {
      url.searchParams.set(name, value);
    }

    let response: Response;
    try {
      response = await fetchFromProvider(this.fetcher, url, {
        allowedHosts: this.allowedHosts,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Api-User-Agent": this.userAgent,
          "User-Agent": this.userAgent,
        },
      });
    } catch (error) {
      const reason = error instanceof ProviderFetchError ? error.reason : "provider_error";
      return { reason, retryAfterSeconds: null, status: "unavailable" };
    }
    if (response.status === 429) {
      return {
        reason: "rate_limited",
        retryAfterSeconds: retryAfterSeconds(response),
        status: "unavailable",
      };
    }
    if (!response.ok) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    const parsed = WikidataSearchResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.error !== undefined) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    const candidates: KnowledgeEntityCandidate[] = [];
    for (const entry of parsed.data.search ?? []) {
      const id = entry.id.trim().toUpperCase();
      if (!/^Q[1-9]\d{0,11}$/.test(id)) continue;
      const sanitizedLabel = sanitizeExternalText(entry.label ?? "", 300);
      if (sanitizedLabel.value.length === 0 || sanitizedLabel.flaggedPromptLike) continue;
      const sanitizedDescription = sanitizeExternalText(entry.description ?? "", 2_000);
      const description =
        sanitizedDescription.value.length === 0 || sanitizedDescription.flaggedPromptLike
          ? null
          : sanitizedDescription.value;
      candidates.push({ description, id, label: sanitizedLabel.value });
      if (candidates.length >= 5) break;
    }
    await this.cache.put(
      "wikidata",
      cacheKey,
      candidates,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: candidates, status: "success" };
  }

  async research(input: KnowledgeResearchRequest): Promise<ExternalResult<ProposedFact[]>> {
    const entityId = input.entityId.trim().toUpperCase();
    if (!/^Q[1-9]\d{0,11}$/.test(entityId)) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const locale = providerLocale(input.locale);
    const now = this.now();
    const nowTimestamp = now.toISOString();
    const cacheKey = `wbgetentities-v1:${entityId}:${locale}:${input.subjectType}`;
    const cached = await this.cache.get<ProposedFact[]>("wikidata", cacheKey, nowTimestamp);
    if (cached !== null) return { cached: true, data: cached, status: "success" };

    const rate = await this.rateLimiter.consume("wikidata", this.limitPerMinute, 60, nowTimestamp);
    if (!rate.allowed) {
      return {
        reason: "rate_limited",
        retryAfterSeconds: rate.retryAfterSeconds,
        status: "unavailable",
      };
    }

    const url = new URL(this.baseUrl);
    for (const [name, value] of Object.entries({
      action: "wbgetentities",
      format: "json",
      formatversion: "2",
      ids: entityId,
      languagefallback: "1",
      languages: locale === "en" ? "en" : `${locale}|en`,
      maxlag: "5",
      origin: "*",
      props: "labels|claims|sitelinks",
    })) {
      url.searchParams.set(name, value);
    }

    let response: Response;
    try {
      response = await fetchFromProvider(this.fetcher, url, {
        allowedHosts: this.allowedHosts,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Api-User-Agent": this.userAgent,
          "User-Agent": this.userAgent,
        },
      });
    } catch (error) {
      const reason = error instanceof ProviderFetchError ? error.reason : "provider_error";
      return { reason, retryAfterSeconds: null, status: "unavailable" };
    }
    if (response.status === 404) {
      return { reason: "not_found", retryAfterSeconds: null, status: "unavailable" };
    }
    if (response.status === 429) {
      return {
        reason: "rate_limited",
        retryAfterSeconds: retryAfterSeconds(response),
        status: "unavailable",
      };
    }
    if (!response.ok) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    const parsed = WikidataResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.error !== undefined) {
      return {
        reason:
          parsed.success && parsed.data.error?.code === "maxlag"
            ? "rate_limited"
            : "provider_error",
        retryAfterSeconds: null,
        status: "unavailable",
      };
    }
    const entity = parsed.data.entities[entityId];
    if (entity === undefined || entity.missing !== undefined) {
      return { reason: "not_found", retryAfterSeconds: null, status: "unavailable" };
    }
    const rawLabel = localizedTerm(entity.labels, locale);
    const sanitizedLabel = sanitizeExternalText(rawLabel ?? "", 300);
    const label =
      sanitizedLabel.value.length === 0 || sanitizedLabel.flaggedPromptLike
        ? null
        : sanitizedLabel.value;
    const source = {
      canonicalUrl: `https://www.wikidata.org/wiki/${entityId}`,
      licenseIdentifier: "CC0-1.0",
      publisher: "Wikidata",
      retrievedAt: nowTimestamp,
      sourceType: "open_dataset" as const,
      title: label ?? `Wikidata ${entityId}`,
    };

    // Open-ended enrichment: rather than re-proposing the name we already know,
    // surface whatever interesting properties this particular entity carries.
    // Each property and each entity-valued answer is resolved to its label in the
    // reader's language, so the result reads as "{property}: {value}" with nothing
    // hardcoded per field. The set of highlights naturally differs from one wine
    // to the next.
    const claims = ClaimsSchema.safeParse((entity as { claims?: unknown }).claims ?? {});
    const picked: { propertyId: string; value: HighlightValue }[] = [];
    if (claims.success) {
      for (const propertyId of highlightPropertyIds) {
        const snaks = claims.data[propertyId];
        if (snaks === undefined) continue;
        for (const snak of snaks) {
          const value = claimValue(snak);
          if (value !== null) {
            picked.push({ propertyId, value });
            break; // one representative value per property keeps the list tight
          }
        }
      }
    }

    const idsToLabel = new Set<string>();
    for (const { propertyId, value } of picked) {
      idsToLabel.add(propertyId);
      if (value.kind === "entity") idsToLabel.add(value.id);
    }
    const labels = idsToLabel.size === 0 ? new Map() : await this.fetchLabels(idsToLabel, locale);

    const facts: ProposedFact[] = [];
    for (const { propertyId, value } of picked) {
      if (facts.length >= maxHighlights) break;
      const propertyLabel = labels.get(propertyId);
      if (propertyLabel === undefined) continue;
      const rawValue = value.kind === "entity" ? labels.get(value.id) : value.text;
      if (rawValue === undefined) continue;
      const property = sanitizeExternalText(propertyLabel, 80);
      const answer = sanitizeExternalText(rawValue, 200);
      if (
        property.value.length === 0 ||
        answer.value.length === 0 ||
        property.flaggedPromptLike ||
        answer.flaggedPromptLike
      ) {
        continue;
      }
      facts.push({
        confidenceMilli: 800,
        predicate: "curiosity.highlight",
        researchMethod: "wikidata.highlight.v1",
        source,
        value: `${property.value}: ${answer.value}`,
      });
    }

    // A short readable paragraph from the matching Wikipedia article, when the
    // entity has one in the reader's language (falling back to English). This is
    // the narrative material; a later LLM pass may compact it further, but even
    // raw it reads as "about this wine" prose rather than a lone data point.
    const sitelinks = SitelinksSchema.safeParse(
      (entity as { sitelinks?: unknown }).sitelinks ?? {},
    );
    if (sitelinks.success) {
      const title = sitelinks.data[`${locale}wiki`]?.title ?? sitelinks.data.enwiki?.title ?? null;
      const wikiLang = sitelinks.data[`${locale}wiki`] !== undefined ? locale : "en";
      if (title !== null) {
        const summary = await this.fetchWikipediaSummary(title, wikiLang, nowTimestamp);
        if (summary !== null) facts.unshift(summary);
      }
    }

    if (facts.length === 0) {
      return { reason: "not_found", retryAfterSeconds: null, status: "unavailable" };
    }
    await this.cache.put(
      "wikidata",
      cacheKey,
      facts,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: facts, status: "success" };
  }

  /**
   * A short plain-text summary of the matching Wikipedia article, from the REST
   * summary endpoint on the article's own language host. Best-effort: any
   * failure, a disambiguation page, or prompt-like text yields null and the
   * research simply proceeds without a narrative. Cited to Wikipedia (CC-BY-SA).
   */
  private async fetchWikipediaSummary(
    title: string,
    wikiLang: string,
    nowTimestamp: string,
  ): Promise<ProposedFact | null> {
    const host = `${wikiLang}.wikipedia.org`;
    const url = new URL(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    let response: Response;
    try {
      response = await fetchFromProvider(this.fetcher, url, {
        allowedHosts: new Set([host]),
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Api-User-Agent": this.userAgent,
          "User-Agent": this.userAgent,
        },
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch {
      return null;
    }
    const parsed = WikipediaSummarySchema.safeParse(payload);
    if (!parsed.success || parsed.data.type === "disambiguation") return null;
    const extract = sanitizeExternalText(parsed.data.extract ?? "", 600);
    if (extract.value.length === 0 || extract.flaggedPromptLike) return null;
    const pageUrl = parsed.data.content_urls?.desktop?.page;
    const canonicalUrl =
      typeof pageUrl === "string" && pageUrl.startsWith(`https://${host}/`)
        ? pageUrl
        : `https://${host}/wiki/${encodeURIComponent(title)}`;
    return {
      confidenceMilli: 700,
      predicate: "research.summary",
      researchMethod: "wikipedia.summary.v1",
      source: {
        canonicalUrl,
        licenseIdentifier: "CC-BY-SA-4.0",
        publisher: "Wikipedia",
        retrievedAt: nowTimestamp,
        sourceType: "open_dataset" as const,
        title: parsed.data.title ?? title,
      },
      value: extract.value,
    };
  }

  /**
   * Resolve a batch of property and item ids to their labels in the reader's
   * language (falling back to English). Best-effort: any failure yields an empty
   * map, and highlights that cannot be labelled are simply dropped.
   */
  private async fetchLabels(ids: Set<string>, locale: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const url = new URL(this.baseUrl);
    for (const [name, value] of Object.entries({
      action: "wbgetentities",
      format: "json",
      formatversion: "2",
      ids: [...ids].join("|"),
      languagefallback: "1",
      languages: locale === "en" ? "en" : `${locale}|en`,
      maxlag: "5",
      origin: "*",
      props: "labels",
    })) {
      url.searchParams.set(name, value);
    }
    let response: Response;
    try {
      response = await fetchFromProvider(this.fetcher, url, {
        allowedHosts: this.allowedHosts,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Api-User-Agent": this.userAgent,
          "User-Agent": this.userAgent,
        },
      });
    } catch {
      return map;
    }
    if (!response.ok) return map;
    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch {
      return map;
    }
    const parsed = WikidataResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.error !== undefined) return map;
    for (const [id, entity] of Object.entries(parsed.data.entities)) {
      if (entity.missing !== undefined) continue;
      const label = localizedTerm(entity.labels, locale);
      if (label !== null) map.set(id, label);
    }
    return map;
  }
}
