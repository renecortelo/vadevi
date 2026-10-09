import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorEnvelopeSchema,
  SpaceIdPathSchema,
  WineStatsQuerySchema,
  WineStatsResponseSchema,
} from "@vadevi/contracts";

import { getPersonalStats, getSpaceStats } from "../repositories/stats";
import type { ApiEnvironment } from "../types";

const unauthorized = {
  content: { "application/json": { schema: ErrorEnvelopeSchema } },
  description: "Authentication required.",
};

const personalRoute = createRoute({
  method: "get",
  path: "/api/v1/me/stats",
  operationId: "getPersonalStats",
  tags: ["Stats"],
  summary: "The reader's own numbers across every Space they belong to",
  security: [{ FirebaseBearer: [] }],
  request: { query: WineStatsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: WineStatsResponseSchema } },
      description: "Counts of the reader's own notes, purchases and bottles.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The reader has no account yet.",
    },
  },
});

const spaceRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/stats",
  operationId: "getSpaceStats",
  tags: ["Stats"],
  summary: "Everyone's numbers in one Space",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema, query: WineStatsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: WineStatsResponseSchema } },
      description: "Counts of the Space's notes, purchases and bottles.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "No such Space, or the reader is not a member of it.",
    },
  },
});

function notFound(requestId: string) {
  return ErrorEnvelopeSchema.parse({
    error: { code: "NOT_FOUND", message: "The resource was not found.", requestId },
  });
}

export function registerStatsRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(personalRoute, async (context) => {
    const stats = await getPersonalStats(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("query"),
    );
    return stats === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(WineStatsResponseSchema.parse({ data: stats }), 200);
  });

  app.openapi(spaceRoute, async (context) => {
    const stats = await getSpaceStats(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("param").spaceId,
      context.req.valid("query"),
    );
    return stats === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(WineStatsResponseSchema.parse({ data: stats }), 200);
  });
}
