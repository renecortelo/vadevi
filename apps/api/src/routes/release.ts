import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  DeleteAccountRequestSchema,
  DeleteSpaceRequestSchema,
  DeletionJobResponseSchema,
  ErrorEnvelopeSchema,
  ExportDocumentSchema,
  ExportMediaRequestSchema,
  ExportQuerySchema,
  LeaveSpaceRequestSchema,
  SpaceIdPathSchema,
  UsageReportResponseSchema,
} from "@vadevi/contracts";
import { z } from "zod";

import {
  cancelSpaceDeletion,
  deletionResponse,
  getDeletionJob,
  leaveSpace,
  scheduleAccountDeletion,
  scheduleSpaceDeletion,
} from "../repositories/deletion";
import {
  buildExportDocument,
  buildMediaArchive,
  renderCsv,
  resolveExportActor,
} from "../repositories/export";
import { buildUsageReport } from "../services/usage";
import type { ApiEnvironment } from "../types";

const exportRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/export",
  operationId: "exportSpace",
  tags: ["Data rights"],
  summary: "Export the authorized scope as versioned JSON or a selected CSV dataset",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema, query: ExportQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: ExportDocumentSchema },
        "text/csv": { schema: z.string() },
      },
      description:
        "The versioned export document, or one selected CSV dataset. Media bytes require an explicit selection.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invalid export selection.",
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

const exportMediaRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/export/media",
  operationId: "exportSelectedMedia",
  tags: ["Data rights"],
  summary: "Package explicitly selected private media into a ZIP archive",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: { content: { "application/json": { schema: ExportMediaRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: {
        "application/zip": { schema: z.any().openapi({ format: "binary", type: "string" }) },
      },
      description: "A private ZIP archive containing only the selected authorized media.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invalid selection.",
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

const deleteSpaceRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/deletion",
  operationId: "scheduleSpaceDeletion",
  tags: ["Data rights"],
  summary: "Schedule confirmed Space deletion after a typed confirmation",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: { content: { "application/json": { schema: DeleteSpaceRequestSchema } }, required: true },
  },
  responses: {
    202: {
      content: { "application/json": { schema: DeletionJobResponseSchema } },
      description: "The deletion job, including its recoverable grace period.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The typed confirmation did not match the Space name.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Space unavailable or the actor is not an owner.",
    },
  },
});

const getSpaceDeletionRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/deletion",
  operationId: "getSpaceDeletion",
  tags: ["Data rights"],
  summary: "Read the latest Space deletion job",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: DeletionJobResponseSchema } },
      description: "The latest deletion job for this Space.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "No deletion job is available to this actor.",
    },
  },
});

const cancelSpaceDeletionRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/deletion/cancel",
  operationId: "cancelSpaceDeletion",
  tags: ["Data rights"],
  summary: "Cancel a scheduled Space deletion during its grace period",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: DeletionJobResponseSchema } },
      description: "The canceled deletion job.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "No cancelable job is available to this actor.",
    },
  },
});

const leaveSpaceRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/leave",
  operationId: "leaveSpace",
  tags: ["Members"],
  summary: "Leave a non-personal Space without deleting shared records",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: { content: { "application/json": { schema: LeaveSpaceRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ data: z.object({ left: z.literal(true) }).strict() }).strict(),
        },
      },
      description: "The membership is no longer active; shared records are unchanged.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "A personal Space is deleted rather than left.",
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

const deleteAccountRoute = createRoute({
  method: "post",
  path: "/api/v1/me/deletion",
  operationId: "scheduleAccountDeletion",
  tags: ["Data rights"],
  summary: "Schedule account deletion after a recent sign-in",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: DeleteAccountRequestSchema } },
      required: true,
    },
  },
  responses: {
    202: {
      content: { "application/json": { schema: DeletionJobResponseSchema } },
      description: "The account deletion job.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Invalid confirmation.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "A more recent sign-in is required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "User unavailable.",
    },
  },
});

const usageRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/usage",
  operationId: "getUsageReport",
  tags: ["Operations"],
  summary: "Read the private daily usage and budget report",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: UsageReportResponseSchema } },
      description: "Aggregate counters, application budgets, and provider modes.",
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
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_FAILED",
  message: string,
) {
  return ErrorEnvelopeSchema.parse({ error: { code, message, requestId } });
}

function notFound(requestId: string) {
  return errorEnvelope(requestId, "NOT_FOUND", "The requested resource was not found.");
}

export function registerReleaseRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(exportRoute, async (context) => {
    const spaceId = context.req.valid("param").spaceId;
    const query = context.req.valid("query");
    const resolved = await resolveExportActor(context.env.DB!, context.get("principal"), spaceId);
    if (resolved === null) return context.json(notFound(context.get("requestId")), 404);

    const document = await buildExportDocument(context.env.DB!, {
      actor: resolved.actor,
      scope: resolved.scope,
      spaceId,
    });

    if (query.format === "csv") {
      const csv = renderCsv(document, query.dataset!);
      return new Response(csv, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="vadevi-${query.dataset!}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Request-Id": context.get("requestId"),
        },
      });
    }

    context.header("Cache-Control", "private, no-store");
    context.header("Content-Disposition", 'attachment; filename="vadevi-export.json"');
    return context.json(ExportDocumentSchema.parse(document), 200);
  });

  app.openapi(exportMediaRoute, async (context) => {
    if (context.env.MEDIA === undefined) throw new Error("The R2 binding is unavailable.");
    const spaceId = context.req.valid("param").spaceId;
    const resolved = await resolveExportActor(context.env.DB!, context.get("principal"), spaceId);
    if (resolved === null) return context.json(notFound(context.get("requestId")), 404);

    const { archive, included } = await buildMediaArchive(context.env.DB!, context.env.MEDIA, {
      actor: resolved.actor,
      mediaIds: context.req.valid("json").mediaIds,
      scope: resolved.scope,
      spaceId,
    });

    return new Response(archive, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="vadevi-media.zip"',
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
        "X-Media-Count": String(included.length),
        "X-Request-Id": context.get("requestId"),
      },
    });
  });

  app.openapi(deleteSpaceRoute, async (context) => {
    const result = await scheduleSpaceDeletion(context.env.DB!, {
      confirmationText: context.req.valid("json").confirmationText,
      principal: context.get("principal"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    if (result.kind === "conflict") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VALIDATION_FAILED",
          "The typed confirmation must match the Space name exactly.",
        ),
        400,
      );
    }
    if (result.kind !== "success") return context.json(notFound(context.get("requestId")), 404);
    return context.json(DeletionJobResponseSchema.parse(deletionResponse(result.job)), 202);
  });

  app.openapi(getSpaceDeletionRoute, async (context) => {
    const job = await getDeletionJob(
      context.env.DB!,
      context.get("principal"),
      context.req.valid("param").spaceId,
    );
    return job === null
      ? context.json(notFound(context.get("requestId")), 404)
      : context.json(DeletionJobResponseSchema.parse(deletionResponse(job)), 200);
  });

  app.openapi(cancelSpaceDeletionRoute, async (context) => {
    const result = await cancelSpaceDeletion(context.env.DB!, {
      principal: context.get("principal"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    return result.kind === "success"
      ? context.json(DeletionJobResponseSchema.parse(deletionResponse(result.job)), 200)
      : context.json(notFound(context.get("requestId")), 404);
  });

  app.openapi(leaveSpaceRoute, async (context) => {
    const result = await leaveSpace(context.env.DB!, {
      principal: context.get("principal"),
      pseudonymizeAuthorship: context.req.valid("json").pseudonymizeAuthorship,
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    if (result.kind === "personal_space") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VALIDATION_FAILED",
          "A personal Space is deleted with the account rather than left.",
        ),
        400,
      );
    }
    return result.kind === "success"
      ? context.json({ data: { left: true as const } }, 200)
      : context.json(notFound(context.get("requestId")), 404);
  });

  app.openapi(deleteAccountRoute, async (context) => {
    const result = await scheduleAccountDeletion(context.env.DB!, {
      principal: context.get("principal"),
      requestId: context.get("requestId"),
    });
    if (result.kind === "stale_login") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "FORBIDDEN",
          "Sign in again before confirming account deletion.",
        ),
        403,
      );
    }
    if (result.kind !== "success") return context.json(notFound(context.get("requestId")), 404);
    return context.json(DeletionJobResponseSchema.parse(deletionResponse(result.job)), 202);
  });

  app.openapi(usageRoute, async (context) => {
    const spaceId = context.req.valid("param").spaceId;
    const actor = await context.env
      .DB!.prepare(
        `SELECT actor.id FROM users actor
        JOIN space_memberships membership ON membership.user_id = actor.id
        JOIN spaces space ON space.id = membership.space_id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.space_id = ? AND membership.status = 'active'
          AND space.deleted_at IS NULL`,
      )
      .bind(context.get("principal").firebaseUid, spaceId)
      .first<{ id: string }>();
    if (actor === null) return context.json(notFound(context.get("requestId")), 404);

    const report = await buildUsageReport(context.env.DB!, context.env, {
      nowIso: new Date().toISOString(),
      spaceId,
      userId: actor.id,
    });
    return context.json(UsageReportResponseSchema.parse(report), 200);
  });
}
