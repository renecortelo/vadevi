import {
  type SupportedLocale,
  type VoiceExtractResponse,
  VoiceExtractResponseSchema,
  VoiceTranscribeRequestSchema,
  VoiceTranscribeResponseSchema,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/** The recording as the API takes it: base64, in the browser's own format. */
async function base64(audio: Blob): Promise<string> {
  const bytes = new Uint8Array(await audio.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** The formats the API takes, by the browser's own name for them. */
function mimeTypeOf(audio: Blob): "audio/mp4" | "audio/ogg" | "audio/wav" | "audio/webm" {
  const type = audio.type.split(";")[0] ?? "";
  return type === "audio/mp4" || type === "audio/ogg" || type === "audio/wav" ? type : "audio/webm";
}

/** A spoken tasting as text, for the reader to read and correct. Nothing is kept. */
export async function transcribeVoice(
  tokenSource: TokenSource,
  spaceId: string,
  audio: Blob,
  locale: SupportedLocale,
): Promise<string> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/voice/transcribe`,
    {
      body: JSON.stringify(
        VoiceTranscribeRequestSchema.parse({
          audio: await base64(audio),
          locale,
          mimeType: mimeTypeOf(audio),
        }),
      ),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return VoiceTranscribeResponseSchema.parse(await response.json()).data.text;
}

/** The form fields a corrected transcript proposes, each with its words. */
export async function extractVoice(
  tokenSource: TokenSource,
  spaceId: string,
  text: string,
  locale: SupportedLocale,
  today: string,
): Promise<VoiceExtractResponse["data"]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/voice/extract`,
    {
      body: JSON.stringify({ locale, text, today }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return VoiceExtractResponseSchema.parse(await response.json()).data;
}
