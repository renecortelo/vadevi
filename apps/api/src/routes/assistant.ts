import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  AssistantTurnRequestSchema,
  AssistantTurnResponseSchema,
  ErrorEnvelopeSchema,
  SpaceIdPathSchema,
} from "@vadevi/contracts";

import { createAssistantLanguagePort } from "../adapters/assistant-language";
import { createFoodPairingPort } from "../adapters/pairing-factory";
import { createSemanticNotePort } from "../adapters/semantic-notes";
import { reserveProviderBudget } from "../services/usage";
import { externalResearchEnabled } from "../adapters/research-factory";
import { runDeterministicAssistantTurn } from "../repositories/assistant";
import type { ApiEnvironment } from "../types";

const assistantTurnRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/assistant/turns",
  operationId: "createAssistantTurn",
  tags: ["Assistant"],
  summary: "Run one ephemeral, bounded Vicenç turn over authorized data",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: {
      content: { "application/json": { schema: AssistantTurnRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AssistantTurnResponseSchema } },
      description:
        "An ephemeral assistant turn. AI-disabled deployments return deterministic structured search.",
    },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The bounded turn request is invalid.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication is required.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The active Space is unavailable to the caller.",
    },
  },
});

export function registerAssistantRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(assistantTurnRoute, async (context) => {
    const spaceId = context.req.valid("param").spaceId;
    const language = createAssistantLanguagePort(context.env);
    // Reaching the application's daily language budget degrades this turn to the
    // deterministic path instead of erroring or spending beyond the cap.
    const withinBudget =
      language === null ||
      (await reserveProviderBudget(context.env.DB!, {
        firebaseUid: context.get("principal").firebaseUid,
        metric: "ai_language_calls",
        nowIso: new Date().toISOString(),
        spaceId,
      }));
    const response = await runDeterministicAssistantTurn(context.env.DB!, {
      aiProvider: context.env.AI_PROVIDER ?? "none",
      externalResearch: externalResearchEnabled(context.env),
      language: withinBudget ? language : null,
      pairing: withinBudget ? createFoodPairingPort(context.env.DB!, context.env) : null,
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      semanticNotes: createSemanticNotePort(context.env),
      spaceId,
    });
    if (response === null) {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "NOT_FOUND",
            message: "The requested resource was not found.",
            requestId: context.get("requestId"),
          },
        }),
        404,
      );
    }
    return context.json(AssistantTurnResponseSchema.parse(response), 200);
  });
}
