import type {
  ExternalCachePort,
  ExternalRateLimitPort,
  ExternalResult,
  FoodPairingPort,
  FoodPairingRequest,
  FoodPairingResult,
  PairingWineStyle,
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

const sommelierXUrl = new URL("https://api.sommelierx.com/api/v1/pairing/by-text");

const PairingResponseSchema = z
  .object({
    data: z
      .object({
        pairing_results: z
          .array(
            z
              .object({
                rank: z.number().optional(),
                score: z
                  .object({ match_percentage: z.number().nullable().optional() })
                  .passthrough()
                  .optional(),
                wineType: z
                  .object({
                    color: z.string().nullable().optional(),
                    country: z.string().nullable().optional(),
                    description: z.string().nullable().optional(),
                    grapes: z.array(z.string()).optional(),
                    name: z.string(),
                    region: z.string().nullable().optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

function providerLocale(locale: string) {
  return locale === "pt-PT" ? "pt" : locale;
}

/** Bounded, prompt-safe text or null — the provider's strings are external. */
function safeText(value: string | null | undefined, max: number): string | null {
  const sanitized = sanitizeExternalText(value ?? "", max);
  return sanitized.value.length === 0 || sanitized.flaggedPromptLike ? null : sanitized.value;
}

export class SommelierXAdapter implements FoodPairingPort {
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
    private readonly apiKey: string,
    options: {
      cacheTtlMilliseconds?: number;
      fetcher?: ProviderFetcher;
      limitPerMinute?: number;
      now?: () => Date;
    } = {},
  ) {
    this.baseUrl = new URL(sommelierXUrl);
    this.allowedHosts = new Set([this.baseUrl.hostname.toLowerCase()]);
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? 24 * 60 * 60 * 1_000;
    this.fetcher = options.fetcher ?? fetch;
    this.limitPerMinute = Math.min(options.limitPerMinute ?? 30, 100);
    this.now = options.now ?? (() => new Date());
  }

  async pair(input: FoodPairingRequest): Promise<ExternalResult<FoodPairingResult>> {
    const dish = input.dish.trim().slice(0, 300);
    if (dish.length < 2) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const locale = providerLocale(input.locale);
    const now = this.now();
    const nowTimestamp = now.toISOString();
    const cacheKey = `pairing-v1:${dish.toLowerCase()}:${locale}`;
    const cached = await this.cache.get<FoodPairingResult>("sommelierx", cacheKey, nowTimestamp);
    if (cached !== null) return { cached: true, data: cached, status: "success" };

    const rate = await this.rateLimiter.consume(
      "sommelierx",
      this.limitPerMinute,
      60,
      nowTimestamp,
    );
    if (!rate.allowed) {
      return {
        reason: "rate_limited",
        retryAfterSeconds: rate.retryAfterSeconds,
        status: "unavailable",
      };
    }

    let response: Response;
    try {
      response = await fetchFromProvider(this.fetcher, this.baseUrl, {
        allowedHosts: this.allowedHosts,
        body: JSON.stringify({ language: locale, text: dish }),
        headers: {
          Accept: "application/json",
          "Api-User-Agent": this.userAgent,
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
        },
        method: "POST",
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
    const parsed = PairingResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    const styles: PairingWineStyle[] = [];
    for (const entry of parsed.data.data.pairing_results ?? []) {
      const name = safeText(entry.wineType.name, 120);
      if (name === null) continue;
      const grapes = (entry.wineType.grapes ?? [])
        .map((grape) => safeText(grape, 80))
        .filter((grape): grape is string => grape !== null)
        .slice(0, 12);
      const rawPercent = entry.score?.match_percentage ?? null;
      styles.push({
        color: safeText(entry.wineType.color, 40),
        country: safeText(entry.wineType.country, 80),
        description: safeText(entry.wineType.description, 600),
        grapes,
        matchPercent:
          typeof rawPercent === "number" && Number.isFinite(rawPercent)
            ? Math.max(0, Math.min(100, Math.round(rawPercent)))
            : null,
        name,
        rank:
          typeof entry.rank === "number" && Number.isFinite(entry.rank)
            ? entry.rank
            : styles.length + 1,
        region: safeText(entry.wineType.region, 120),
      });
      if (styles.length >= 8) break;
    }
    const result: FoodPairingResult = { provider: "sommelierx", styles };
    await this.cache.put(
      "sommelierx",
      cacheKey,
      result,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: result, status: "success" };
  }
}
