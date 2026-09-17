import type {
  ExternalCachePort,
  ExternalRateLimitPort,
  ExternalResult,
  PlaceCandidate,
  PlaceSearchPort,
  PlaceSearchRequest,
  ResearchLocale,
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

const nominatimHost = "nominatim.openstreetmap.org";

// Nominatim returns numbers as JSON strings ("41.3874"), so both are accepted and
// coerced once, here, rather than in three places downstream.
const CoordinateSchema = z.union([z.number(), z.string()]);

const NominatimPlaceSchema = z
  .object({
    address: z.record(z.string(), z.unknown()).optional(),
    display_name: z.string().optional(),
    lat: CoordinateSchema.optional(),
    lon: CoordinateSchema.optional(),
    name: z.string().optional(),
  })
  .passthrough();

const NominatimSearchSchema = z.array(NominatimPlaceSchema);

function coordinate(value: number | string | undefined, limit: number): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) return null;
  // Six decimals is ~0.1 m — finer than any venue needs, and it keeps the stored
  // value stable so the same place twice is the same pair of numbers twice.
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const sanitized = sanitizeExternalText(value, max);
  return sanitized.value.length === 0 || sanitized.flaggedPromptLike ? null : sanitized.value;
}

/** The first address field that is present, in order of decreasing precision. */
function addressPart(
  address: Record<string, unknown> | undefined,
  keys: readonly string[],
  max: number,
): string | null {
  for (const key of keys) {
    const value = safeText(address?.[key], max);
    if (value !== null) return value;
  }
  return null;
}

const cityKeys = ["city", "town", "village", "municipality", "hamlet"] as const;
const areaKeys = [
  "neighbourhood",
  "suburb",
  "quarter",
  "city_district",
  "county",
  "state",
] as const;
const nameKeys = ["amenity", "shop", "building", "road"] as const;

/**
 * One Nominatim result as a place we are willing to store. A result without
 * usable coordinates is dropped rather than kept as a name with no point, since a
 * venue that cannot be put on a map is exactly what typing the name by hand
 * already gave us.
 */
function toCandidate(entry: z.infer<typeof NominatimPlaceSchema>): PlaceCandidate | null {
  const latitude = coordinate(entry.lat, 90);
  const longitude = coordinate(entry.lon, 180);
  if (latitude === null || longitude === null) return null;
  const displayName = safeText(entry.display_name, 300);
  if (displayName === null) return null;
  const address = entry.address;
  const name =
    safeText(entry.name, 200) ??
    addressPart(address, nameKeys, 200) ??
    // No name of its own — a bare point or an address. The first segment of the
    // display name is the closest thing to one.
    safeText(displayName.split(",")[0], 200) ??
    displayName.slice(0, 200);
  const countryRaw = safeText(address?.country_code, 8);
  return {
    area: addressPart(address, areaKeys, 160),
    city: addressPart(address, cityKeys, 160),
    countryCode:
      countryRaw !== null && /^[a-z]{2}$/i.test(countryRaw) ? countryRaw.toUpperCase() : null,
    displayName,
    latitude,
    longitude,
    name,
  };
}

/**
 * Great-circle distance in kilometres. Only ever used to ORDER results, so the
 * spherical approximation is far more precision than the job needs.
 */
function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const radians = Math.PI / 180;
  const meanLatitude = ((from.latitude + to.latitude) / 2) * radians;
  const northing = (to.latitude - from.latitude) * radians;
  const easting = (to.longitude - from.longitude) * radians * Math.cos(meanLatitude);
  return Math.sqrt(northing * northing + easting * easting) * 6_371;
}

/**
 * The six results the reader sees: nearest first when we know where they are.
 *
 * Applied on the way out of the cache as well as on the way in, so a reader in
 * one town never inherits the ordering of whoever warmed the cache from the next
 * one — the cache key only distinguishes positions to a tenth of a degree.
 */
function order(
  places: readonly PlaceCandidate[],
  near: { latitude: number; longitude: number } | undefined,
): PlaceCandidate[] {
  const sorted = [...places];
  if (near !== undefined) sorted.sort((a, b) => distanceKm(near, a) - distanceKm(near, b));
  return sorted.slice(0, 6);
}

/**
 * Nominatim (OpenStreetMap) as a fixed-host place provider.
 *
 * It is the open-data geocoder that matches the rest of this application: no key
 * to hold, no per-request contract with an advertising company, and its data is
 * ODbL — attributable, which the UI does. Its usage policy asks for one request a
 * second and a contact user agent; both are enforced here, along with the cache
 * that means typing the same venue twice asks once.
 *
 * Every returned string is untrusted external text: sanitized, length-bounded,
 * and rejected when it looks like an instruction.
 */
export class NominatimPlaceSearchAdapter implements PlaceSearchPort {
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
    this.allowedHosts = new Set([nominatimHost]);
    // A venue does not move. A week of cache turns "the same bar again" into no
    // request at all, which is the politest thing to do with a donated service.
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? 7 * 24 * 60 * 60 * 1_000;
    this.fetcher = options.fetcher ?? fetch;
    // Nominatim's usage policy is one request per second, absolute. Staying at 30
    // a minute across the whole deployment keeps us comfortably inside it.
    this.limitPerMinute = Math.min(options.limitPerMinute ?? 30, 60);
    this.now = options.now ?? (() => new Date());
  }

  /**
   * The shared call: rate limit, fetch, parse, order, cache.
   *
   * When the reader's position is known the results are ordered by distance from
   * it. Nominatim's viewbox only *biases* its ranking, which in practice still
   * put a same-named bar in another country above the one down the road — so the
   * ordering is done here rather than hoped for.
   */
  private async lookup(
    url: URL,
    cacheKey: string,
    near?: { latitude: number; longitude: number },
  ): Promise<ExternalResult<PlaceCandidate[]>> {
    const now = this.now();
    const nowTimestamp = now.toISOString();
    // The version in this key is part of the contract: bump it whenever the SHAPE
    // of a stored candidate changes, or the old shape is served until the TTL
    // expires and a deployed fix looks like it never deployed.
    const cached = await this.cache.get<PlaceCandidate[]>("places", cacheKey, nowTimestamp);
    if (cached !== null) return { cached: true, data: order(cached, near), status: "success" };

    const rate = await this.rateLimiter.consume("places", this.limitPerMinute, 60, nowTimestamp);
    if (!rate.allowed) {
      return {
        reason: "rate_limited",
        retryAfterSeconds: rate.retryAfterSeconds,
        status: "unavailable",
      };
    }

    let response: Response;
    try {
      response = await fetchFromProvider(this.fetcher, url, {
        allowedHosts: this.allowedHosts,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          // Nominatim's policy requires an identifying agent with a contact.
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
    // Reverse geocoding answers with a single object, search with an array; both
    // are read the same way.
    const parsed = NominatimSearchSchema.safeParse(Array.isArray(payload) ? payload : [payload]);
    if (!parsed.success) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }

    const found: PlaceCandidate[] = [];
    for (const entry of parsed.data) {
      const candidate = toCandidate(entry);
      if (candidate !== null) found.push(candidate);
    }
    const places = order(found, near);

    await this.cache.put(
      "places",
      cacheKey,
      places,
      new Date(now.getTime() + this.cacheTtlMilliseconds).toISOString(),
      nowTimestamp,
    );
    return { cached: false, data: places, status: "success" };
  }

  async reverse(input: {
    latitude: number;
    locale: ResearchLocale;
    longitude: number;
  }): Promise<ExternalResult<PlaceCandidate[]>> {
    const latitude = coordinate(input.latitude, 90);
    const longitude = coordinate(input.longitude, 180);
    if (latitude === null || longitude === null) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const url = new URL(`https://${nominatimHost}/reverse`);
    for (const [name, value] of Object.entries({
      addressdetails: "1",
      format: "jsonv2",
      lat: latitude.toFixed(6),
      lon: longitude.toFixed(6),
      // Zoom 18 is building level: the bar, not the street or the city.
      zoom: "18",
    })) {
      url.searchParams.set(name, value);
    }
    url.searchParams.set("accept-language", input.locale);
    return this.lookup(
      url,
      `nominatim-reverse-v1:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${input.locale}`,
    );
  }

  /** One search URL. `bounded` restricts to the box instead of merely biasing. */
  private searchUrl(
    query: string,
    locale: ResearchLocale,
    near: { latitude: number; longitude: number } | null,
    bounded = false,
  ): URL {
    const url = new URL(`https://${nominatimHost}/search`);
    for (const [name, value] of Object.entries({
      addressdetails: "1",
      format: "jsonv2",
      // With a position to order by, ask for a wider net and keep the six
      // nearest: the closest match is often not in the provider's own top six.
      limit: near === null ? "6" : "20",
      q: query,
    })) {
      url.searchParams.set(name, value);
    }
    url.searchParams.set("accept-language", locale);
    if (near !== null) {
      const box = 0.5;
      url.searchParams.set(
        "viewbox",
        [near.longitude - box, near.latitude - box, near.longitude + box, near.latitude + box]
          .map((value) => value.toFixed(3))
          .join(","),
      );
      if (bounded) url.searchParams.set("bounded", "1");
    }
    return url;
  }

  async search(input: PlaceSearchRequest): Promise<ExternalResult<PlaceCandidate[]>> {
    const query = input.query.trim().slice(0, 200);
    if (query.length < 3) {
      return { reason: "invalid_input", retryAfterSeconds: null, status: "unavailable" };
    }
    const near =
      input.near === undefined
        ? null
        : (() => {
            const latitude = coordinate(input.near.latitude, 90);
            const longitude = coordinate(input.near.longitude, 180);
            return latitude === null || longitude === null ? null : { latitude, longitude };
          })();

    // Each pass caches under its own key: the near and wide answers to the same
    // words are different lists, and serving one for the other is how a bumped
    // cache shape has caught us out before.
    const key = (scope: "near" | "wide" | "any") =>
      `nominatim-search-v3:${scope}:${query.toLowerCase()}:${input.locale}` +
      (near === null ? "" : `:${near.latitude.toFixed(1)},${near.longitude.toFixed(1)}`);

    if (near === null) {
      return this.lookup(this.searchUrl(query, input.locale, null), key("any"));
    }

    // Restricted to the reader's own region first.
    //
    // A viewbox alone only *biases* the provider's ranking, and a small local
    // place carries little global weight: a wine bar in Barcelona did not make
    // the provider's top twenty for its own name, while matches in France and
    // Mallorca did. Searching inside the box finds it, because it is no longer
    // competing with the whole planet.
    //
    // The box stays coarse, roughly ±55 km, so what reaches the provider is a
    // region rather than a doorstep; the ordering by distance uses the precise
    // position, which never leaves this Worker.
    const bounded = await this.lookup(
      this.searchUrl(query, input.locale, near, true),
      key("near"),
      near,
    );
    if (bounded.status === "success" && bounded.data.length > 0) return bounded;

    // Nothing nearby. The reader may be planning a trip, or the place may simply
    // not be mapped near them, so the search widens rather than ending here —
    // one extra request, and only when the first found nothing.
    return this.lookup(this.searchUrl(query, input.locale, near, false), key("wide"), near);
  }
}
