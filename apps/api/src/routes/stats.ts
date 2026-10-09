import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorEnvelopeSchema,
  SpaceIdPathSchema,
  TasteDeclarationResponseSchema,
  TasteProfileResponseSchema,
  UpdateTasteDeclarationRequestSchema,
  WineStatsQuerySchema,
  WineStatsResponseSchema,
} from "@vadevi/contracts";

import { getPersonalStats, getSpaceStats } from "../repositories/stats";
import { getTasteDeclaration, saveTasteDeclaration } from "../repositories/taste-declaration";
import { getTasteProfile } from "../repositories/taste-profile";
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

const tasteRoute = createRoute({
  method: "get",
  path: "/api/v1/me/taste-profile",
  operationId: "getTasteProfile",
  tags: ["Stats"],
  summary: "The reader's taste, read from their own tastings and purchases",
  security: [{ FirebaseBearer: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: TasteProfileResponseSchema } },
      description: "Traits measured against the reader's own average, with the wines behind them.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The reader has no account yet.",
    },
  },
});

const declarationRoute = createRoute({
  method: "get",
  path: "/api/v1/me/taste-declaration",
  operationId: "getTasteDeclaration",
  tags: ["Stats"],
  summary: "What the reader says of their own taste",
  security: [{ FirebaseBearer: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: TasteDeclarationResponseSchema } },
      description: "The reader's own words; empty, at version 0, until saved.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The reader has no account yet.",
    },
  },
});

const saveDeclarationRoute = createRoute({
  method: "put",
  path: "/api/v1/me/taste-declaration",
  operationId: "saveTasteDeclaration",
  tags: ["Stats"],
  summary: "Say what the reader likes, dislikes, explores and spends",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: UpdateTasteDeclarationRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TasteDeclarationResponseSchema } },
      description: "Saved.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The reader has no account yet.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Saved meanwhile from elsewhere; the current version is in the details.",
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

  app.openapi(tasteRoute, async (context) => {
    const profile = await getTasteProfile(context.env.DB!, context.get("principal"));
    return profile === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(TasteProfileResponseSchema.parse({ data: profile }), 200);
  });

  app.openapi(declarationRoute, async (context) => {
    const declaration = await getTasteDeclaration(context.env.DB!, context.get("principal"));
    return declaration === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(TasteDeclarationResponseSchema.parse({ data: declaration }), 200);
  });

  app.openapi(saveDeclarationRoute, async (context) => {
    const result = await saveTasteDeclaration(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("json"),
    );
    if (result.kind === "unavailable") return context.json(notFound(context.get("requestId")), 404);
    if (result.kind === "conflict") {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "VERSION_CONFLICT",
            details: { current: result.current },
            message: "It was saved meanwhile from elsewhere.",
            requestId: context.get("requestId"),
          },
        }),
        409,
      );
    }
    return context.json(TasteDeclarationResponseSchema.parse({ data: result.declaration }), 200);
  });
}
