import {
  type LibraryAromaCountsResponse,
  LibraryAromaCountsResponseSchema,
  type LibraryPairingsResponse,
  LibraryPairingsResponseSchema,
  type LibraryRegionSearchResponse,
  type LibraryAtlasCoverageResponse,
  LibraryAtlasCoverageResponseSchema,
  type LibraryGrape,
  LibraryGrapeResponseSchema,
  type LibraryRegion,
  LibraryRegionNamesResponseSchema,
  LibraryRegionResponseSchema,
  LibraryRegionSearchResponseSchema,
  type LibrarySearchResponse,
  LibrarySearchResponseSchema,
  type LibraryTopic,
  LibraryTopicResponseSchema,
  LibraryTopicsResponseSchema,
  type SupportedLocale,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/** The wine library: reference cards, the same for every reader. */
export async function getLibraryGrape(
  tokenSource: TokenSource,
  grapeId: string,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibraryGrape | null> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/grapes/${encodeURIComponent(grapeId)}?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await apiError(response);
  return LibraryGrapeResponseSchema.parse(await response.json()).data;
}

/** The library's grapes going by this name, best known first. */
export async function searchLibraryGrapes(
  tokenSource: TokenSource,
  query: string,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<{ id: string; name: string }[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/grapes?query=${encodeURIComponent(query)}&locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibrarySearchResponseSchema.parse(await response.json()).data;
}

/** A registered wine name's atlas entry. */
export async function getLibraryRegion(
  tokenSource: TokenSource,
  regionId: string,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibraryRegion | null> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/regions/${encodeURIComponent(regionId)}?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await apiError(response);
  return LibraryRegionResponseSchema.parse(await response.json()).data;
}

/** Registered wine names going by this name, optionally in one country. */
export async function searchLibraryRegions(
  tokenSource: TokenSource,
  query: string,
  country: string | null,
  signal?: AbortSignal,
): Promise<{ countryCode: string; id: string; name: string }[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/regions?query=${encodeURIComponent(query)}${
      country === null ? "" : `&country=${encodeURIComponent(country.toUpperCase())}`
    }`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryRegionSearchResponseSchema.parse(await response.json()).data;
}

/** Every grape in the library, named in the reader's language. */
export async function listLibraryGrapes(
  tokenSource: TokenSource,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibrarySearchResponse["data"]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/grapes?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibrarySearchResponseSchema.parse(await response.json()).data;
}

/** Every aroma of the library's vocabulary, named, with how many grapes carry it. */
export async function getLibraryAromaCounts(
  tokenSource: TokenSource,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibraryAromaCountsResponse["data"]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/aromas?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryAromaCountsResponseSchema.parse(await response.json()).data;
}

/** Each family of dishes with the grapes that go with it: the pairing wheel. */
export async function getLibraryPairings(
  tokenSource: TokenSource,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibraryPairingsResponse["data"]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/pairings?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryPairingsResponseSchema.parse(await response.json()).data;
}

/** The grapes whose sources name an aroma. */
export async function listGrapesWithAroma(
  tokenSource: TokenSource,
  term: string,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibrarySearchResponse["data"]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/grapes?aroma=${encodeURIComponent(term)}&locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibrarySearchResponseSchema.parse(await response.json()).data;
}

/** Every registered wine name of one country. */
export async function listLibraryRegions(
  tokenSource: TokenSource,
  country: string,
  signal?: AbortSignal,
): Promise<LibraryRegionSearchResponse["data"]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/regions?country=${encodeURIComponent(country.toUpperCase())}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryRegionSearchResponseSchema.parse(await response.json()).data;
}

/** The atlas in figures: what the library knows of each country's names. */
export async function getLibraryAtlasCoverage(
  tokenSource: TokenSource,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibraryAtlasCoverageResponse["data"]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/atlas/coverage?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryAtlasCoverageResponseSchema.parse(await response.json()).data;
}

/** Every style and method, explained in the reader's language. */
export async function listLibraryTopics(
  tokenSource: TokenSource,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibraryTopic[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/topics?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryTopicsResponseSchema.parse(await response.json()).data;
}

/** One style or method. */
export async function getLibraryTopic(
  tokenSource: TokenSource,
  topicId: string,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<LibraryTopic | null> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/topics/${encodeURIComponent(topicId)}?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await apiError(response);
  return LibraryTopicResponseSchema.parse(await response.json()).data;
}

/** Registered names by id, as the register writes them. */
export async function getLibraryRegionNames(
  tokenSource: TokenSource,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<{ id: string; name: string }[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/region-names?ids=${encodeURIComponent(ids.join(","))}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryRegionNamesResponseSchema.parse(await response.json()).data;
}

/**
 * Every winery the producer field may suggest, as `[name, country]` pairs
 * (Wikidata and OpenStreetMap; `pnpm kb:build-wineries`): one static file,
 * fetched the first time the field is used and searched in the browser.
 */
export async function loadWineryList(signal?: AbortSignal): Promise<[string, string][]> {
  const response = await fetch("/library/wineries.json", signal === undefined ? {} : { signal });
  if (!response.ok) throw new Error(`Winery list: ${response.status}`);
  return ((await response.json()) as { wineries: [string, string][] }).wineries;
}
