# Pre-production checklist

§22.2, with each item marked by what actually verifies it. This is the list for
putting a deployment in front of people who are not you — §22.3
(`public-release-checklist.md`) is a different question, about publishing the
source, and it is already done.

Status key: **automated** runs in `pnpm check`; **manual** needs you; **blocked**
waits on a production deployment that does not exist yet.

Audited 17 September 2026. Two items changed the code rather than just reading
it; both are noted where they sit.

---

## Verified

- [x] **automated** — Secrets present only in bindings; logs redact protected
      fields. `pnpm scan:release` holds the first half: deployment configuration
      is git-ignored _and_ untracked, and no secret or real identifier is in the
      tree. The second half was read line by line. The API logs from ten places
      and every one is disciplined: the error handler emits a request id and an
      error _name_, never a message or a stack; the provider adapters log the
      model and the error's name; the assistant adapter logs `typeof` the model's
      reply rather than the reply, with a comment saying why. No user text, no
      wine, no provider payload reaches a log.

- [x] **automated** — CSP and security headers pass browser flows.
      `apps/web/src/security/headers.test.ts` pins the deployed policy in
      `apps/web/public/_headers`, including the sign-in path that only a real
      deployment exercises — a preview deployment caught that the hard way once.
      The served policy is `default-src 'self'` with `script-src` widened only by
      `'wasm-unsafe-eval'` for the barcode decoder, and `img-src` carrying no tile
      host, because tiles are proxied through this origin instead.

- [x] **manual** — R2 bucket private, MIME behavior verified _in code_. Object
      keys are server-generated and withheld from public contracts; uploads are
      re-encoded in the browser and then re-validated by the Worker against magic
      bytes (`0xff 0xd8` for JPEG, `RIFF`/`WEBP` for WebP), dimensions, size, and
      EXIF. Header-only parsing, so a crafted body cannot walk the decoder.
      **CORS on the live bucket is not covered by this** — see below.

- [x] **manual** — Provider terms, attribution, rate limits, and retention
      disclosed. Five per-provider reviews plus the map-tile section, each naming
      what leaves the device, what comes back, what is stored, and the provider's
      own ceiling. Attribution is rendered in the interface where the licence
      requires it. **Changed today:** the tile ceiling described here did not
      exist until this audit.

- [x] **manual** — AI and external-research budgets set; no paid fallback.
      `dailyBudgets` in `apps/api/src/services/usage.ts` caps five metrics per
      day, globally and per user, and the cap is enforced before the provider is
      called; at the cap a request degrades rather than escalating to a paid
      model. **Changed today:** map tiles were the exception. That route answers
      without a session and had neither budget nor rate limit, so a stranger
      walking distinct coordinates — which miss the cache by construction — would
      have reached OpenStreetMap under this deployment's own identifying user
      agent, and the deployment is what their policy gets to block. Upstream tile
      fetches are now capped per minute, counted only past the cache.

- [x] **manual** — Accessibility, threat-model, privacy, and restore/delete
      reviews signed off. 17 September 2026. Two of the four required a change
      before they could be signed honestly; the reasoning is kept with the
      signatures.

- [x] **automated** — D1 migrations applied. `pnpm deploy:preview` applies them
      before it builds or deploys anything and stops at the first failure, so a
      Worker cannot go out ahead of its schema. The **backup/export procedure**
      half of this item is below.

## Yours, and genuinely yours

- [x] **manual** — Backup and export procedure tested, both halves, 17 September 2026. D1 was exported, restored into a scratch database, and compared: row
      counts identical across six tables. That drill is what found the other
      half missing — the export indexes the photographs, the bucket holds them,
      and nothing backed the bucket up. `pnpm backup:r2` now does, taking its
      object list from D1 and verifying each download against the `sha256`
      recorded there; its first run returned 37 of 37 verified. A backup that has
      never been restored is a hypothesis, and neither of these is one now.

- [x] **manual** — All acceptance criteria listed in §20 pass or are explicitly
      not applicable. `docs/manual-acceptance.md` is the script: 86 items, run
      by the maintainer on iPhone and desktop with two accounts across 18–19
      September 2026 (items 34–38, the operator's, run from the terminal on the
      maintainer's behalf). Every item passes on the deployment of 19 September;
      the four rounds' findings and their fixes are in
      `docs/acceptance-findings.md` — sixteen in all, every one closed.

- [x] **manual** — Zero-cost quotas rechecked against official provider pages,
      17 September 2026. Three things were wrong; see below.

### What the quota recheck found

The item that repaid the effort, so what it turned up is kept here rather than
compressed into a tick.

**The application's AI budget is far above the free allowance.** Workers AI gives
10,000 Neurons a day as a _single shared pool_, and Neurons are priced per model.
On the default `llama-3.3-70b-instruct-fp8-fast` a reply costs roughly 91, so the
free day is about 110 replies against a shipped budget of 1,000 — about nine
times over. OCR's own 300 reads fit inside the allowance, but only until the
assistant has emptied the pool they share. "No automatic paid fallback" remained
true throughout, and is a different claim from "cannot exceed the free tier".

**Brave Search has changed pricing model.** It is now $5 per 1,000 requests
against $5 of monthly credit — about 1,000 requests a month, roughly 33 a day,
against a research budget of 300 a day.

**The published caps table was wrong.** It listed Vicenç at 60/400 where the code
has 200/1,000, and omitted research and price lookups entirely. A deployer sizing
their costs from that table was working from numbers that were never true.
Corrected, and `docs/self-hosting.md` now carries the provider allowances beside
the application's own, with the per-model arithmetic.

Nominatim, OSM tiles, Wikidata and Open Food Facts remain free under usage
policies the application already respects.

What none of this decides: whether to lower the budgets, move to a cheaper model,
or accept the bill. That belongs to whoever pays it, and it is now a decision
that can be made on numbers.

## Blocked until a production deployment exists

Nothing below can be verified against a preview. They are listed so that
"pre-production" does not read as done when it is not.

- [ ] **blocked** — Production Firebase authorized domains and Google provider
      reviewed.
- [ ] **blocked** — Preview and production resources are isolated. The public
      template ships local placeholders and the real configurations are untracked
      by design, so isolation is a property of two deployments, only one of which
      exists. Never share a D1 database, an R2 bucket, a Firebase project, a
      secret, or an analytics property between them.
- [ ] **blocked** — CORS behavior verified on the live R2 bucket.
- [ ] **blocked** — User-facing privacy notice current _for that deployment_.
      The posture in `docs/privacy.md` is current as of today, including map
      tiles; what a production deployment actually turns on is what its notice
      has to say.

---

## What this checklist is not

Passing it does not make a deployment public, and §22.3 passing did not make one
private. The source is published; the wine lives in whichever D1 and R2 a
deployer owns, with every provider that would leave the deployment off until they
turn it on. Pairing is the one exception and only because it is not one: it ships
set to `local`, which is a rule set inside the Worker and reaches no host.
