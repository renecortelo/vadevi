import { type WineStats, WineStatsResponseSchema } from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

export type StatsPeriod = Readonly<{ from?: string; to?: string }>;

/**
 * The reader's numbers: their own across every Space (`spaceId` null), or
 * everyone's in one Space.
 */
export async function getStats(
  tokenSource: TokenSource,
  spaceId: string | null,
  period: StatsPeriod,
  signal?: AbortSignal,
): Promise<WineStats> {
  const query = new URLSearchParams();
  if (period.from !== undefined) query.set("from", period.from);
  if (period.to !== undefined) query.set("to", period.to);
  const path =
    spaceId === null ? "/api/v1/me/stats" : `/api/v1/spaces/${encodeURIComponent(spaceId)}/stats`;
  const response = await authenticatedFetch(
    tokenSource,
    `${path}${query.size === 0 ? "" : `?${query.toString()}`}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return WineStatsResponseSchema.parse(await response.json()).data;
}
