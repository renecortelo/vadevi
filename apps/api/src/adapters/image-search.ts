import type {
  ExternalCachePort,
  ExternalRateLimitPort,
  ExternalResult,
  ImageCandidate,
  ImageSearchPort,
  WebSearchRequest,
} from "@vadevi/domain";
import { sanitizeExternalText } from "@vadevi/domain";
import { z } from "zod";

import { braveLanguage, publicHttpsUrl } from "./web-search";
import {
  fetchFromProvider,
  ProviderFetchError,
  type ProviderFetcher,
  readBoundedJson,
  retryAfterSeconds,
} from "./provider-fetch";

const braveImageSearchUrl = new URL("https://api.search.brave.com/res/v1/images/search");

const BraveImageResponseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            thumbnail: z.object({ src: z.string() }).passthrough().optional(),
            title: z.string().optional(),
            url: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

/** Bounded, prompt-safe, tag-stripped text or null — provider strings are external. */
function safeText(value: string | null | undefined, max: number): string | null {
  const withoutTags = (value ?? "").replace(/<[^>]*>/g, " ");
  const sanitized = sanitizeExternalText(withoutTags, max);
  return sanitized.value.length === 0 || sanitized.flaggedPromptLike ? null : sanitized.value;
}

/**
 * The thumbnail must live on Brave's own image CDN. Accepting a candidate later
 * downloads this URL, so it has to be a fixed, trusted host — never wherever the
 * picture happens to be hosted. A public HTTPS URL under brave.com qualifies;
 * anything else is dropped.
 */
function braveThumbnailUrl(value: string | undefined): string | null {
  if (value === undefined) return null;
  const safe = publicHttpsUrl(value);
  if (safe === null) return null;
  return new URL(safe).hostname.toLowerCase().endsWith(".brave.com") ? safe : null;
}

/**
 * Brave's image search as a fixed-host provider, mirroring the web search. One
 * official API host answers, and every candidate's thumbnail is on Brave's own
 * CDN — so proposing photos, and later fetching the chosen one, never touches an
 * arbitrary host. Titles are treated as untrusted external text.
 */
export class BraveImageSearchAdapter implements ImageSearchPort {
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
    this.baseUrl = new URL(braveImageSearchUrl);
    this.allowedHosts = new Set([this.baseUrl.hostname.toLowerCase()]);
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? 24 * 60 * 60 * 1_000;
    this.fetcher = options.fetcher ?? fetch;
    this.limitPerMinute = Math.min(options.limitPerMinute ?? 60, 200);
    this.now = options.now ?? (() => new Date());
  }

  async search(input: WebSearchRequest): Promise<ExternalResult<ImageCandidate[]>> {
    const query = input.query.trim().slice(0, 300);
    if (query.length < 3) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const language = braveLanguage(input.locale);
    const now = this.now();
    const nowTimestamp = now.toISOString();
    // The version is part of the contract: bump it on any change to what is stored.
    const cacheKey = `brave-images-v1:${query.toLowerCase()}:${language}`;
    const cached = await this.cache.get<ImageCandidate[]>("image_search", cacheKey, nowTimestamp);
    if (cached !== null) return { cached: true, data: cached, status: "success" };

    const rate = await this.rateLimiter.consume(
      "image_search",
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

    const url = new URL(this.baseUrl);
    for (const [name, value] of Object.entries({
      count: "8",
      q: query,
      safesearch: "strict",
      search_lang: language,
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
          "X-Subscription-Token": this.apiKey,
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
      payload = await readBoundedJson(response, 512 * 1_024);
    } catch {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    const parsed = BraveImageResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }

    const candidates: ImageCandidate[] = [];
    for (const entry of parsed.data.results ?? []) {
      const thumbnailUrl = braveThumbnailUrl(entry.thumbnail?.src);
      const sourceUrl = entry.url === undefined ? null : publicHttpsUrl(entry.url);
      const title = safeText(entry.title, 200);
      if (thumbnailUrl === null || sourceUrl === null || title === null) continue;
      candidates.push({ sourceUrl, thumbnailUrl, title });
    }

    await this.cache.put(
      "image_search",
      cacheKey,
      candidates,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: candidates, status: "success" };
  }
}
