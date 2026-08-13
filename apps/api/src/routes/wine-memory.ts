import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  CreateWineRequestSchema,
  CreateWineResponseSchema,
  DeepTastingRequestSchema,
  DeepTastingResponseSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  IdentificationRequestSchema,
  IdentificationResponseSchema,
  MediaIdPathSchema,
  MediaReservationRequestSchema,
  MediaReservationResponseSchema,
  MediaUploadResponseSchema,
  QuickTastingRequestSchema,
  SpaceIdPathSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  TastingNoteResponseSchema,
  WineMemoryQuerySchema,
  WineMemoryResponseSchema,
} from "@vadevi/contracts";
import { z } from "zod";

import { readMedia, reserveMedia, uploadMedia } from "../repositories/media";
import { createDeepTastingNote } from "../repositories/tasting-sessions";
import { createTastingNote, createWine, listWines, syncSpace } from "../repositories/wine-memory";
import type { ApiEnvironment } from "../types";

const IdempotencyHeadersSchema = z.object({
  "Idempotency-Key": IdempotencyKeySchema.openapi({
    param: { in: "header", name: "Idempotency-Key" },
  }),
});

const createWineRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/wines",
  operationId: "createWine",
  tags: ["Wines"],
  summary: "Create a manually confirmed wine or an explicit identity draft",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: { content: { "application/json": { schema: CreateWineRequestSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: CreateWineResponseSchema } },
      description: "The Space-scoped wine and non-merging duplicate suggestions.",
      headers: {
        Location: { description: "The new wine resource.", schema: { type: "string" } },
        "Idempotency-Replayed": { description: "True when replayed.", schema: { type: "string" } },
      },
    },
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
      description: "Space, media, or user unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency or resource collision.",
    },
  },
});

const listWinesRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/wines",
  operationId: "listWines",
  tags: ["Wines"],
  summary: "Search the authorized Space's Wine Memory",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema, query: WineMemoryQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: WineMemoryResponseSchema } },
      description: "A stable page of private wines.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invalid query or cursor.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Space unavailable.",
    },
  },
});

const createTastingRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/tasting-notes",
  operationId: "createTastingNote",
  tags: ["Tastings"],
  summary: "Create one author-owned quick or deep tasting note",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: {
        "application/json": {
          schema: z.discriminatedUnion("mode", [
            QuickTastingRequestSchema,
            DeepTastingRequestSchema,
          ]),
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.union([TastingNoteResponseSchema, DeepTastingResponseSchema]),
        },
      },
      description: "The quick or deep tasting note.",
      headers: {
        Location: { description: "The new note resource.", schema: { type: "string" } },
        "Idempotency-Replayed": { description: "True when replayed.", schema: { type: "string" } },
      },
    },
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
      description: "Space or wine unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency or resource collision.",
    },
  },
});

const reserveMediaRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/media",
  operationId: "reservePrivateMedia",
  tags: ["Media"],
  summary: "Reserve a private processed-image upload",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: MediaReservationRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: MediaReservationResponseSchema } },
      description: "A private upload reservation without revealing its R2 key.",
      headers: {
        "Idempotency-Replayed": { description: "True when replayed.", schema: { type: "string" } },
      },
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invalid metadata.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Space unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency conflict.",
    },
  },
});

const uploadMediaRoute = createRoute({
  method: "put",
  path: "/api/v1/spaces/{spaceId}/media/{mediaId}/content",
  operationId: "uploadPrivateMediaContent",
  tags: ["Media"],
  summary: "Upload re-encoded private image bytes",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: MediaIdPathSchema,
    body: {
      content: {
        "image/jpeg": { schema: z.any().openapi({ format: "binary", type: "string" }) },
        "image/webp": { schema: z.any().openapi({ format: "binary", type: "string" }) },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: MediaUploadResponseSchema } },
      description: "The verified private media asset.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The bytes failed MIME, size, hash, dimension, or metadata validation.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Reservation unavailable.",
    },
  },
});

const getMediaRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/media/{mediaId}/content",
  operationId: "getPrivateMediaContent",
  tags: ["Media"],
  summary: "Stream private media after Space authorization",
  security: [{ FirebaseBearer: [] }],
  request: { params: MediaIdPathSchema },
  responses: {
    200: {
      content: {
        "image/jpeg": { schema: z.any().openapi({ format: "binary", type: "string" }) },
        "image/webp": { schema: z.any().openapi({ format: "binary", type: "string" }) },
      },
      description: "Private image bytes with no shared cache.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Media unavailable.",
    },
  },
});

const identifyRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/identifications",
  operationId: "identifyWineCandidate",
  tags: ["Identification"],
  summary: "Request optional identification while preserving manual fallback",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: {
      content: { "application/json": { schema: IdentificationRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: IdentificationResponseSchema } },
      description:
        "No provider is configured; the processed photo remains private and manual entry remains available.",
    },
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
      description: "Space or media unavailable.",
    },
  },
});

const syncRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/sync",
  operationId: "syncSpace",
  tags: ["Sync"],
  summary: "Replay ordered offline mutations and pull authorized changes",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: { content: { "application/json": { schema: SyncRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SyncResponseSchema } },
      description: "Per-mutation outcomes and the next Space cursor.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invalid queue or cursor.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Space unavailable.",
    },
  },
});

function errorEnvelope(
  requestId: string,
  code: "IDEMPOTENCY_CONFLICT" | "MEDIA_REJECTED" | "NOT_FOUND" | "VALIDATION_FAILED",
  message: string,
) {
  return ErrorEnvelopeSchema.parse({ error: { code, message, requestId } });
}

export function registerWineMemoryRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(createWineRoute, async (context) => {
    const result = await createWine(context.env.DB!, {
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
            ? "The command conflicts with an earlier request or resource."
            : "The requested resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header(
      "Location",
      `/api/v1/spaces/${context.req.valid("param").spaceId}/wines/${result.response.data.wine.id}`,
    );
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(CreateWineResponseSchema.parse(result.response), 201);
  });

  app.openapi(listWinesRoute, async (context) => {
    const query = context.req.valid("query");
    const response = await listWines(context.env.DB!, {
      cursor: query.cursor,
      limit: query.limit,
      principal: context.get("principal"),
      query: query.query,
      spaceId: context.req.valid("param").spaceId,
      wineType: query.wineType,
    });
    return response === null
      ? context.json(
          errorEnvelope(
            context.get("requestId"),
            "NOT_FOUND",
            "The requested resource was not found.",
          ),
          404,
        )
      : context.json(WineMemoryResponseSchema.parse(response), 200);
  });

  app.openapi(createTastingRoute, async (context) => {
    const request = context.req.valid("json");
    const result =
      request.mode === "deep"
        ? await createDeepTastingNote(context.env.DB!, {
            idempotencyKey: context.req.valid("header")["Idempotency-Key"],
            principal: context.get("principal"),
            request,
            spaceId: context.req.valid("param").spaceId,
          })
        : await createTastingNote(context.env.DB!, {
            idempotencyKey: context.req.valid("header")["Idempotency-Key"],
            principal: context.get("principal"),
            request,
            spaceId: context.req.valid("param").spaceId,
          });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The command conflicts with an earlier request or resource."
            : "The requested resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header(
      "Location",
      `/api/v1/spaces/${context.req.valid("param").spaceId}/tasting-notes/${result.response.data.id}`,
    );
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(
      request.mode === "deep"
        ? DeepTastingResponseSchema.parse(result.response)
        : TastingNoteResponseSchema.parse(result.response),
      201,
    );
  });

  app.openapi(reserveMediaRoute, async (context) => {
    const result = await reserveMedia(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      spaceId: context.req.valid("param").spaceId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The idempotency key was already used for different media."
            : "The requested resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(MediaReservationResponseSchema.parse(result.response), 201);
  });

  app.openapi(uploadMediaRoute, async (context) => {
    if (context.env.MEDIA === undefined) throw new Error("The R2 binding is unavailable.");
    const params = context.req.valid("param");
    const result = await uploadMedia(context.env.DB!, context.env.MEDIA, {
      bytes: await context.req.arrayBuffer(),
      contentType: context.req.header("Content-Type")?.split(";", 1)[0],
      mediaId: params.mediaId,
      principal: context.get("principal"),
      spaceId: params.spaceId,
    });
    if (result.kind !== "success") {
      const rejected = result.kind === "rejected";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          rejected ? "MEDIA_REJECTED" : "NOT_FOUND",
          rejected
            ? "The processed image did not match its safe upload reservation."
            : "The requested resource was not found.",
        ),
        rejected ? 400 : 404,
      );
    }
    return context.json(MediaUploadResponseSchema.parse({ data: { media: result.media } }), 200);
  });

  app.openapi(getMediaRoute, async (context) => {
    if (context.env.MEDIA === undefined) throw new Error("The R2 binding is unavailable.");
    const params = context.req.valid("param");
    const result = await readMedia(context.env.DB!, context.env.MEDIA, {
      mediaId: params.mediaId,
      principal: context.get("principal"),
      spaceId: params.spaceId,
    });
    if (result === null) {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "NOT_FOUND",
          "The requested resource was not found.",
        ),
        404,
      );
    }
    return new Response(result.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'inline; filename="image"',
        "Content-Type": result.mimeType,
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": context.get("requestId"),
      },
    });
  });

  app.openapi(identifyRoute, async (context) => {
    const request = context.req.valid("json");
    const available = await context.env
      .DB!.prepare(
        `SELECT 1 AS allowed FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM media_assets media WHERE media.id = ?
            AND media.space_id = space.id AND media.processing_status = 'ready'
            AND media.deleted_at IS NULL
        ))`,
      )
      .bind(
        context.get("principal").firebaseUid,
        context.req.valid("param").spaceId,
        request.mediaId ?? null,
        request.mediaId ?? null,
      )
      .first<{ allowed: number }>();
    return available === null
      ? context.json(
          errorEnvelope(
            context.get("requestId"),
            "NOT_FOUND",
            "The requested resource was not found.",
          ),
          404,
        )
      : context.json(
          IdentificationResponseSchema.parse({
            data: {
              candidates: [],
              status: "manual_required",
              warnings: [
                "Automatic identification is not configured. Confirm the wine using the manual fields.",
              ],
            },
          }),
          200,
        );
  });

  app.openapi(syncRoute, async (context) => {
    const request = context.req.valid("json");
    const response = await syncSpace(context.env.DB!, {
      cursor: request.cursor,
      mutations: request.mutations,
      principal: context.get("principal"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(
            context.get("requestId"),
            "NOT_FOUND",
            "The requested resource or sync cursor was not found.",
          ),
          404,
        )
      : context.json(SyncResponseSchema.parse(response), 200);
  });
}
