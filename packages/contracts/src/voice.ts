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
