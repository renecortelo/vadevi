import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  AddSessionWinesRequestSchema,
  CreateTastingSessionRequestSchema,
  DeepTastingResponseSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  ReorderSessionWinesRequestSchema,
  SessionComparisonResponseSchema,
  SessionIdPathSchema,
  SpaceIdPathSchema,
  SubmitTastingRequestSchema,
  TastingNoteIdPathSchema,
  TastingSessionDetailResponseSchema,
  TastingSessionListResponseSchema,
  TastingSessionResponseSchema,
  UpdateDeepTastingRequestSchema,
} from "@vadevi/contracts";

import {
  addSessionWines,
  createTastingSession,
  getDeepTastingNote,
  getSessionComparison,
  getTastingSessionDetail,
  listTastingSessions,
  reorderSessionWines,
  submitDeepTastingNote,
  updateDeepTastingNote,
} from "../repositories/tasting-sessions";
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

const createSessionRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/sessions",
  operationId: "createTastingSession",
  tags: ["Sessions"],
  summary: "Create a private collaborative tasting session",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateTastingSessionRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: TastingSessionResponseSchema } },
      description: "The new tasting session.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency or resource conflict.",
    },
  },
});

const listSessionsRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/sessions",
  operationId: "listTastingSessions",
  tags: ["Sessions"],
  summary: "List the authorized Space's tasting sessions",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: TastingSessionListResponseSchema } },
      description: "Private sessions ordered by date.",
    },
    ...commonErrors,
  },
});

const getSessionRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/sessions/{sessionId}",
  operationId: "getTastingSession",
  tags: ["Sessions"],
  summary: "Get one session flight without exposing other members' draft content",
  security: [{ FirebaseBearer: [] }],
  request: { params: SessionIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: TastingSessionDetailResponseSchema } },
      description: "The ordered flight and completion state.",
    },
    ...commonErrors,
  },
});

const addSessionWinesRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/sessions/{sessionId}/wines",
  operationId: "addSessionWines",
  tags: ["Sessions"],
  summary: "Append one or more authorized wines to a session flight",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SessionIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: AddSessionWinesRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TastingSessionDetailResponseSchema } },
      description: "The updated flight.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency, duplicate, or ordering conflict.",
    },
  },
});

const reorderSessionWinesRoute = createRoute({
  method: "put",
  path: "/api/v1/spaces/{spaceId}/sessions/{sessionId}/wines/order",
  operationId: "reorderSessionWines",
  tags: ["Sessions"],
  summary: "Replace the flight order with the exact authorized entry set",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SessionIdPathSchema,
    body: {
      content: { "application/json": { schema: ReorderSessionWinesRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TastingSessionDetailResponseSchema } },
      description: "The reordered flight.",
    },
    ...commonErrors,
  },
});

const comparisonRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/sessions/{sessionId}/comparison",
  operationId: "getSessionComparison",
  tags: ["Sessions"],
  summary: "Compute a deterministic comparison from submitted notes only",
  security: [{ FirebaseBearer: [] }],
  request: { params: SessionIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SessionComparisonResponseSchema } },
      description: "Versioned comparison with no group score below two scored submissions.",
    },
    ...commonErrors,
  },
});

const updateDeepNoteRoute = createRoute({
  method: "patch",
  path: "/api/v1/spaces/{spaceId}/tasting-notes/{noteId}",
  operationId: "updateDeepTastingNote",
  tags: ["Tastings"],
  summary: "Update only the authenticated author's deep-tasting draft",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: TastingNoteIdPathSchema,
    body: {
      content: { "application/json": { schema: UpdateDeepTastingRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DeepTastingResponseSchema } },
      description: "The updated author-owned note.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The note version changed; current authorized data is returned in details.",
    },
  },
});

const getDeepNoteRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/tasting-notes/{noteId}",
  operationId: "getDeepTastingNote",
  tags: ["Tastings"],
  summary: "Read only the authenticated author's deep-tasting note",
  security: [{ FirebaseBearer: [] }],
  request: { params: TastingNoteIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: DeepTastingResponseSchema } },
      description: "The author-owned deep-tasting note.",
    },
    ...commonErrors,
  },
});

const submitDeepNoteRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/tasting-notes/{noteId}/submit",
  operationId: "submitDeepTastingNote",
  tags: ["Tastings"],
  summary: "Submit the authenticated author's deep-tasting draft",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: TastingNoteIdPathSchema,
    body: {
      content: { "application/json": { schema: SubmitTastingRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DeepTastingResponseSchema } },
      description: "The submitted note.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The note version changed.",
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

export function registerTastingSessionRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(createSessionRoute, async (context) => {
    const result = await createTastingSession(context.env.DB!, {
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
            ? "The command conflicts with an earlier request."
            : "The resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    context.header(
      "Location",
      `/api/v1/spaces/${context.req.valid("param").spaceId}/sessions/${result.response.data.id}`,
    );
    return context.json(TastingSessionResponseSchema.parse(result.response), 201);
  });

  app.openapi(listSessionsRoute, async (context) => {
    const response = await listTastingSessions(context.env.DB!, {
      principal: context.get("principal"),
      spaceId: context.req.valid("param").spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(TastingSessionListResponseSchema.parse(response), 200);
  });

  app.openapi(getSessionRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await getTastingSessionDetail(context.env.DB!, {
      principal: context.get("principal"),
      sessionId: params.sessionId,
      spaceId: params.spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(TastingSessionDetailResponseSchema.parse(response), 200);
  });

  app.openapi(addSessionWinesRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await addSessionWines(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      sessionId: params.sessionId,
      spaceId: params.spaceId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The flight update conflicts with existing data."
            : "The resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(TastingSessionDetailResponseSchema.parse(result.response), 200);
  });

  app.openapi(reorderSessionWinesRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await reorderSessionWines(context.env.DB!, {
      orderedSessionWineIds: context.req.valid("json").orderedSessionWineIds,
      principal: context.get("principal"),
      sessionId: params.sessionId,
      spaceId: params.spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The exact flight was not found."),
          404,
        )
      : context.json(TastingSessionDetailResponseSchema.parse(response), 200);
  });

  app.openapi(comparisonRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await getSessionComparison(context.env.DB!, {
      principal: context.get("principal"),
      sessionId: params.sessionId,
      spaceId: params.spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(SessionComparisonResponseSchema.parse(response), 200);
  });

  app.openapi(getDeepNoteRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await getDeepTastingNote(context.env.DB!, {
      noteId: params.noteId,
      principal: context.get("principal"),
      spaceId: params.spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(DeepTastingResponseSchema.parse(response), 200);
  });

  app.openapi(updateDeepNoteRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await updateDeepTastingNote(context.env.DB!, {
      noteId: params.noteId,
      principal: context.get("principal"),
      request: context.req.valid("json"),
      spaceId: params.spaceId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "VERSION_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The note changed; preserve the local text before resolving."
            : "The resource was not found.",
          result.kind === "conflict" ? result.current?.data : undefined,
        ),
        conflict ? 409 : 404,
      );
    }
    return context.json(DeepTastingResponseSchema.parse(result.response), 200);
  });

  app.openapi(submitDeepNoteRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await submitDeepTastingNote(context.env.DB!, {
      noteId: params.noteId,
      principal: context.get("principal"),
      spaceId: params.spaceId,
      version: context.req.valid("json").version,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "VERSION_CONFLICT" : "NOT_FOUND",
          conflict ? "The note version changed." : "The resource was not found.",
          result.kind === "conflict" ? result.current?.data : undefined,
        ),
        conflict ? 409 : 404,
      );
    }
    return context.json(DeepTastingResponseSchema.parse(result.response), 200);
  });
}
