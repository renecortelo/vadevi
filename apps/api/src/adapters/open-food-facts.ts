import type {
  BarcodeLookup,
  ExternalCachePort,
  ExternalRateLimitPort,
  ExternalResult,
  ProductCandidate,
  ProductLookupPort,
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

const openFoodFactsBaseUrl = new URL("https://world.openfoodfacts.org/api/v3.6/");

const OpenFoodFactsResponseSchema = z
  .object({
    product: z
      .object({
        brands: z.union([z.string(), z.array(z.string())]).optional(),
        categories_tags: z.array(z.string()).optional(),
        code: z.string().optional(),
        countries_tags: z.array(z.string()).optional(),
        product_name: z.string().optional(),
      })
      .passthrough()
      .optional(),
    status: z.string().optional(),
  })
  .passthrough();

function splitBrands(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : value.split(","))
    .map((brand) => sanitizeExternalText(brand, 160))
    .filter((brand) => brand.value.length > 0 && !brand.flaggedPromptLike)
    .map((brand) => brand.value)
    .slice(0, 20);
}

function boundedTags(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => sanitizeExternalText(value, 100))
    .filter((value) => value.value.length > 0 && !value.flaggedPromptLike)
    .map((value) => value.value)
    .slice(0, 30);
}

function providerLocale(locale: string) {
  return locale === "pt-PT" ? "pt" : locale;
}

export class OpenFoodFactsAdapter implements ProductLookupPort {
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
    this.baseUrl = new URL(openFoodFactsBaseUrl);
    this.allowedHosts = new Set([this.baseUrl.hostname.toLowerCase()]);
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? 24 * 60 * 60 * 1_000;
    this.fetcher = options.fetcher ?? fetch;
    this.limitPerMinute = Math.min(options.limitPerMinute ?? 10, 15);
    this.now = options.now ?? (() => new Date());
  }

  async lookupBarcode(input: BarcodeLookup): Promise<ExternalResult<ProductCandidate>> {
    const barcode = input.barcode.trim();
    if (!/^\d{8,14}$/.test(barcode)) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const now = this.now();
    const nowTimestamp = now.toISOString();
    const cacheKey = `v3.6:${barcode}:${providerLocale(input.locale)}`;
    const cached = await this.cache.get<ProductCandidate>(
      "open_food_facts",
      cacheKey,
      nowTimestamp,
    );
    if (cached !== null) return { cached: true, data: cached, status: "success" };

    const rate = await this.rateLimiter.consume(
      "open_food_facts",
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

    const url = new URL(`product/${barcode}`, this.baseUrl);
    url.searchParams.set("fields", "code,product_name,brands,categories_tags,countries_tags");
    url.searchParams.set("lc", providerLocale(input.locale));
    let response: Response;
    try {
      response = await fetchFromProvider(this.fetcher, url, {
        allowedHosts: this.allowedHosts,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
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
    if (response.status === 429 || response.status === 503) {
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
    const parsed = OpenFoodFactsResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.product === undefined) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }
    const product = parsed.data.product;
    const productName = sanitizeExternalText(product.product_name ?? "", 160);
    const safeName =
      productName.value.length === 0 || productName.flaggedPromptLike ? null : productName.value;
    const candidate: ProductCandidate = {
      barcode,
      brands: splitBrands(product.brands),
      categories: boundedTags(product.categories_tags),
      countryTags: boundedTags(product.countries_tags),
      name: safeName,
      provider: "open_food_facts",
      source: {
        canonicalUrl: `https://world.openfoodfacts.org/product/${barcode}`,
        licenseIdentifier: "ODbL-1.0",
        publisher: "Open Food Facts",
        retrievedAt: nowTimestamp,
        sourceType: "open_dataset",
        title: safeName ?? `Open Food Facts product ${barcode}`,
      },
      warnings: [
        "coverage_and_accuracy_uncertain",
        ...(safeName === null ? ["product_name_missing"] : []),
        ...(productName.flaggedPromptLike ? ["external_text_flagged"] : []),
        ...(productName.truncated ? ["external_text_truncated"] : []),
      ],
    };
    await this.cache.put(
      "open_food_facts",
      cacheKey,
      candidate,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: candidate, status: "success" };
  }
}
