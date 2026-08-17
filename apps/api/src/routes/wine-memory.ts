import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  CreateWineRequestSchema,
  CreateWineResponseSchema,
  DeepTastingRequestSchema,
  DeepTastingResponseSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  ConfirmIdentificationRequestSchema,
  ConfirmIdentificationResponseSchema,
  IdentificationPathSchema,
  IdentificationRequestSchema,
  IdentificationResponseSchema,
  MediaIdPathSchema,
  MediaReservationRequestSchema,
  MediaReservationResponseSchema,
  MediaUploadResponseSchema,
  MergeWinesRequestSchema,
  MergeWinesResponseSchema,
  QuickTastingRequestSchema,
  SpaceIdPathSchema,
  UpdateWineRequestSchema,
  WineIdPathSchema,
  WineResponseSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  TastingNoteResponseSchema,
  WineMemoryQuerySchema,
  WineMemoryResponseSchema,
} from "@vadevi/contracts";
import { z } from "zod";

import { readMedia, reserveMedia, uploadMedia } from "../repositories/media";
import { createDeepTastingNote } from "../repositories/tasting-sessions";
import { createLabelOcrPort } from "../adapters/label-ocr";
import { createResearchPorts } from "../adapters/research-factory";
import { confirmIdentification, createIdentification } from "../repositories/identification";
import { reserveProviderBudget } from "../services/usage";
import { mergeWines } from "../repositories/wine-merge";
import {
  createTastingNote,
  createWine,
  listWines,
  syncSpace,
  updateWine,
} from "../repositories/wine-memory";
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

/**
 * Correcting a wine after the fact.
 *
 * §10 keeps identity confirmable rather than fixed: a wine logged in a hurry is
 * a draft until someone says otherwise, and saying otherwise has to be possible
 * without logging the bottle a second time.
 */
const updateWineRoute = createRoute({
  method: "patch",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}",
  operationId: "updateWine",
  tags: ["Wine memory"],
  summary: "Correct a wine's identity fields, or attach its label photograph",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: WineIdPathSchema,
    body: {
      content: { "application/json": { schema: UpdateWineRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: WineResponseSchema } },
      description: "The corrected wine.",
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
      description: "The wine or the Space is unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The wine changed before this update, or has been merged away.",
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

const confirmIdentificationRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/identifications/{identificationId}/confirm",
  operationId: "confirmIdentification",
  tags: ["Identification"],
  summary: "Confirm or correct an identification draft and create the wine",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: IdentificationPathSchema,
    body: {
      content: { "application/json": { schema: ConfirmIdentificationRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ConfirmIdentificationResponseSchema } },
      description: "The confirmed wine. Repeating a confirmation returns the same wine.",
      headers: {
        Location: { description: "The confirmed wine resource.", schema: { type: "string" } },
        "Idempotency-Replayed": { description: "True when replayed.", schema: { type: "string" } },
      },
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The draft expired or the corrected wine is invalid.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Space or identification unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency conflict.",
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

const mergeWinesRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/merge",
  operationId: "mergeWines",
  tags: ["Wines"],
  summary: "Merge a confirmed duplicate into this wine after explicit confirmation",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: WineIdPathSchema,
    body: { content: { "application/json": { schema: MergeWinesRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: MergeWinesResponseSchema } },
      description: "The surviving wine, moved reference counts, and the merged record id.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invalid merge request.",
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
      description: "A wine changed or was already merged before this confirmation.",
    },
  },
});

function errorEnvelope(
  requestId: string,
  code:
    | "IDEMPOTENCY_CONFLICT"
    | "MEDIA_REJECTED"
    | "NOT_FOUND"
    | "VALIDATION_FAILED"
    | "VERSION_CONFLICT",
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

  app.openapi(updateWineRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await updateWine(context.env.DB!, {
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
      wineId: params.wineId,
    });
    if (result.kind === "unavailable") {
      return context.json(
        errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
        404,
      );
    }
    if (result.kind === "merged") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "This wine was merged into another one. Edit the wine it was merged into.",
        ),
        409,
      );
    }
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "The wine changed before this update.",
        ),
        409,
      );
    }
    return context.json(WineResponseSchema.parse({ data: { wine: result.wine } }), 200);
  });

  app.openapi(listWinesRoute, async (context) => {
    const query = context.req.valid("query");
    const response = await listWines(context.env.DB!, {
      ...query,
      principal: context.get("principal"),
      spaceId: context.req.valid("param").spaceId,
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
    const spaceId = context.req.valid("param").spaceId;
    const request = context.req.valid("json");
    const ocr = createLabelOcrPort(context.env);

    // Label reading is metered like any other optional provider. At the cap the
    // draft still gets built from barcode and Space matches.
    const ocrWithinBudget =
      ocr === null ||
      (await reserveProviderBudget(context.env.DB!, {
        firebaseUid: context.get("principal").firebaseUid,
        metric: "ocr_reads",
        nowIso: new Date().toISOString(),
        spaceId,
      }));

    const productPorts = createResearchPorts(context.env.DB!, context.env);
    const productWithinBudget =
      productPorts.product === null ||
      request.barcode === undefined ||
      (await reserveProviderBudget(context.env.DB!, {
        firebaseUid: context.get("principal").firebaseUid,
        metric: "barcode_lookups",
        nowIso: new Date().toISOString(),
        spaceId,
      }));

    // OCR needs the actual bytes, which never leave the Worker.
    let mediaBytes: ArrayBuffer | undefined;
    let mediaMimeType: "image/jpeg" | "image/webp" | undefined;
    if (ocr !== null && ocrWithinBudget && request.mediaId !== undefined) {
      if (context.env.MEDIA === undefined) throw new Error("The R2 binding is unavailable.");
      const stored = await readMedia(context.env.DB!, context.env.MEDIA, {
        mediaId: request.mediaId,
        principal: context.get("principal"),
        spaceId,
      });
      if (stored !== null) {
        mediaBytes = await new Response(stored.body).arrayBuffer();
        mediaMimeType = stored.mimeType === "image/webp" ? "image/webp" : "image/jpeg";
      }
    }

    const response = await createIdentification(context.env.DB!, {
      ...(mediaBytes === undefined ? {} : { mediaBytes }),
      ...(mediaMimeType === undefined ? {} : { mediaMimeType }),
      ports: {
        ocr: ocrWithinBudget ? ocr : null,
        product: productWithinBudget ? productPorts.product : null,
      },
      principal: context.get("principal"),
      request,
      spaceId,
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
      : context.json(IdentificationResponseSchema.parse(response), 200);
  });

  app.openapi(confirmIdentificationRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await confirmIdentification(context.env.DB!, {
      identificationId: params.identificationId,
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
    });
    if (result.kind === "expired") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VALIDATION_FAILED",
          "This identification expired. Scan again or enter the wine manually.",
        ),
        400,
      );
    }
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "IDEMPOTENCY_CONFLICT",
          "The command conflicts with an earlier request.",
        ),
        409,
      );
    }
    if (result.kind === "unavailable") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "NOT_FOUND",
          "The requested resource was not found.",
        ),
        404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    context.header("Location", `/api/v1/spaces/${params.spaceId}/wines/${result.wineId}`);
    return context.json(
      ConfirmIdentificationResponseSchema.parse({ data: { wineId: result.wineId } }),
      201,
    );
  });

  app.openapi(mergeWinesRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await mergeWines(context.env.DB!, {
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
      targetWineId: params.wineId,
    });
    if (result.kind === "invalid") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VALIDATION_FAILED",
          "A wine cannot be merged into itself.",
        ),
        400,
      );
    }
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "One of the wines changed before this confirmation.",
        ),
        409,
      );
    }
    if (result.kind === "unavailable") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "NOT_FOUND",
          "The requested resource was not found.",
        ),
        404,
      );
    }
    return context.json(MergeWinesResponseSchema.parse(result.response), 200);
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
