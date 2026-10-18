import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorEnvelopeSchema,
  SpaceIdPathSchema,
  VoiceExtractRequestSchema,
  VoiceExtractResponseSchema,
  VoiceReviewRequestSchema,
  VoiceReviewResponseSchema,
  VoiceTranscribeRequestSchema,
  VoiceTranscribeResponseSchema,
} from "@vadevi/contracts";

import { createSpeechToTextPort } from "../adapters/speech-to-text";
import { createVoiceExtractionPort, voiceInputEnabled } from "../adapters/voice-extraction";
import {
  knownGrapes,
  placeHeardRegion,
  saveVoiceReview,
  voiceVocabulary,
} from "../repositories/voice";
import { acceptProposal } from "../services/voice-proposal";
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

const extractRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/voice/extract",
  operationId: "extractVoiceTasting",
  tags: ["Tastings"],
  summary: "Propose tasting fields from a spoken note, each with the words it came from",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: { content: { "application/json": { schema: VoiceExtractRequestSchema } } },
    params: SpaceIdPathSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: VoiceExtractResponseSchema } },
      description: "A proposal for the reader to review; nothing is saved.",
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
      description: "Today's language-model budget is spent; the form works by hand.",
    },
    503: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Voice tastings, or the language model, are not switched on here.",
    },
  },
});

/**
 * A spoken note sent for review, when the reader chooses to: the one exception
 * to "nothing is stored", recorded in `docs/privacy-review-voice-tasting.md`.
 * Kept thirty days, never the audio.
 */
const reviewRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/voice/reviews",
  operationId: "sendVoiceReview",
  tags: ["Tastings"],
  summary: "Send a spoken note, as heard and as corrected, to improve voice tastings",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: { content: { "application/json": { schema: VoiceReviewRequestSchema } } },
    params: SpaceIdPathSchema,
  },
  responses: {
    201: {
      content: { "application/json": { schema: VoiceReviewResponseSchema } },
      description: "Kept for review until the date given, then removed.",
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
      description: "Enough notes sent for one day.",
    },
    503: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Voice tastings are not switched on in this deployment.",
    },
  },
});

/** Not a member, or out of budget: told apart for the answer. */
async function refusal(database: D1Database, spaceId: string, firebaseUid: string) {
  const member = await database
    .prepare(
      `SELECT 1 AS ok FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
        AND membership.space_id = ? AND membership.status = 'active'
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL`,
    )
    .bind(spaceId, firebaseUid)
    .first<{ ok: number }>();
  return member === null ? ("FORBIDDEN" as const) : ("QUOTA_EXHAUSTED" as const);
}

export function registerVoiceRoutes(app: OpenAPIHono<ApiEnvironment>): void {
  app.openapi(reviewRoute, async (context) => {
    const { spaceId } = context.req.valid("param");
    const request = context.req.valid("json");
    const error = (
      code: "FEATURE_UNAVAILABLE" | "FORBIDDEN" | "QUOTA_EXHAUSTED",
      message: string,
    ) =>
      ErrorEnvelopeSchema.parse({ error: { code, message, requestId: context.get("requestId") } });
    if (!voiceInputEnabled(context.env)) {
      return context.json(
        error("FEATURE_UNAVAILABLE", "Voice tastings are not switched on here."),
        503,
      );
    }
    const saved = await saveVoiceReview(context.env.DB!, {
      firebaseUid: context.get("principal").firebaseUid,
      form: request.form,
      kind: request.kind,
      locale: request.locale,
      nowIso: new Date().toISOString(),
      proposal: request.proposal,
      spaceId,
      text: request.text,
    });
    if (saved === null) return context.json(error("FORBIDDEN", "Not a member of this Space."), 403);
    if (saved === "LIMIT") {
      return context.json(error("QUOTA_EXHAUSTED", "Enough notes sent for today."), 429);
    }
    return context.json(VoiceReviewResponseSchema.parse({ data: saved }), 201);
  });

  app.openapi(extractRoute, async (context) => {
    const { spaceId } = context.req.valid("param");
    const request = context.req.valid("json");
    const firebaseUid = context.get("principal").firebaseUid;
    const error = (
      code: "FEATURE_UNAVAILABLE" | "FORBIDDEN" | "QUOTA_EXHAUSTED",
      message: string,
    ) =>
      ErrorEnvelopeSchema.parse({ error: { code, message, requestId: context.get("requestId") } });
    const extraction = createVoiceExtractionPort(context.env);
    if (extraction === null) {
      return context.json(
        error("FEATURE_UNAVAILABLE", "Voice tastings are not switched on here."),
        503,
      );
    }
    // The language model is metered as the assistant's is: one shared budget.
    const allowed = await reserveProviderBudget(context.env.DB!, {
      firebaseUid,
      metric: "ai_language_calls",
      nowIso: new Date().toISOString(),
      spaceId,
    });
    if (!allowed) {
      const code = await refusal(context.env.DB!, spaceId, firebaseUid);
      return code === "FORBIDDEN"
        ? context.json(error(code, "Not a member of this Space."), 403)
        : context.json(error(code, "Today's language-model budget is spent."), 429);
    }
    const proposal = acceptProposal(
      await extraction.propose(request.text, request.today),
      request.text,
      request.today,
    );
    const grapes = proposal.fields.grapes;
    if (grapes !== undefined && Array.isArray(grapes.value)) {
      const known = await knownGrapes(context.env.DB!, grapes.value);
      if (known.length === 0) {
        delete proposal.fields.grapes;
        proposal.discarded.push({ field: "grapes", reason: "out-of-range" });
      } else grapes.value = known;
    }
    const heard = proposal.fields.region?.value;
    const country = proposal.fields.countryCode?.value;
    const region =
      typeof heard === "string"
        ? await placeHeardRegion(
            context.env.DB!,
            heard,
            typeof country === "string" ? country : null,
          )
        : null;
    // What was discarded is counted for the operator, never logged as words.
    if (proposal.discarded.length > 0) {
      console.info(`voice extraction: ${proposal.discarded.length} proposed values discarded`);
    }
    return context.json(
      VoiceExtractResponseSchema.parse({
        data: { fields: proposal.fields, region, severalWines: proposal.severalWines },
      }),
      200,
    );
  });

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
