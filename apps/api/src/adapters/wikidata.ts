import type {
  ExternalCachePort,
  ExternalRateLimitPort,
  ExternalResult,
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
      props: "labels|descriptions",
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
    const rawDescription = localizedTerm(entity.descriptions, locale);
    const sanitizedLabel = sanitizeExternalText(rawLabel ?? "", 300);
    const sanitizedDescription = sanitizeExternalText(rawDescription ?? "", 2_000);
    const label =
      sanitizedLabel.value.length === 0 || sanitizedLabel.flaggedPromptLike
        ? null
        : sanitizedLabel.value;
    const description =
      sanitizedDescription.value.length === 0 || sanitizedDescription.flaggedPromptLike
        ? null
        : sanitizedDescription.value;
    const source = {
      canonicalUrl: `https://www.wikidata.org/wiki/${entityId}`,
      licenseIdentifier: "CC0-1.0",
      publisher: "Wikidata",
      retrievedAt: nowTimestamp,
      sourceType: "open_dataset" as const,
      title: label ?? `Wikidata ${entityId}`,
    };
    const facts: ProposedFact[] = [];
    if (label !== null) {
      facts.push({
        confidenceMilli: 750,
        predicate:
          input.subjectType === "producer"
            ? "producer.name"
            : input.subjectType === "region"
              ? "region.name"
              : "identity.canonical_name",
        researchMethod: "wikidata.entity.v1",
        source,
        value: label,
      });
    }
    if (input.subjectType === "producer" && description !== null) {
      facts.push({
        confidenceMilli: 600,
        predicate: "producer.history",
        researchMethod: "wikidata.entity.v1",
        source,
        value: description,
      });
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
}
