import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorEnvelopeSchema,
  LibraryGrapePathSchema,
  LibraryGrapeQuerySchema,
  LibraryGrapeResponseSchema,
  LibraryRegionPathSchema,
  LibraryRegionResponseSchema,
  LibraryRegionSearchQuerySchema,
  LibraryRegionSearchResponseSchema,
  LibrarySearchQuerySchema,
  LibrarySearchResponseSchema,
} from "@vadevi/contracts";

import {
  getLibraryGrape,
  getLibraryRegion,
  searchLibraryGrapes,
  searchLibraryRegions,
} from "../repositories/library";
import type { ApiEnvironment } from "../types";

const grapeRoute = createRoute({
  method: "get",
  path: "/api/v1/library/grapes/{grapeId}",
  operationId: "getLibraryGrape",
  tags: ["Library"],
  summary: "A grape's reference card, with the sentence behind each value",
  security: [{ FirebaseBearer: [] }],
  request: { params: LibraryGrapePathSchema, query: LibraryGrapeQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: LibraryGrapeResponseSchema } },
      description: "The grape, in the reader's language where the library has it.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The library has no such grape.",
    },
  },
});

const searchRoute = createRoute({
  method: "get",
  path: "/api/v1/library/grapes",
  operationId: "searchLibraryGrapes",
  tags: ["Library"],
  summary: "Grapes in the library by any of their names",
  security: [{ FirebaseBearer: [] }],
  request: { query: LibrarySearchQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: LibrarySearchResponseSchema } },
      description: "Matching grapes, best known first.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
  },
});

const regionRoute = createRoute({
  method: "get",
  path: "/api/v1/library/regions/{regionId}",
  operationId: "getLibraryRegion",
  tags: ["Library"],
  summary: "A registered wine name from the atlas, with the grapes its sources place there",
  security: [{ FirebaseBearer: [] }],
  request: { params: LibraryRegionPathSchema, query: LibraryGrapeQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: LibraryRegionResponseSchema } },
      description: "The atlas entry, in the reader's language where the library has it.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The atlas has no such name.",
    },
  },
});

const regionSearchRoute = createRoute({
  method: "get",
  path: "/api/v1/library/regions",
  operationId: "searchLibraryRegions",
  tags: ["Library"],
  summary: "Registered wine names in the atlas by any of their names",
  security: [{ FirebaseBearer: [] }],
  request: { query: LibraryRegionSearchQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: LibraryRegionSearchResponseSchema } },
      description: "Matching names, best known first.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
  },
});

export function registerLibraryRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(regionRoute, async (context) => {
    const region = await getLibraryRegion(
      context.env.DB!,
      context.req.valid("param").regionId,
      context.req.valid("query").locale,
    );
    if (region === null) {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "NOT_FOUND",
            message: "The atlas has no such name.",
            requestId: context.get("requestId"),
          },
        }),
        404,
      );
    }
    return context.json(LibraryRegionResponseSchema.parse({ data: region }), 200);
  });

  app.openapi(regionSearchRoute, async (context) => {
    const { country, query } = context.req.valid("query");
    const data = await searchLibraryRegions(context.env.DB!, query, country ?? null);
    return context.json(LibraryRegionSearchResponseSchema.parse({ data }), 200);
  });

  app.openapi(grapeRoute, async (context) => {
    const grape = await getLibraryGrape(
      context.env.DB!,
      context.req.valid("param").grapeId,
      context.req.valid("query").locale,
    );
    if (grape === null) {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "NOT_FOUND",
            message: "The library has no such grape.",
            requestId: context.get("requestId"),
          },
        }),
        404,
      );
    }
    return context.json(LibraryGrapeResponseSchema.parse({ data: grape }), 200);
  });

  app.openapi(searchRoute, async (context) => {
    const { locale, query } = context.req.valid("query");
    const data = await searchLibraryGrapes(context.env.DB!, query, locale);
    return context.json(LibrarySearchResponseSchema.parse({ data }), 200);
  });
}
