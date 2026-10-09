import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorEnvelopeSchema,
  ProducerProposalsResponseSchema,
  RegionProposalsResponseSchema,
  RenameRegionsRequestSchema,
  RenameRegionsResponseSchema,
  SpaceIdPathSchema,
  TasteBioRequestSchema,
  TasteBioResponseSchema,
  TasteDeclarationResponseSchema,
  TasteProfileQuerySchema,
  TasteProfileResponseSchema,
  UpdateTasteDeclarationRequestSchema,
  WineStatsQuerySchema,
  WineStatsResponseSchema,
} from "@vadevi/contracts";

import {
  proposeProducerTidying,
  proposeRegionTidying,
  renameProducers,
  renameRegions,
} from "../repositories/region-cleanup";
import { getPersonalStats, getSpaceStats } from "../repositories/stats";
import { getTasteDeclaration, saveTasteDeclaration } from "../repositories/taste-declaration";
import { getTasteProfile } from "../repositories/taste-profile";
import { createResearchPorts } from "../adapters/research-factory";
import { tasteFacts } from "../services/taste-profile";
import { reserveProviderBudget } from "../services/usage";
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
  request: { query: TasteProfileQuerySchema },
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

const regionProposalsRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/regions/tidy",
  operationId: "proposeRegionTidying",
  tags: ["Stats"],
  summary: "Regions written several ways, or one letter from a registered name",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: RegionProposalsResponseSchema } },
      description: "Proposals, each to confirm; nothing changes until then.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "No such Space, or the reader is not a member of it.",
    },
  },
});

const renameRegionsRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/regions/tidy",
  operationId: "renameRegions",
  tags: ["Stats"],
  summary: "Rename every wine written one of these ways, as confirmed",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: RenameRegionsRequestSchema } },
      required: true,
    },
    params: SpaceIdPathSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: RenameRegionsResponseSchema } },
      description: "How many wines were renamed.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "No such Space, or the reader is not a member of it.",
    },
  },
});

const tasteBioRoute = createRoute({
  method: "post",
  path: "/api/v1/me/taste-bio",
  operationId: "writeTasteBio",
  tags: ["Stats"],
  summary: "The reader's taste told in a few sentences, from their own facts only",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: { content: { "application/json": { schema: TasteBioRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TasteBioResponseSchema } },
      description: "The text, or why there is none.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The reader has no account yet.",
    },
  },
});

const producerProposalsRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/producers/tidy",
  operationId: "proposeProducerTidying",
  tags: ["Stats"],
  summary: "Producers written several ways",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ProducerProposalsResponseSchema } },
      description: "Proposals, each to confirm; nothing changes until then.",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "No such Space, or the reader is not a member of it.",
    },
  },
});

const renameProducersRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/producers/tidy",
  operationId: "renameProducers",
  tags: ["Stats"],
  summary: "Rename every wine by one of these producer spellings, as confirmed",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: RenameRegionsRequestSchema } },
      required: true,
    },
    params: SpaceIdPathSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: RenameRegionsResponseSchema } },
      description: "How many wines were renamed.",
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

  app.openapi(tasteRoute, async (context) => {
    const profile = await getTasteProfile(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("query").locale,
    );
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

  app.openapi(regionProposalsRoute, async (context) => {
    const proposals = await proposeRegionTidying(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("param").spaceId,
    );
    return proposals === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(RegionProposalsResponseSchema.parse({ data: proposals }), 200);
  });

  app.openapi(renameRegionsRoute, async (context) => {
    const renamed = await renameRegions(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("param").spaceId,
      context.req.valid("json"),
      context.get("requestId"),
    );
    return renamed === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(RenameRegionsResponseSchema.parse({ data: { renamed } }), 200);
  });

  // Written on request, never stored: one model call from the day's allowance,
  // and a text kept only if every number in it is one of the reader's own.
  app.openapi(tasteBioRoute, async (context) => {
    const { labels, locale } = context.req.valid("json");
    const principal = context.get("principal");
    const profile = await getTasteProfile(context.env.DB!, principal, locale);
    if (profile === null) return context.json(notFound(context.get("requestId")), 404);
    const answer = (
      status: "insufficient" | "not_kept" | "unavailable" | "written",
      text: string | null = null,
    ) => context.json(TasteBioResponseSchema.parse({ data: { status, text } }), 200);
    if (profile.confidence === "insufficient") return answer("insufficient");
    const narrative = createResearchPorts(context.env.DB!, context.env).narrative ?? null;
    if (narrative?.describeTaste === undefined) return answer("unavailable");
    const reader = await context.env
      .DB!.prepare(
        `SELECT active_space_id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL`,
      )
      .bind(principal.firebaseUid)
      .first<{ active_space_id: string | null }>();
    const withinBudget =
      reader?.active_space_id != null &&
      (await reserveProviderBudget(context.env.DB!, {
        firebaseUid: principal.firebaseUid,
        metric: "ai_language_calls",
        nowIso: new Date().toISOString(),
        spaceId: reader.active_space_id,
      }));
    if (!withinBudget) return answer("unavailable");
    const { facts, numbers } = tasteFacts(profile, locale, labels);
    const text = await narrative.describeTaste({ facts, locale, numbers });
    return text === null ? answer("not_kept") : answer("written", text);
  });

  app.openapi(producerProposalsRoute, async (context) => {
    const proposals = await proposeProducerTidying(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("param").spaceId,
    );
    return proposals === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(ProducerProposalsResponseSchema.parse({ data: proposals }), 200);
  });

  app.openapi(renameProducersRoute, async (context) => {
    const renamed = await renameProducers(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("param").spaceId,
      context.req.valid("json"),
      context.get("requestId"),
    );
    return renamed === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(RenameRegionsResponseSchema.parse({ data: { renamed } }), 200);
  });
}
