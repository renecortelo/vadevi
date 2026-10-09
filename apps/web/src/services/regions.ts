import {
  type GrapeProposal,
  GrapeProposalsResponseSchema,
  type ProducerProposal,
  ProducerProposalsResponseSchema,
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

/** What could be tidied among a Space's producers. */
export async function getProducerProposals(
  tokenSource: TokenSource,
  spaceId: string,
  signal?: AbortSignal,
): Promise<ProducerProposal[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${encodeURIComponent(spaceId)}/producers/tidy`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return ProducerProposalsResponseSchema.parse(await response.json()).data;
}

/** Rename every wine in the Space by one of these producer spellings. */
export async function renameProducers(
  tokenSource: TokenSource,
  spaceId: string,
  from: string[],
  to: string,
): Promise<number> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${encodeURIComponent(spaceId)}/producers/tidy`,
    {
      body: JSON.stringify({ from, to }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return RenameRegionsResponseSchema.parse(await response.json()).data.renamed;
}

/** What could be tidied among a Space's grapes, named in the reader's language. */
export async function getGrapeProposals(
  tokenSource: TokenSource,
  spaceId: string,
  locale: string,
  signal?: AbortSignal,
): Promise<GrapeProposal[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${encodeURIComponent(spaceId)}/grapes/tidy?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return GrapeProposalsResponseSchema.parse(await response.json()).data;
}

/** Rename a grape on every wine in the Space that lists it one of these ways. */
export async function renameGrapes(
  tokenSource: TokenSource,
  spaceId: string,
  from: string[],
  to: string,
): Promise<number> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${encodeURIComponent(spaceId)}/grapes/tidy`,
    {
      body: JSON.stringify({ from, to }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return RenameRegionsResponseSchema.parse(await response.json()).data.renamed;
}
