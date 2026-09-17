import {
  DeleteAccountRequestSchema,
  DeleteSpaceRequestSchema,
  DeletionJobResponseSchema,
  ExportDocumentSchema,
  ExportMediaRequestSchema,
  LeaveSpaceRequestSchema,
  MergeWinesRequestSchema,
  MergeWinesResponseSchema,
  UsageReportResponseSchema,
  type DeletionJobResponse,
  type ExportDocument,
  type MergeWinesRequest,
  type MergeWinesResponse,
  type UsageReportResponse,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/**
 * Data-rights and confirmed-merge clients.
 *
 * These live outside `api.ts` so their contract schemas load with the lazy
 * routes that use them instead of weighing down the initial bundle.
 */

export async function mergeWines(
  tokenSource: TokenSource,
  spaceId: string,
  targetWineId: string,
  request: MergeWinesRequest,
): Promise<MergeWinesResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${targetWineId}/merge`,
    {
      body: JSON.stringify(MergeWinesRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return MergeWinesResponseSchema.parse(await response.json());
}

export async function getSpaceExport(
  tokenSource: TokenSource,
  spaceId: string,
  signal?: AbortSignal,
): Promise<ExportDocument> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/export`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return ExportDocumentSchema.parse(await response.json());
}

/** One selected CSV dataset, returned as text so the caller decides how to save it. */
export async function getSpaceCsvExport(
  tokenSource: TokenSource,
  spaceId: string,
  dataset: string,
): Promise<string> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/export?format=csv&dataset=${encodeURIComponent(dataset)}`,
  );
  if (!response.ok) throw await apiError(response);
  return response.text();
}

/** Media bytes leave the Space only for an explicit selection. */
export async function getSelectedMediaArchive(
  tokenSource: TokenSource,
  spaceId: string,
  mediaIds: string[],
): Promise<Blob> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/export/media`, {
    body: JSON.stringify(ExportMediaRequestSchema.parse({ confirm: true, mediaIds })),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return response.blob();
}

export async function scheduleSpaceDeletion(
  tokenSource: TokenSource,
  spaceId: string,
  confirmationText: string,
): Promise<DeletionJobResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/deletion`, {
    body: JSON.stringify(DeleteSpaceRequestSchema.parse({ confirm: true, confirmationText })),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return DeletionJobResponseSchema.parse(await response.json());
}

export async function cancelSpaceDeletion(
  tokenSource: TokenSource,
  spaceId: string,
): Promise<DeletionJobResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/deletion/cancel`,
    { method: "POST" },
  );
  if (!response.ok) throw await apiError(response);
  return DeletionJobResponseSchema.parse(await response.json());
}

export async function leaveSpace(
  tokenSource: TokenSource,
  spaceId: string,
  pseudonymizeAuthorship: boolean,
): Promise<void> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/leave`, {
    body: JSON.stringify(LeaveSpaceRequestSchema.parse({ confirm: true, pseudonymizeAuthorship })),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
}

export async function scheduleAccountDeletion(
  tokenSource: TokenSource,
): Promise<DeletionJobResponse> {
  const response = await authenticatedFetch(tokenSource, "/api/v1/me/deletion", {
    body: JSON.stringify(
      DeleteAccountRequestSchema.parse({ confirm: true, confirmationText: "DELETE" }),
    ),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return DeletionJobResponseSchema.parse(await response.json());
}

export async function getUsageReport(
  tokenSource: TokenSource,
  spaceId: string,
  signal?: AbortSignal,
): Promise<UsageReportResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/usage`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return UsageReportResponseSchema.parse(await response.json());
}
