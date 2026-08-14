# Privacy review: Workers AI label OCR

§12.5 and §15.8 require a deployment-specific privacy review before an optional
AI provider is enabled. This document is that review for label reading.

**This one deserves more scrutiny than the Open Food Facts review**, because it
sends an actual photograph off the deployment rather than a barcode number.

**Current state: not enabled.** `AI_PROVIDER=none` is the default in
`.dev.vars.example` and `wrangler.example.jsonc`. OCR additionally requires
`AI_OCR_MODEL` to name an allowlisted vision model, so enabling AI for the
assistant does _not_ silently enable label reading.

- Decision: ☐ approved ☐ rejected
- Decided by: ______________________
- Date: ______________________

## What the capability does

When a user photographs a bottle, the already-processed image is sent to a
Cloudflare Workers AI vision model with a fixed instruction to transcribe the
visible text. The returned lines become **low-confidence, `inferred`** candidate
fields the user must confirm or correct. Nothing is saved without confirmation.

## What leaves the deployment

**The label photograph**, as bytes, plus a fixed instruction string.

That is a meaningful disclosure and should not be understated. Before you
approve this, consider what your members will actually photograph.

| Sent                | Notes                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Image bytes         | Already resized, re-encoded, and EXIF/GPS-stripped in the browser before upload, so no location travels with it.                                |
| A fixed instruction | Hard-coded in `label-ocr.ts`. Never assembled from user text or label content, so nothing on a bottle can change what the model is asked to do. |

What is **never** sent: user identity, Space identity, tasting notes, comments,
chat text, other wines, prices, or any database row.

## The receipt problem

§15.5 already warns that **receipt images may contain names, card fragments, and
addresses**. This capability is scoped to `label` media only and is not offered
for receipts — but the boundary is a code-level scoping decision, not a
guarantee about what a user might photograph.

A user _can_ point the camera at anything. If they photograph a label with a
gift message, a restaurant bill in frame, or a person, those pixels go to the
provider. Consider whether your members understand that before enabling.

## Where the image goes

Cloudflare Workers AI runs on Cloudflare's infrastructure. The image is sent to
the provider binding within the same account boundary as the rest of your
deployment — it does not transit a third-party AI vendor.

**Verify Cloudflare's current Workers AI data-handling terms on the day you
enable this**, specifically whether inputs may be retained or used for model
improvement, and record the date and finding below. This is the single most
important line in this document and it must not be filled in from memory.

- Cloudflare Workers AI terms checked on: ______________________
- Retention/training finding: ______________________

## What the application stores

- **Not stored**: the image bytes passed to the adapter, the raw provider
  response, and any discarded line.
- **Stored only if the user confirms**: the wine fields they accepted, as an
  ordinary wine record. The image itself remains your own R2 object, unchanged
  by this capability.
- **Audit**: the existing redacted tool-run record keeps an outcome, a count, and
  the model version — never the image or the transcribed text.

## Hostile-content handling

A wine label is attacker-controllable content, and the pipeline treats it that
way. Returned text is Unicode-normalized, stripped of control and bidirectional
characters, length-bounded, capped at 24 lines, and **discarded entirely** when a
line resembles an instruction, a tool request, or credential extraction. A
discarded line raises a visible warning rather than silently vanishing.

This reuses the same `sanitizeExternalText` boundary Phase 4 built for research
content, so label text cannot reach a later model call as an instruction.

## Limits and cost

- `AI_OCR_MODEL` must name a model on the allowlist in `label-ocr.ts`.
- The `ocr_reads` daily cap (40 per user, 300 globally) is enforced **before**
  the call. At the cap, identification silently falls back to barcode and Space
  matching with an explicit warning.
- Workers AI free allocation is 10,000 neurons/day (§16.1). The application cap
  sits below it, and §12.5 forbids an automatic paid fallback.

## Honest assessment of value

Wine labels are among the harder OCR targets: curved glass, foil, decorative and
script typefaces, low restaurant light. Expect the vintage year to be read
reliably and producer names to be read inconsistently.

The candidate is offered at **low confidence** precisely because of this, and the
user edits every field before saving. Treat this as a typing shortcut, not as
identification.

## Recommendation

Approving this is defensible **if** the Cloudflare terms check above comes back
clean and your members understand that photographs leave the deployment.

If you want the identification flow without that disclosure, reject this review
and keep barcode scanning only. Barcode matching against your own Space needs no
provider, sends nothing anywhere, works offline, and is the higher-hit-rate path
for the common case of re-logging a wine you have had before.

## How to enable

Only after the decision and the terms check above are recorded:

```
AI_PROVIDER=cloudflare
AI_MODEL=@cf/meta/llama-3.1-8b-instruct
AI_OCR_MODEL=@cf/meta/llama-3.2-11b-vision-instruct
```

Plus an `AI` binding in your Wrangler configuration.

## How to disable

Set `AI_PROVIDER=none`, or simply remove `AI_OCR_MODEL` to keep the assistant's
language rendering while turning off label reading. Redeploy. No stored data
needs clearing, because no image or transcript is retained.
