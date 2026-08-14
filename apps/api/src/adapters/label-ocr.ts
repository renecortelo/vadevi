import type { ExternalResult, OcrPort, OcrRequest, OcrResult } from "@vadevi/domain";
import { sanitizeExternalText } from "@vadevi/domain";
import { z } from "zod";

import type { WorkerBindings } from "../types";

/**
 * Optional label OCR through Workers AI.
 *
 * The adapter is deliberately narrow:
 *
 * - it receives already re-encoded, EXIF-stripped bytes and never stores them
 * - it exposes no tools and returns text only, never a wine record
 * - returned text is sanitized and bounded exactly like any other external
 *   string, because a label is attacker-controllable content
 * - a deployment without `AI_PROVIDER=cloudflare` gets `null` here, and the
 *   identification flow degrades to barcode plus manual entry
 */

type VisionRunner = Readonly<{
  run: (model: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}>;

/** Only the fields the adapter reads; anything else in the response is dropped. */
const VisionResponseSchema = z
  .object({
    description: z.string().max(4_000).optional(),
    text: z.string().max(4_000).optional(),
  })
  .passthrough();

/** A label line longer than this is noise rather than a producer or wine name. */
const maximumLineLength = 160;
const maximumLines = 24;

export const ocrModelAllowlist = new Set([
  "@cf/meta/llama-3.2-11b-vision-instruct",
  "@cf/unum/uform-gen2-qwen-500m",
  "@cf/llava-hf/llava-1.5-7b-hf",
]);

/**
 * The instruction is fixed in code and never assembled from user or label text,
 * so nothing on a bottle can change what the model is asked to do.
 */
const readingInstruction =
  "Transcribe the visible text on this wine label. " +
  "Return each distinct line of text on its own line. " +
  "Do not translate, interpret, summarize, or add any text that is not printed on the label.";

export class CloudflareLabelOcrAdapter implements OcrPort {
  constructor(
    private readonly ai: VisionRunner,
    private readonly model: string,
  ) {}

  async readLabel(input: OcrRequest): Promise<ExternalResult<OcrResult>> {
    let raw: Record<string, unknown>;
    try {
      raw = await this.ai.run(this.model, {
        image: [...new Uint8Array(input.bytes)],
        max_tokens: 512,
        prompt: readingInstruction,
      });
    } catch {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }

    const parsed = VisionResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { reason: "provider_error", retryAfterSeconds: null, status: "unavailable" };
    }

    const body = parsed.data.text ?? parsed.data.description ?? "";
    const warnings: string[] = [];
    const lines: OcrResult["lines"] = [];

    for (const candidate of body.split(/\r?\n/)) {
      if (lines.length >= maximumLines) break;
      const sanitized = sanitizeExternalText(candidate, maximumLineLength);
      if (sanitized.value.length === 0) continue;
      if (sanitized.flaggedPromptLike) {
        // Label text that reads like an instruction is discarded rather than
        // carried forward into a candidate field.
        warnings.push("Some label text was ignored because it resembled an instruction.");
        continue;
      }
      lines.push({
        // A short all-caps or title-case line is usually the producer or wine
        // name; a long run-on line is usually legal small print.
        confidence: sanitized.value.length <= 48 ? "medium" : "low",
        text: sanitized.value,
      });
    }

    if (lines.length === 0) {
      return { reason: "not_found", retryAfterSeconds: null, status: "unavailable" };
    }

    return {
      cached: false,
      data: { lines, provider: "cloudflare_ai", warnings },
      status: "success",
    };
  }
}

/**
 * Returns `null` unless the deployment has explicitly enabled Workers AI with
 * an allowlisted vision model. The public default stays `AI_PROVIDER=none`.
 */
export function createLabelOcrPort(environment: WorkerBindings): OcrPort | null {
  if (environment.AI_PROVIDER !== "cloudflare") return null;
  const model = environment.AI_OCR_MODEL;
  if (model === undefined || !ocrModelAllowlist.has(model)) return null;
  const binding = environment.AI as VisionRunner | undefined;
  if (binding === undefined) return null;
  return new CloudflareLabelOcrAdapter(binding, model);
}
