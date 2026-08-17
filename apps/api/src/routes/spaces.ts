import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  BootstrapResponseSchema,
  CreateInvitationRequestSchema,
  CreateInvitationResponseSchema,
  CreateSpaceRequestSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  InvitationPreviewResponseSchema,
  InvitationTokenPathSchema,
  RemoveMemberRequestSchema,
  SpaceDetailResponseSchema,
  UpdateSpaceRequestSchema,
  SpaceIdPathSchema,
  SpaceMemberPathSchema,
} from "@vadevi/contracts";
import { z } from "zod";

import {
  acceptInvitation,
  createInvitation,
  createSpace,
  getInvitationPreview,
  getSpaceDetail,
  removeMember,
  updateSpace,
} from "../repositories/spaces";
import type { ApiEnvironment } from "../types";
import { externalResearchEnabled } from "../adapters/research-factory";

const IdempotencyHeadersSchema = z.object({
  "Idempotency-Key": IdempotencyKeySchema.openapi({
    param: { in: "header", name: "Idempotency-Key" },
  }),
});

const createSpaceRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces",
  operationId: "createSpace",
  tags: ["Spaces"],
  summary: "Create a couple or group Space",
  security: [{ FirebaseBearer: [] }],
  request: {
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateSpaceRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SpaceDetailResponseSchema } },
      description: "The Space and its owner membership were created.",
      headers: {
        Location: { description: "The new Space resource.", schema: { type: "string" } },
        "Idempotency-Replayed": {
          description: "True when a prior successful command was replayed.",
          schema: { type: "string" },
        },
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
      description: "User unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency conflict.",
    },
  },
});

const getSpaceRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}",
  operationId: "getSpace",
  tags: ["Spaces"],
  summary: "Get one Space and its active memberships",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SpaceDetailResponseSchema } },
      description: "Authorized Space detail.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Space not available.",
    },
  },
});

/**
 * Renaming a Space.
 *
 * Owners only, because the name is what every member reads in their switcher.
 * §7 puts Space administration behind the owner role, and this is that.
 */
const updateSpaceRoute = createRoute({
  method: "patch",
  path: "/api/v1/spaces/{spaceId}",
  operationId: "updateSpace",
  tags: ["Spaces"],
  summary: "Rename a Space, or change the language its content defaults to",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: {
      content: { "application/json": { schema: UpdateSpaceRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SpaceDetailResponseSchema } },
      description: "The updated Space.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Only an owner may change a Space.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Space not available.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The Space changed before this update.",
    },
  },
});

const createInvitationRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/invitations",
  operationId: "createSpaceInvitation",
  tags: ["Invitations"],
  summary: "Create a seven-day single-use invitation link",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateInvitationRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: CreateInvitationResponseSchema } },
      description:
        "The raw invitation capability is returned once through its path and is never stored.",
      headers: {
        Location: { description: "The shareable invitation path.", schema: { type: "string" } },
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
      description: "Space not available or invitation capacity reached.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Idempotency conflict.",
    },
  },
});

const previewInvitationRoute = createRoute({
  method: "get",
  path: "/api/v1/invitations/{token}/preview",
  operationId: "previewSpaceInvitation",
  tags: ["Invitations"],
  summary: "Preview a valid invitation capability without authentication",
  request: { params: InvitationTokenPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: InvitationPreviewResponseSchema } },
      description: "Safe invitation preview.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invitation invalid, expired, revoked, or already used.",
    },
  },
});

const acceptInvitationRoute = createRoute({
  method: "post",
  path: "/api/v1/invitations/{token}/accept",
  operationId: "acceptSpaceInvitation",
  tags: ["Invitations"],
  summary: "Accept a valid invitation idempotently",
  security: [{ FirebaseBearer: [] }],
  request: { params: InvitationTokenPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: BootstrapResponseSchema } },
      description: "Updated session with the accepted Space active.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invitation unavailable.",
    },
  },
});

const removeMemberRoute = createRoute({
  method: "patch",
  path: "/api/v1/spaces/{spaceId}/members/{memberId}",
  operationId: "removeSpaceMember",
  tags: ["Members"],
  summary: "Remove a non-owner member with optimistic concurrency",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceMemberPathSchema,
    body: {
      content: { "application/json": { schema: RemoveMemberRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SpaceDetailResponseSchema } },
      description: "Updated active membership list.",
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
      description: "Space or target membership unavailable.",
    },
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Membership version conflict.",
    },
  },
});

function errorEnvelope(
  requestId: string,
  code: "FORBIDDEN" | "IDEMPOTENCY_CONFLICT" | "INVITE_INVALID" | "NOT_FOUND" | "VERSION_CONFLICT",
  message: string,
) {
  return ErrorEnvelopeSchema.parse({ error: { code, message, requestId } });
}

export function registerSpaceRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(createSpaceRoute, async (context) => {
    const result = await createSpace(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
    });
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for a different request.",
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
    context.header("Location", `/api/v1/spaces/${result.response.data.space.id}`);
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(SpaceDetailResponseSchema.parse(result.response), 201);
  });

  app.openapi(updateSpaceRoute, async (context) => {
    const result = await updateSpace(context.env.DB!, {
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
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
    if (result.kind === "forbidden") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "FORBIDDEN",
          "Only an owner can change this Space.",
        ),
        403,
      );
    }
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "The Space changed before this update.",
        ),
        409,
      );
    }
    return context.json(SpaceDetailResponseSchema.parse(result.response), 200);
  });

  app.openapi(getSpaceRoute, async (context) => {
    const response = await getSpaceDetail(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("param").spaceId,
    );
    return response === null
      ? context.json(
          errorEnvelope(
            context.get("requestId"),
            "NOT_FOUND",
            "The requested resource was not found.",
          ),
          404,
        )
      : context.json(SpaceDetailResponseSchema.parse(response), 200);
  });

  app.openapi(createInvitationRoute, async (context) => {
    const result = await createInvitation(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for a different request.",
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
    context.header("Location", result.response.data.invitationPath);
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(CreateInvitationResponseSchema.parse(result.response), 201);
  });

  app.openapi(previewInvitationRoute, async (context) => {
    const response = await getInvitationPreview(context.env.DB!, context.req.valid("param").token);
    return response === null
      ? context.json(
          errorEnvelope(
            context.get("requestId"),
            "INVITE_INVALID",
            "The invitation is invalid or unavailable.",
          ),
          404,
        )
      : context.json(InvitationPreviewResponseSchema.parse(response), 200);
  });

  app.openapi(acceptInvitationRoute, async (context) => {
    const result = await acceptInvitation(context.env.DB!, {
      aiProvider: context.env.AI_PROVIDER ?? "none",
      externalResearch: externalResearchEnabled(context.env),
      principal: context.get("principal"),
      requestId: context.get("requestId"),
      token: context.req.valid("param").token,
    });
    return result.kind === "invalid"
      ? context.json(
          errorEnvelope(
            context.get("requestId"),
            "INVITE_INVALID",
            "The invitation is invalid or unavailable.",
          ),
          404,
        )
      : context.json(BootstrapResponseSchema.parse(result.response), 200);
  });

  app.openapi(removeMemberRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await removeMember(context.env.DB!, {
      memberId: params.memberId,
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
    });
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "The membership changed before this request.",
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
    return context.json(SpaceDetailResponseSchema.parse(result.response), 200);
  });
}
