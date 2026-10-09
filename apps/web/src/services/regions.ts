import {
  type RegionProposal,
  RegionProposalsResponseSchema,
  RenameRegionsResponseSchema,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/** What could be tidied among a Space's regions. */
export async function getRegionProposals(
  tokenSource: TokenSource,
  spaceId: string,
  signal?: AbortSignal,
): Promise<RegionProposal[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${encodeURIComponent(spaceId)}/regions/tidy`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return RegionProposalsResponseSchema.parse(await response.json()).data;
}

/** Rename every wine in the Space written one of these ways. */
export async function renameRegions(
  tokenSource: TokenSource,
  spaceId: string,
  from: string[],
  to: string,
): Promise<number> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${encodeURIComponent(spaceId)}/regions/tidy`,
    {
      body: JSON.stringify({ from, to }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return RenameRegionsResponseSchema.parse(await response.json()).data.renamed;
}
