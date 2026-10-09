import {
  type LibraryGrape,
  LibraryGrapeResponseSchema,
  type LibraryRegion,
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

/** Every registered wine name of one country. */
export async function listLibraryRegions(
  tokenSource: TokenSource,
  country: string,
  signal?: AbortSignal,
): Promise<{ countryCode: string; giType: "PDO" | "PGI"; id: string; name: string }[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/library/regions?country=${encodeURIComponent(country.toUpperCase())}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return LibraryRegionSearchResponseSchema.parse(await response.json()).data;
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
