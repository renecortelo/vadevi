import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorEnvelopeSchema,
  SpaceIdPathSchema,
  VoiceTranscribeRequestSchema,
  VoiceTranscribeResponseSchema,
} from "@vadevi/contracts";

import { createSpeechToTextPort } from "../adapters/speech-to-text";
import { voiceVocabulary } from "../repositories/voice";
import { reserveProviderBudget } from "../services/usage";
import type { ApiEnvironment } from "../types";

/**
 * Voice tastings (P18), step one: a spoken description becomes text for the
 * reader to read and correct. Nothing is stored — not the recording, not the
 * text — and nothing is saved to a tasting until the reader saves the form.
 * Off unless the deployment has approved
 * `docs/privacy-review-voice-tasting.md` and set `STT_PROVIDER`.
 */
const transcribeRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/voice/transcribe",
  operationId: "transcribeVoice",
  tags: ["Tastings"],
  summary: "Transcribe a spoken tasting, keeping nothing",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: { content: { "application/json": { schema: VoiceTranscribeRequestSchema } } },
    params: SpaceIdPathSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: VoiceTranscribeResponseSchema } },
      description: "What was said, for the reader to correct before anything uses it.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Not an active member of the Space.",
    },
    429: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Today's voice budget is spent; the form works by hand.",
    },
    503: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Voice tastings are not switched on in this deployment.",
    },
  },
});

export function registerVoiceRoutes(app: OpenAPIHono<ApiEnvironment>): void {
  app.openapi(transcribeRoute, async (context) => {
    const { spaceId } = context.req.valid("param");
    const request = context.req.valid("json");
    const error = (
      code: "FEATURE_UNAVAILABLE" | "FORBIDDEN" | "QUOTA_EXHAUSTED",
      message: string,
    ) =>
      ErrorEnvelopeSchema.parse({
        error: { code, message, requestId: context.get("requestId") },
      });

    const speech = createSpeechToTextPort(context.env);
    if (speech === null) {
      return context.json(
        error("FEATURE_UNAVAILABLE", "Voice tastings are not switched on here."),
        503,
      );
    }
    // Reserved before the call, as every provider is; a non-member reserves
    // nothing and is refused.
    const allowed = await reserveProviderBudget(context.env.DB!, {
      firebaseUid: context.get("principal").firebaseUid,
      metric: "voice_transcriptions",
      nowIso: new Date().toISOString(),
      spaceId,
    });
    if (!allowed) {
      const member = await context.env
        .DB!.prepare(
          `SELECT 1 AS ok FROM users actor
          JOIN space_memberships membership ON membership.user_id = actor.id
            AND membership.space_id = ? AND membership.status = 'active'
          WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL`,
        )
        .bind(spaceId, context.get("principal").firebaseUid)
        .first<{ ok: number }>();
      return member === null
        ? context.json(error("FORBIDDEN", "Not a member of this Space."), 403)
        : context.json(error("QUOTA_EXHAUSTED", "Today's voice budget is spent."), 429);
    }

    const audio = Uint8Array.from(atob(request.audio), (character) => character.charCodeAt(0));
    const transcript = await speech.transcribe(audio, {
      language: request.locale.split("-")[0]!,
      vocabulary: await voiceVocabulary(context.env.DB!, { locale: request.locale, spaceId }),
    });
    return context.json(VoiceTranscribeResponseSchema.parse({ data: transcript }), 200);
  });
}
