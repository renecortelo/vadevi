import {
  type PlaceCandidatesResponse,
  PlaceCandidatesResponseSchema,
  type SupportedLocale,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

export type Place = PlaceCandidatesResponse["data"]["places"][number];

/**
 * Venue lookup, always through our own Worker.
 *
 * The browser never contacts the geocoder itself — the CSP would not allow it,
 * and routing through the server is what keeps the provider from seeing the
 * reader's IP address on every keystroke.
 */
export async function searchPlaces(
  tokenSource: TokenSource,
  spaceId: string,
  query: string,
  locale: SupportedLocale,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<Place[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/places/search`,
    {
      body: JSON.stringify({ locale, query, ...(near === undefined ? {} : { near }) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw await apiError(response);
  return PlaceCandidatesResponseSchema.parse(await response.json()).data.places;
}

/** The place at a point, for a reader who is standing in it. */
export async function reversePlace(
  tokenSource: TokenSource,
  spaceId: string,
  latitude: number,
  longitude: number,
  locale: SupportedLocale,
  signal?: AbortSignal,
): Promise<Place[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/places/reverse`,
    {
      body: JSON.stringify({ latitude, locale, longitude }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw await apiError(response);
  return PlaceCandidatesResponseSchema.parse(await response.json()).data.places;
}
