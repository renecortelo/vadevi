import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  CreateResearchJobRequestSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  RegenerateNarrativeRequestSchema,
  RegenerateNarrativeResponseSchema,
  ResearchJobPathSchema,
  ResearchJobResponseSchema,
  WineFactsPathSchema,
} from "@vadevi/contracts";

import { createResearchPorts } from "../adapters/research-factory";
import { createResearchJob, getResearchJob, regenerateNarrative } from "../repositories/research";
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

const regenerateNarrativeRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/narrative",
  operationId: "regenerateNarrative",
  tags: ["Research"],
  summary: "Rewrite the wine's narrative from the facts that are still live",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: WineFactsPathSchema,
    body: {
      content: { "application/json": { schema: RegenerateNarrativeRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: RegenerateNarrativeResponseSchema } },
      description: "A fresh paragraph, or an explicit note that there was nothing to write from.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication is required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The authorized wine is unavailable, or no model is configured.",
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

  app.openapi(regenerateNarrativeRoute, async (context) => {
    const params = context.req.valid("param");
    const ports = createResearchPorts(context.env.DB!, context.env);
    // One model call, metered like the assistant's, and nothing else: no provider
    // lookup, so a reader tidying their evidence is not spending research budget.
    const withinBudget = await reserveProviderBudget(context.env.DB!, {
      firebaseUid: context.get("principal").firebaseUid,
      metric: "ai_language_calls",
      nowIso: new Date().toISOString(),
      spaceId: params.spaceId,
    });
    const outcome = withinBudget
      ? await regenerateNarrative(context.env.DB!, {
          locale: context.req.valid("json").locale,
          narrative: ports.narrative ?? null,
          principal: context.get("principal"),
          requestId: context.get("requestId"),
          spaceId: params.spaceId,
          wineId: params.wineId,
        })
      : "no_material";
    if (outcome === "unavailable") {
      return context.json(
        errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
        404,
      );
    }
    return context.json(
      RegenerateNarrativeResponseSchema.parse({
        data: { status: outcome === "ok" ? "regenerated" : "no_material" },
      }),
      200,
    );
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
