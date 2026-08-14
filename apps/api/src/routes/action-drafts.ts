import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ActionDraftIdPathSchema,
  ActionDraftResponseSchema,
  CreateActionDraftRequestSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  SpaceIdPathSchema,
} from "@vadevi/contracts";

import {
  cancelActionDraft,
  confirmActionDraft,
  createActionDraft,
  getActionDraft,
} from "../repositories/action-drafts";
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
    description: "The user-bound draft is unavailable.",
  },
};

const createDraftRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/action-drafts",
  operationId: "createActionDraft",
  tags: ["Action drafts"],
  summary: "Create an expiring user-review draft without performing its write",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateActionDraftRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ActionDraftResponseSchema } },
      description: "A validated draft that expires after thirty minutes.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The idempotency key conflicts with an earlier draft request.",
    },
  },
});

const getDraftRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/action-drafts/{draftId}",
  operationId: "getActionDraft",
  tags: ["Action drafts"],
  summary: "Inspect one user-bound assistant action draft",
  security: [{ FirebaseBearer: [] }],
  request: { params: ActionDraftIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ActionDraftResponseSchema } },
      description: "The validated payload, status, and any confirmation result.",
    },
    ...commonErrors,
  },
});

const confirmDraftRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/action-drafts/{draftId}/confirm",
  operationId: "confirmActionDraft",
  tags: ["Action drafts"],
  summary: "Explicitly confirm an action draft exactly once",
  security: [{ FirebaseBearer: [] }],
  request: { params: ActionDraftIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ActionDraftResponseSchema } },
      description: "The confirmed draft and durable resource reference.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The draft is canceled, expired, or conflicts with current data.",
    },
  },
});

const cancelDraftRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/action-drafts/{draftId}/cancel",
  operationId: "cancelActionDraft",
  tags: ["Action drafts"],
  summary: "Cancel an action draft without writing its proposed resource",
  security: [{ FirebaseBearer: [] }],
  request: { params: ActionDraftIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ActionDraftResponseSchema } },
      description: "The canceled draft; no proposed domain resource is created.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "A confirmed or expired draft cannot be canceled.",
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

export function registerActionDraftRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(createDraftRoute, async (context) => {
    const result = await createActionDraft(context.env.DB!, {
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
            ? "The draft command conflicts with an earlier request."
            : "The resource was not found.",
          result.kind === "conflict" ? result.current?.data : undefined,
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    context.header(
      "Location",
      `/api/v1/spaces/${context.req.valid("param").spaceId}/action-drafts/${result.response.data.id}`,
    );
    return context.json(ActionDraftResponseSchema.parse(result.response), 201);
  });

  app.openapi(getDraftRoute, async (context) => {
    const params = context.req.valid("param");
    const response = await getActionDraft(context.env.DB!, {
      draftId: params.draftId,
      principal: context.get("principal"),
      spaceId: params.spaceId,
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(ActionDraftResponseSchema.parse(response), 200);
  });

  app.openapi(confirmDraftRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await confirmActionDraft(context.env.DB!, {
      draftId: params.draftId,
      principal: context.get("principal"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
    });
    if (result.kind === "unavailable") {
      return context.json(
        errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
        404,
      );
    }
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "The draft can no longer be confirmed.",
          result.current?.data,
        ),
        409,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(ActionDraftResponseSchema.parse(result.response), 200);
  });

  app.openapi(cancelDraftRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await cancelActionDraft(context.env.DB!, {
      draftId: params.draftId,
      principal: context.get("principal"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
    });
    if (result.kind === "unavailable") {
      return context.json(
        errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
        404,
      );
    }
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "The draft can no longer be canceled.",
          result.current?.data,
        ),
        409,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(ActionDraftResponseSchema.parse(result.response), 200);
  });
}
