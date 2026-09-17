import type {
  ExternalCachePort,
  ExternalRateLimitPort,
  ExternalResult,
  WebSearchPort,
  WebSearchRequest,
  WebSearchResult,
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

const braveSearchUrl = new URL("https://api.search.brave.com/res/v1/web/search");

const BraveResponseSchema = z
  .object({
    web: z
      .object({
        results: z
          .array(
            z
              .object({
                description: z.string().optional(),
                title: z.string().optional(),
                url: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// Brave maps some of our locales to its own language codes; the rest pass through.
export function braveLanguage(locale: string): string {
  return locale === "pt-PT" ? "pt" : locale;
}

/** Bounded, prompt-safe, tag-stripped text or null — provider strings are external. */
// Search results are HTML fragments: providers bold the matched words and leave
// entities encoded. Stripping the tags without decoding the entities is what put
// a literal "&gt;" in front of the reader.
const htmlEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body.startsWith("#x") || body.startsWith("#X")
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return htmlEntities[body.toLowerCase()] ?? match;
  });
}

// A result whose text is mostly a page's own furniture — navigation, buttons,
// share links — says nothing about the wine. Better to drop it than to present
// "Print · Share · Hide Side Panel" as a curiosity.
const chromePattern =
  /\b(print|share|hide side panel|browse|add to (?:wishlist|cellar|cart)|sign in|log in|register|upload|next back|add new vintage|cookie|newsletter|subscribe|iniciar sesion|anadir al carrito|suscrib\w*)\b/gi;

function looksLikePageFurniture(text: string): boolean {
  const hits = text.match(chromePattern)?.length ?? 0;
  // Two or more of those phrases in one snippet is a navigation strip, not prose.
  return hits >= 2;
}

function safeText(value: string | null | undefined, max: number): string | null {
  const withoutTags = decodeEntities((value ?? "").replace(/<[^>]*>/g, " "));
  const sanitized = sanitizeExternalText(withoutTags, max);
  return sanitized.value.length === 0 || sanitized.flaggedPromptLike ? null : sanitized.value;
}

/**
 * A public https result URL we are willing to cite. This is a light gate mirroring
 * the strict persistence check: it keeps private, credentialed, or non-https URLs
 * out before they ever reach a proposal, so an odd search hit cannot become an
 * SSRF-shaped or unciteable source.
 */
export function publicHttpsUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return null;
  }
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet))) {
    const [first, second] = octets;
    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first! >= 224
    ) {
      return null;
    }
  }
  return url.toString();
}

/**
 * Brave Search as a fixed-host discovery provider. We call ONE official API host
 * and use its own result snippets and source URLs; the app never fetches the
 * arbitrary result pages, so the SSRF boundary the threat model guards is never
 * opened. Snippets are treated as untrusted external text throughout.
 */
export class BraveWebSearchAdapter implements WebSearchPort {
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
    this.baseUrl = new URL(braveSearchUrl);
    this.allowedHosts = new Set([this.baseUrl.hostname.toLowerCase()]);
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? 24 * 60 * 60 * 1_000;
    this.fetcher = options.fetcher ?? fetch;
    this.limitPerMinute = Math.min(options.limitPerMinute ?? 30, 100);
    this.now = options.now ?? (() => new Date());
  }

  async search(input: WebSearchRequest): Promise<ExternalResult<WebSearchResult[]>> {
    const query = input.query.trim().slice(0, 300);
    if (query.length < 3) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const language = braveLanguage(input.locale);
    const now = this.now();
    const nowTimestamp = now.toISOString();
    // The version in this key is part of the contract: the cached value has a
    // SHAPE, and changing how a result is built without bumping it serves the old
    // shape from cache until the TTL expires — which is exactly what made a
    // deployed fix look like it had not deployed at all. Bump on any change to
    // what is stored here.
    const cacheKey = `brave-v2:${query.toLowerCase()}:${language}`;
    const cached = await this.cache.get<WebSearchResult[]>("web_search", cacheKey, nowTimestamp);
    if (cached !== null) return { cached: true, data: cached, status: "success" };

    const rate = await this.rateLimiter.consume(
      "web_search",
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
      count: "5",
      q: query,
      safesearch: "moderate",
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
      payload = await readBoundedJson(response);
    } catch {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    const parsed = BraveResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }

    const results: WebSearchResult[] = [];
    for (const entry of parsed.data.web?.results ?? []) {
      const canonicalUrl = entry.url === undefined ? null : publicHttpsUrl(entry.url);
      const title = safeText(entry.title, 200);
      const snippet = safeText(entry.description, 600);
      if (canonicalUrl === null || title === null || snippet === null) continue;
      if (looksLikePageFurniture(snippet)) continue;
      results.push({
        snippet,
        source: {
          canonicalUrl,
          publisher: new URL(canonicalUrl).hostname.replace(/^www\./, ""),
          retrievedAt: nowTimestamp,
          sourceType: "other_web",
          title,
        },
        title,
      });
      if (results.length >= 4) break;
    }

    await this.cache.put(
      "web_search",
      cacheKey,
      results,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: results, status: "success" };
  }
}

const tavilySearchUrl = new URL("https://api.tavily.com/search");

const TavilyResponseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            content: z.string().optional(),
            title: z.string().optional(),
            url: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

/**
 * Tavily as an alternative discovery provider. Same contract as Brave — one fixed
 * host, snippets and source URLs, we never fetch pages ourselves — but Tavily
 * fetches and cleans the result pages on ITS side and returns longer extracted
 * `content`, which makes better narrative material. Its optional LLM "answer" is
 * deliberately ignored: grounding and citation stay ours.
 */
export class TavilyWebSearchAdapter implements WebSearchPort {
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
    this.baseUrl = new URL(tavilySearchUrl);
    this.allowedHosts = new Set([this.baseUrl.hostname.toLowerCase()]);
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? 24 * 60 * 60 * 1_000;
    this.fetcher = options.fetcher ?? fetch;
    this.limitPerMinute = Math.min(options.limitPerMinute ?? 30, 100);
    this.now = options.now ?? (() => new Date());
  }

  async search(input: WebSearchRequest): Promise<ExternalResult<WebSearchResult[]>> {
    const query = input.query.trim().slice(0, 300);
    if (query.length < 3) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const now = this.now();
    const nowTimestamp = now.toISOString();
    const cacheKey = `tavily-v2:${query.toLowerCase()}`;
    const cached = await this.cache.get<WebSearchResult[]>("web_search", cacheKey, nowTimestamp);
    if (cached !== null) return { cached: true, data: cached, status: "success" };

    const rate = await this.rateLimiter.consume(
      "web_search",
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
        body: JSON.stringify({ max_results: 5, query, search_depth: "basic" }),
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
    const parsed = TavilyResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }

    const results: WebSearchResult[] = [];
    for (const entry of parsed.data.results ?? []) {
      const canonicalUrl = entry.url === undefined ? null : publicHttpsUrl(entry.url);
      const title = safeText(entry.title, 200);
      const snippet = safeText(entry.content, 600);
      if (canonicalUrl === null || title === null || snippet === null) continue;
      if (looksLikePageFurniture(snippet)) continue;
      results.push({
        snippet,
        source: {
          canonicalUrl,
          publisher: new URL(canonicalUrl).hostname.replace(/^www\./, ""),
          retrievedAt: nowTimestamp,
          sourceType: "other_web",
          title,
        },
        title,
      });
      if (results.length >= 4) break;
    }

    await this.cache.put(
      "web_search",
      cacheKey,
      results,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: results, status: "success" };
  }
}
