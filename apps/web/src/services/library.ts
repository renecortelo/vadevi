import {
  type LibraryGrape,
  LibraryGrapeResponseSchema,
  type LibraryRegion,
  LibraryRegionResponseSchema,
  LibraryRegionSearchResponseSchema,
  LibrarySearchResponseSchema,
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
): Promise<{ id: string; name: string }[]> {
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
