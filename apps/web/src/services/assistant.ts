import {
  AssistantTurnRequestSchema,
  AssistantTurnResponseSchema,
  CreateResearchJobRequestSchema,
  FactResponseSchema,
  RegenerateNarrativeRequestSchema,
  RegenerateNarrativeResponseSchema,
  RejectFactRequestSchema,
  ResearchJobResponseSchema,
  WineFactsResponseSchema,
  type AssistantTurnRequest,
  type AssistantTurnResponse,
  type CreateResearchJobRequest,
  type FactResponse,
  type RegenerateNarrativeResponse,
  type RejectFactRequest,
  type ResearchJobResponse,
  type SupportedLocale,
  type WineFactsResponse,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/**
 * Evidence, research, and Vicenç clients. Only lazy routes reach these, so their
 * contract schemas stay out of the initial bundle.
 */

export async function getWineFacts(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  signal?: AbortSignal,
): Promise<WineFactsResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/facts`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return WineFactsResponseSchema.parse(await response.json());
}

export async function rejectFact(
  tokenSource: TokenSource,
  spaceId: string,
  factId: string,
  request: RejectFactRequest,
): Promise<FactResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/facts/${factId}/reject`,
    {
      body: JSON.stringify(RejectFactRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return FactResponseSchema.parse(await response.json());
}

export async function regenerateNarrative(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  locale: SupportedLocale,
): Promise<RegenerateNarrativeResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/narrative`,
    {
      body: JSON.stringify(RegenerateNarrativeRequestSchema.parse({ locale })),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return RegenerateNarrativeResponseSchema.parse(await response.json());
}

export async function createResearchJob(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  request: CreateResearchJobRequest,
  idempotencyKey: string,
): Promise<ResearchJobResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/research-jobs`,
    {
      body: JSON.stringify(CreateResearchJobRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return ResearchJobResponseSchema.parse(await response.json());
}

export async function getResearchJob(
  tokenSource: TokenSource,
  spaceId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<ResearchJobResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/research-jobs/${jobId}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return ResearchJobResponseSchema.parse(await response.json());
}
export async function createAssistantTurn(
  tokenSource: TokenSource,
  spaceId: string,
  request: AssistantTurnRequest,
): Promise<AssistantTurnResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/assistant/turns`,
    {
      body: JSON.stringify(AssistantTurnRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return AssistantTurnResponseSchema.parse(await response.json());
}
