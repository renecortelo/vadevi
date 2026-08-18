import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  CreateResearchJobRequestSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  ResearchCandidatesQuerySchema,
  ResearchCandidatesResponseSchema,
  ResearchJobPathSchema,
  ResearchJobResponseSchema,
  WineFactsPathSchema,
} from "@vadevi/contracts";

import { createResearchPorts } from "../adapters/research-factory";
import { createResearchJob, getResearchJob, researchCandidates } from "../repositories/research";
import { reserveProviderBudget } from "../services/usage";
import type { ApiEnvironment } from "../types";

const IdempotencyHeadersSchema = z.object({
  "Idempotency-Key": IdempotencyKeySchema.openapi({
    param: { in: "header", name: "Idempotency-Key" },
  }),
});

const startResearchRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/research-jobs",
  operationId: "createResearchJob",
  tags: ["Research"],
  summary: "Run bounded optional enrichment and store only proposed cited facts",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: WineFactsPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateResearchJobRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ResearchJobResponseSchema } },
      description: "Completed or explicitly degraded bounded research job.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The research request is invalid.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication is required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The authorized wine is unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The idempotency key conflicts with an earlier request.",
    },
  },
});

const getResearchRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/research-jobs/{jobId}",
  operationId: "getResearchJob",
  tags: ["Research"],
  summary: "Read an authorized research job without provider payloads",
  security: [{ FirebaseBearer: [] }],
  request: { params: ResearchJobPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchJobResponseSchema } },
      description: "Bounded job status, safe attempts, and created resource IDs.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication is required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The research job is unavailable to the caller.",
    },
  },
});

const researchCandidatesRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/research-candidates",
  operationId: "researchCandidates",
  tags: ["Research"],
  summary: "Offer matching Wikidata entities for the wine's producer and region",
  security: [{ FirebaseBearer: [] }],
  request: { params: WineFactsPathSchema, query: ResearchCandidatesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchCandidatesResponseSchema } },
      description: "Matching entities per subject for the reader to disambiguate.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication is required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The authorized wine is unavailable.",
    },
  },
});

function errorEnvelope(
  requestId: string,
  code: "IDEMPOTENCY_CONFLICT" | "NOT_FOUND",
  message: string,
) {
  return ErrorEnvelopeSchema.parse({ error: { code, message, requestId } });
}

export function registerResearchRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(startResearchRoute, async (context) => {
    const params = context.req.valid("param");
    const ports = createResearchPorts(context.env.DB!, context.env);
    // At the daily research cap the job runs with disabled providers, which
    // yields the same explicit degraded result as an unconfigured deployment.
    const withinBudget =
      ports.providerMode === "none" ||
      (await reserveProviderBudget(context.env.DB!, {
        firebaseUid: context.get("principal").firebaseUid,
        metric: "research_lookups",
        nowIso: new Date().toISOString(),
        spaceId: params.spaceId,
      }));
    const result = await createResearchJob(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      ports: withinBudget ? ports : { knowledge: null, product: null, providerMode: "none" },
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
      wineId: params.wineId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The command conflicts with an earlier request."
            : "The resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    context.header(
      "Location",
      `/api/v1/spaces/${params.spaceId}/research-jobs/${result.response.data.id}`,
    );
    return context.json(ResearchJobResponseSchema.parse(result.response), 201);
  });

  app.openapi(researchCandidatesRoute, async (context) => {
    const params = context.req.valid("param");
    const query = context.req.valid("query");
    const ports = createResearchPorts(context.env.DB!, context.env);
    const result = await researchCandidates(context.env.DB!, {
      locale: query.locale,
      ports,
      principal: context.get("principal"),
      spaceId: params.spaceId,
      wineId: params.wineId,
    });
    return result === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(ResearchCandidatesResponseSchema.parse(result), 200);
  });

  app.openapi(getResearchRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await getResearchJob(context.env.DB!, {
      jobId: params.jobId,
      principal: context.get("principal"),
      spaceId: params.spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(ResearchJobResponseSchema.parse(response), 200);
  });
}
