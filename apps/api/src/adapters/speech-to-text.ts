import { sanitizeExternalText } from "@vadevi/domain";

import type { WorkerBindings } from "../types";

/**
 * Voice tastings, step one: speech to text, and nothing more. The recording
 * becomes the words that were said; deciding what they mean for the form is
 * a separate step (`voice-extraction`), so either can change without the
 * other, and a wrong field can be traced to the hearing or to the reading.
 *
 * Off unless the deployment has approved `docs/privacy-review-voice-tasting.md`
 * and set `STT_PROVIDER=cloudflare`: the recording leaves the Worker for
 * Workers AI. It is never stored, here or anywhere.
 */
export const speechModel = "@cf/openai/whisper-large-v3-turbo";

/** The most text a transcript may carry: two minutes of speech, with room. */
const transcriptLimit = 6_000;

export type Transcript = {
  /** The language the model heard, as it names it ("es", "ca"), or null. */
  language: string | null;
  /** How long the recording was, as the model measured it, or null. */
  seconds: number | null;
  text: string;
};

export interface SpeechToTextPort {
  transcribe(
    audio: Uint8Array,
    options: { language?: string; vocabulary: string },
  ): Promise<Transcript>;
}

type SpeechRunner = { run(model: string, input: Record<string, unknown>): Promise<unknown> };

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

class CloudflareSpeechToText implements SpeechToTextPort {
  constructor(private readonly binding: SpeechRunner) {}

  async transcribe(
    audio: Uint8Array,
    options: { language?: string; vocabulary: string },
  ): Promise<Transcript> {
    // Tested on 16 October 2026: the model takes Chrome's webm/opus and
    // Safari's mp4/aac as base64, and the vocabulary hint is what spells
    // "Mencía" and "taninos" right (docs/backlog.md, P18).
    const output = (await this.binding.run(speechModel, {
      audio: base64(audio),
      // Without these the model can loop on a phrase ("zegt hij, zegt hij…"):
      // it did in 4 of 40 real recordings on 16 October 2026, and in none with
      // voice detection on and each segment heard on its own.
      condition_on_previous_text: false,
      vad_filter: true,
      ...(options.language === undefined ? {} : { language: options.language }),
      ...(options.vocabulary === "" ? {} : { initial_prompt: options.vocabulary }),
    })) as { text?: unknown; transcription_info?: { duration?: unknown; language?: unknown } };
    const info = output.transcription_info ?? {};
    return {
      language: typeof info.language === "string" ? info.language : null,
      seconds: typeof info.duration === "number" ? Math.round(info.duration * 10) / 10 : null,
      // What was said is the reader's own, but it reaches a model next:
      // normalised, stripped of control characters, bounded.
      text: sanitizeExternalText(
        typeof output.text === "string" ? output.text : "",
        transcriptLimit,
      ).value,
    };
  }
}

/** `null` unless the deployment has switched voice tastings on. */
export function createSpeechToTextPort(environment: WorkerBindings): SpeechToTextPort | null {
  if (environment.STT_PROVIDER !== "cloudflare") return null;
  const binding = environment.AI as SpeechRunner | undefined;
  return binding === undefined ? null : new CloudflareSpeechToText(binding);
}
