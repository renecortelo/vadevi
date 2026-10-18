import { z } from "@hono/zod-openapi";

import { SupportedLocaleSchema } from "./session";

/**
 * The most a recording may be, as base64: two minutes in the browser's own
 * format (Chrome's webm/opus, Safari's mp4/aac) fit with room to spare.
 */
export const voiceAudioMaxBase64 = 4_000_000;

/** A spoken tasting to transcribe. The recording is never stored. */
export const VoiceTranscribeRequestSchema = z
  .object({
    audio: z
      .string()
      .min(1)
      .max(voiceAudioMaxBase64)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    /** The reader's language, a hint the model may overrule if it hears another. */
    locale: SupportedLocaleSchema,
    mimeType: z.enum(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"]),
  })
  .strict()
  .openapi("VoiceTranscribeRequest");

export const VoiceTranscribeResponseSchema = z
  .object({
    data: z
      .object({
        /** The language the model heard ("es", "ca"…), or null. */
        language: z.string().nullable(),
        seconds: z.number().nonnegative().nullable(),
        /** What was said, for the reader to read and correct before anything uses it. */
        text: z.string(),
      })
      .strict(),
  })
  .strict()
  .openapi("VoiceTranscribeResponse");

export type VoiceTranscribeRequest = z.infer<typeof VoiceTranscribeRequestSchema>;

/** A transcript, read and corrected by the reader, to propose form fields from. */
export const VoiceExtractRequestSchema = z
  .object({
    locale: SupportedLocaleSchema,
    text: z.string().trim().min(1).max(6_000),
    /** The reader's own date, so "today" and "yesterday" mean theirs. */
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
  .openapi("VoiceExtractRequest");

const VoiceFieldProposalSchema = z
  .object({
    /** The transcript's words the value came from. */
    quote: z.string(),
    /** "ambiguous": the speaker hedged; offered, never filled on its own. */
    status: z.enum(["ambiguous", "explicit"]),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  })
  .strict();

export const VoiceExtractResponseSchema = z
  .object({
    data: z
      .object({
        /** By form field; a field nobody spoke of is absent, never guessed. */
        fields: z.record(z.string(), VoiceFieldProposalSchema),
        /** The registered name the region heard is, when one is certain. */
        region: z.object({ name: z.string(), regionId: z.string() }).strict().nullable(),
        /** The note describes more than one wine: only the first is proposed. */
        severalWines: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .openapi("VoiceExtractResponse");

export type VoiceExtractResponse = z.infer<typeof VoiceExtractResponseSchema>;

/**
 * A spoken note the reader chooses to send for review, to correct voice
 * tastings on real use: the transcript as corrected, what the app proposed,
 * and the form as the reader left it. Never the audio; kept thirty days.
 */
export const VoiceReviewRequestSchema = z
  .object({
    /** The form state as the reader left it, field by field. */
    form: z
      .record(z.string().max(60), z.unknown())
      .refine((value) => JSON.stringify(value).length <= 20_000, "Form state too large."),
    kind: z.enum(["quick", "deep", "wine"]),
    locale: SupportedLocaleSchema,
    proposal: VoiceExtractResponseSchema.shape.data,
    text: z.string().trim().min(1).max(6_000),
  })
  .strict()
  .openapi("VoiceReviewRequest");

export type VoiceReviewRequest = z.infer<typeof VoiceReviewRequestSchema>;

export const VoiceReviewResponseSchema = z
  .object({
    data: z.object({ expiresAt: z.string(), id: z.string() }).strict(),
  })
  .strict()
  .openapi("VoiceReviewResponse");
