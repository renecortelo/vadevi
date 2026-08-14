import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  AcceptFactRequestSchema,
  CreateSourceRequestSchema,
  CreateWineFactRequestSchema,
  ErrorEnvelopeSchema,
  FactIdPathSchema,
  FactResponseSchema,
  IdempotencyKeySchema,
  SourceIdPathSchema,
  SourceResponseSchema,
  SpaceIdPathSchema,
  WineFactsPathSchema,
  WineFactsResponseSchema,
} from "@vadevi/contracts";

import {
  acceptFact,
  createSource,
  createWineFact,
  getSource,
  listWineFacts,
} from "../repositories/provenance";
import type { ApiEnvironment } from "../types";

const IdempotencyHeadersSchema = z.object({
  "Idempotency-Key": IdempotencyKeySchema.openapi({
    param: { in: "header", name: "Idempotency-Key" },
  }),
});

const commonErrors = {
  400: {
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
    description: "Invalid request.",
  },
  401: {
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
    description: "Authentication required.",
  },
  404: {
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
    description: "The Space-scoped resource is unavailable.",
  },
};

const createSourceRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/sources",
  operationId: "createSource",
  tags: ["Provenance"],
  summary: "Store citation metadata without retaining a third-party page",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateSourceRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SourceResponseSchema } },
      description: "Stored citation metadata.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The idempotency key conflicts with an earlier request.",
    },
  },
});

const getSourceRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/sources/{sourceId}",
  operationId: "getSource",
  tags: ["Provenance"],
  summary: "Read one authorized source's citation metadata",
  security: [{ FirebaseBearer: [] }],
  request: { params: SourceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SourceResponseSchema } },
      description: "Citation metadata without cached page content.",
    },
    ...commonErrors,
  },
});

const createFactRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/facts",
  operationId: "createWineFact",
  tags: ["Provenance"],
  summary: "Create a proposed wine fact with typed evidence and citations",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: WineFactsPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateWineFactRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: FactResponseSchema } },
      description: "A proposed fact; researched facts always include a citation.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The idempotency key or client resource ID conflicts.",
    },
  },
});

const listFactsRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/facts",
  operationId: "listWineFacts",
  tags: ["Provenance"],
  summary: "List authorized wine facts, citations, and visible conflicts",
  security: [{ FirebaseBearer: [] }],
  request: { params: WineFactsPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: WineFactsResponseSchema } },
      description: "All current claims with alternatives preserved.",
    },
    ...commonErrors,
  },
});

const acceptFactRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/facts/{factId}/accept",
  operationId: "acceptFact",
  tags: ["Provenance"],
  summary: "Human-verify a preferred fact while preserving conflicting claims",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: FactIdPathSchema,
    body: {
      content: { "application/json": { schema: AcceptFactRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FactResponseSchema } },
      description: "The accepted preferred fact.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The fact version changed; current authorized data is returned.",
    },
  },
});

function errorEnvelope(
  requestId: string,
  code: "IDEMPOTENCY_CONFLICT" | "NOT_FOUND" | "VERSION_CONFLICT",
  message: string,
  current?: unknown,
) {
  return ErrorEnvelopeSchema.parse({
    error: {
      code,
      ...(current === undefined ? {} : { details: { current } }),
      message,
      requestId,
    },
  });
}

export function registerProvenanceRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(createSourceRoute, async (context) => {
    const result = await createSource(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
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
      `/api/v1/spaces/${context.req.valid("param").spaceId}/sources/${result.response.data.id}`,
    );
    return context.json(SourceResponseSchema.parse(result.response), 201);
  });

  app.openapi(getSourceRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await getSource(context.env.DB!, {
      principal: context.get("principal"),
      sourceId: params.sourceId,
      spaceId: params.spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(SourceResponseSchema.parse(response), 200);
  });

  app.openapi(createFactRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await createWineFact(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
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
    context.header("Location", `/api/v1/spaces/${params.spaceId}/facts/${result.response.data.id}`);
    return context.json(FactResponseSchema.parse(result.response), 201);
  });

  app.openapi(listFactsRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await listWineFacts(context.env.DB!, {
      principal: context.get("principal"),
      spaceId: params.spaceId,
      wineId: params.wineId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(WineFactsResponseSchema.parse(response), 200);
  });

  app.openapi(acceptFactRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await acceptFact(context.env.DB!, {
      factId: params.factId,
      principal: context.get("principal"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
      version: context.req.valid("json").version,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "VERSION_CONFLICT" : "NOT_FOUND",
          conflict ? "The fact changed; review the current claim." : "The resource was not found.",
          result.kind === "conflict" ? result.current?.data : undefined,
        ),
        conflict ? 409 : 404,
      );
    }
    return context.json(FactResponseSchema.parse(result.response), 200);
  });
}
