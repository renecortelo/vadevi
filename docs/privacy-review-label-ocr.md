# Privacy review: Workers AI label OCR

§12.5 and §15.8 require a deployment-specific privacy review before an optional
AI provider is enabled. This document is that review for label reading.

**This one deserves more scrutiny than the Open Food Facts review**, because it
sends an actual photograph off the deployment rather than a barcode number.

**Current state: not enabled.** `AI_PROVIDER=none` is the default in
`.dev.vars.example` and `wrangler.example.jsonc`. OCR additionally requires
`AI_OCR_MODEL` to name an allowlisted vision model, so enabling AI for the
assistant does _not_ silently enable label reading.

- Decision: ☑ approved ☐ rejected
- Decided by: the maintainer
- Date: 17 September 2026

This records the decision taken for the reference deployment, on the terms check
dated the same day. It is not a decision taken on your behalf: the box is here
because §12.5 asks each deployment to make this call, and yours is still yours to
make. If you are reading this in a repository you cloned, the honest starting
point is that `AI_PROVIDER` is `none` and a photograph goes nowhere.

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

- Cloudflare Workers AI terms checked on: **2026-09-17** (first checked
  2026-08-16; rechecked because the provider had been enabled in the meantime)
- Source: <https://developers.cloudflare.com/workers-ai/platform/data-usage/>
- **Unchanged since the first check.** The page carries its own "last updated"
  date of 21 April 2026, which predates both readings, so nothing moved between
  them. Every finding below was re-read against the live page, not carried over.
- **Retention finding:** inputs are not retained automatically. Cloudflare states
  that Customer Content "may be stored by Cloudflare if you specifically use a
  storage service (e.g., R2, KV, DO, Vectorize, etc.)" — this application uses
  none of those for OCR, so the image is passed through and not persisted.
- **Training finding:** Cloudflare states it "does not use your Customer Content
  to (1) train any AI models made available on Workers AI or (2) improve any
  Cloudflare or third-party services." The current page continues that sentence
  with "and would not do so unless we received your explicit consent" — so the
  protection is a commitment not to do it silently, not a technical bar. Consent
  is yours to withhold; do not grant it on an account running this.
- **Isolation finding:** Cloudflare states it "does not make your Customer
  Content available to any other Cloudflare customer."
- **Model-licence finding:** Cloudflare "neither creates nor trains" these
  models; they are third-party services under their own licence terms. The
  allowlist in `apps/api/src/adapters/label-ocr.ts` is what keeps that surface
  to models chosen deliberately.
- **Not established:** the page still does not describe request logging. If
  logging of inputs matters to you beyond retention and training, raise it with
  Cloudflare support.

Recheck this before enabling — a provider is free to change its terms, and this
finding is only as current as the date above.

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
- Workers AI free allocation is 10,000 Neurons a day (§16.1), rechecked
  2026-09-17. OCR's own cap sits below it — about 22 Neurons a read on the 11b
  vision model, so 300 reads is roughly 6,600 — and §12.5 forbids an automatic
  paid fallback.
- **But the allocation is one shared pool, not a per-feature one.** Assistant
  replies draw on the same 10,000, and on the default 70b text model their own
  budget is several times the whole day's allowance, so OCR can be refused by
  Cloudflare on a day when its application cap was never reached.
  `docs/self-hosting.md` has the arithmetic per model. Size the budgets to the
  plan you are on before enabling this.

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
