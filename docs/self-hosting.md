# Self-hosting Va de Vi

This guide takes a general technical user from a clean clone to a running
private deployment. It assumes no prior Cloudflare or Firebase knowledge, but it
does assume you are comfortable in a terminal.

Va de Vi is designed for a household or a small group of friends. It is **not**
a multi-tenant service, and nothing here is a public wine database.

## What it costs

Nothing, under current provider free allowances, for a group of this size. The
application enforces its own daily caps below the provider limits so it stops
before a bill could start (§16).

Two honest caveats. Cloudflare requires a **payment method on file to enable
R2**, even though the 10 GB free allowance costs €0 — if you would rather not,
skip R2 and lose photo storage only. And free allowances are the providers' to
change; recheck them before you rely on them.

## What you need

- Node.js 24 or newer
- A Cloudflare account
- A Google account, for Firebase
- About 30 minutes

## 1. Install

```bash
git clone <your-fork-or-this-repository>
cd vadevi
npm install -g pnpm@11.16.0
pnpm install
```

Check it works locally before touching any provider:

```bash
pnpm dev
```

Open `http://localhost:5173`. You will see the sign-in screen. Local development
uses the Firebase Auth Emulator against a synthetic `demo-vadevi` project, so
nothing here touches a real account:

```bash
pnpm dev:auth
```

## 2. Firebase

Firebase provides identity only. It stores no wine data.

1. At **https://console.firebase.google.com**, create a project. Turn Google
   Analytics **off** — this application ships no third-party analytics and §15.8
   intends to keep it that way.
2. **Build → Authentication → Get started → Sign-in method → Google.** Enable it
   and set a support email.
3. **Project settings → Your apps → Web.** Register an app and copy the
   `apiKey`, `authDomain`, and `projectId`. These are public browser
   configuration, not secrets, but they are still environment identifiers and
   must not be committed.

## 3. Cloudflare

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create vadevi
pnpm exec wrangler r2 bucket create vadevi-media   # optional; skip for no photos
```

Copy the `database_id` that `d1 create` prints.

## 4. Configure

Create `wrangler.production.jsonc` from `wrangler.example.jsonc`. It is
git-ignored, so your real identifiers stay out of the repository.

Replace the placeholder `database_id`, set the three Firebase values, and set:

```jsonc
"vars": {
  "APP_ENV": "production",
  "FIREBASE_AUTH_PROXY": "true",
  "AI_PROVIDER": "none",
  "RESEARCH_PROVIDER": "none"
}
```

Three lines matter more than they look:

- **`APP_ENV`** must not be `local`, or the app stays in emulator mode and real
  token verification never runs. `pnpm validate:env` enforces this.
- **`FIREBASE_AUTH_PROXY`** serves Firebase's sign-in handler from your own
  origin. Without it, browsers that partition third-party storage break sign-in
  entirely, because your app and `*.firebaseapp.com` are different origins.
- **`crons`** must be present, or confirmed deletions are scheduled and never
  executed.

If you skipped R2, remove the `r2_buckets` block. Photo upload then reports
itself unavailable rather than failing.

## 5. Deploy

```bash
pnpm exec wrangler d1 migrations apply vadevi --remote --config wrangler.production.jsonc
pnpm --filter @vadevi/web build
pnpm exec wrangler deploy --config wrangler.production.jsonc
```

Copy the URL it prints.

## 6. Authorize your origin — twice

Sign-in fails unless **both** of these are done. They are separate lists in
separate consoles, and the second is the one everyone misses.

**Firebase** → Authentication → **Settings** → Authorized domains → add your
hostname, with no scheme and no trailing slash:

```
your-app.your-subdomain.workers.dev
```

**Google Cloud** → https://console.cloud.google.com/apis/credentials → your
project → **OAuth 2.0 Client IDs** → _Web client (auto created by Google
Service)_ → add:

- Authorized JavaScript origins: `https://your-app.your-subdomain.workers.dev`
- Authorized redirect URIs: `https://your-app.your-subdomain.workers.dev/__/auth/handler`

Google can take a few minutes to propagate. A `redirect_uri_mismatch` after the
account chooser means the second list is missing your origin.

Also set the source link the AGPL requires, before building:

```
VITE_SOURCE_URL=https://your-host/your-fork
```

## 7. Verify

```bash
curl -s https://your-app.your-subdomain.workers.dev/health
```

Then open the app, sign in with Google, and complete the first-run profile. You
should reach the home screen with an empty Wine Memory.

## Optional providers

All are **off** by default and none is required. The application is fully
usable with structured search, manual entry, deterministic comparisons, and all
data rights while they stay off.

Before enabling any of them, read and decide on its privacy review — each
explains exactly what leaves your deployment:

- `docs/privacy-review-open-food-facts.md` — sends a barcode. Wine coverage in a
  food database is thin, so the benefit is modest.
- `docs/privacy-review-label-ocr.md` — sends a **photograph**. Deserves more
  scrutiny, and requires checking Cloudflare's current Workers AI retention
  terms on the day you enable it.
- `docs/privacy-review-sommelierx.md` — sends the **dish text** the reader types
  to get pairing criteria, used only to rank the reader's own bottles. A
  third-party service under its own terms.

### What works with both off

Worth knowing before you decide, because it is more than people expect:

- The camera **barcode scan** itself, on every browser including Safari. Reading
  the code off the bottle happens on the device — where the browser has no
  `BarcodeDetector`, a WebAssembly decoder served from your own origin does it
  instead. Only looking that code up in an outside database needs a provider.
- **Photographing the barcode** rather than holding a live scan on it. The
  photograph is decoded on the device too; nothing is uploaded.
- **Searching your own Space** by producer or wine name, and everything the
  identification screen proposes from wines you have already saved.
- Manual entry, comparisons, exports, and every data right.

What is off is: looking a barcode up in Open Food Facts, reading a label from a
photograph, and Vicenç's language replies.

### Turning them on

1. **Decide the privacy review.** Each ends with a decision line. It is a real
   decision — you are the one sending someone's photograph to a third party, and
   the reviews exist so that is a choice rather than a default.

2. **Add the Workers AI binding** to your own deployment config. It is not in
   the example config, because the public default is to have no AI at all:

   ```jsonc
   "ai": { "binding": "AI" }
   ```

3. **Set the variables** you have approved, and only those:

   | Variable             | Value                                      | Turns on                          |
   | -------------------- | ------------------------------------------ | --------------------------------- |
   | `AI_PROVIDER`        | `cloudflare`                               | required by both AI features      |
   | `AI_OCR_MODEL`       | one of the three allowlisted vision models | reading a label from a photo      |
   | `AI_MODEL`           | a `@cf/…` text model                       | Vicenç's replies                  |
   | `RESEARCH_PROVIDER`  | `open_data`                                | barcode lookup in Open Food Facts |
   | `PAIRING_PROVIDER`   | `sommelierx`                               | food-and-wine pairing (external)  |
   | `SOMMELIERX_API_KEY` | a `sk_live_…` key (a secret, not a var)    | the same — pairing needs both     |

   The OCR allowlist is fixed in code — `apps/api/src/adapters/label-ocr.ts` —
   so a model outside it is refused rather than silently used. Check
   Cloudflare's current model catalogue for the text model; names change.

   Pairing is a third-party service under its own terms and sends the reader's
   dish text off-device — enable it only after reading
   `docs/privacy-review-sommelierx.md`. It defaults off; without both
   `PAIRING_PROVIDER=sommelierx` and a valid key, the assistant answers without it.

   Setting `AI_PROVIDER=cloudflare` without a valid model, or without the
   binding, leaves the feature off rather than half-on. The adapters return
   nothing and the screens fall back to manual entry.

4. **Semantic note search (optional).** So a note logged in one language is
   found from a question in another, tasting-note text is embedded with Workers
   AI and stored in a Vectorize index. It is off unless both Workers AI and a
   Vectorize binding named `NOTE_INDEX` are present. To enable, create an index
   and bind it — the note text is embedded but never stored in the index, only
   the vector and the ids to fetch the note back from the database:

   ```sh
   wrangler vectorize create vadevi-notes --dimensions=1024 --metric=cosine
   ```

   ```jsonc
   "vectorize": [{ "binding": "NOTE_INDEX", "index_name": "vadevi-notes" }]
   ```

   Indexing is lazy: the scheduled handler embeds a batch of not-yet-embedded
   notes each run, so new notes and the backfill of existing ones drain the same
   way. `1024` matches the `@cf/baai/bge-m3` embedding model.

5. **Redeploy**, then open **Data and privacy** and check the usage counters
   read what you expect.

### The caps you get for free

Every provider call is metered and refused past a daily budget, per member and
across the deployment:

| Metric            | Per member | Whole deployment |
| ----------------- | ---------- | ---------------- |
| Label reads (OCR) | 40         | 300              |
| Barcode lookups   | 60         | 500              |
| Vicenç replies    | 60         | 400              |

These are hard caps, not warnings: past them the feature degrades to manual
entry rather than continuing to spend. Warnings appear at 70% and 90%.

## Updating

```bash
git pull
pnpm install
pnpm exec wrangler d1 migrations apply vadevi --remote --config wrangler.production.jsonc
pnpm --filter @vadevi/web build
pnpm exec wrangler deploy --config wrangler.production.jsonc
```

Migrations are immutable and forward-only. Apply them before deploying the
Worker, never after.

### An error you can ignore, once

Applying migrations to a deployed database prints an API failure against
`/d1/database/{id}/query`, and then succeeds. The migrations up to `0014` open
with `PRAGMA foreign_keys = ON;`, and D1 does not accept `PRAGMA` over its HTTP
API: the statement is refused, the rest of the file applies, and the run is
recorded.

The line does nothing on D1 in any case — it enforces foreign keys itself. It
cannot be removed from the fourteen that carry it, because a migration that has
been applied somewhere is immutable. `pnpm migrations:check` keeps it out of the
next one.

To satisfy yourself that a migration really landed rather than reading a
reassuring message:

```bash
pnpm exec wrangler d1 migrations list vadevi --remote --config wrangler.production.jsonc
```

Nothing listed means nothing is pending.

Installed clients pick up a new version through the service worker's update
prompt; they are never force-reloaded mid-edit.

## Backups

D1 is the source of truth. Export it regularly:

```bash
pnpm exec wrangler d1 export vadevi --remote --config wrangler.production.jsonc --output backup.sql
```

Members can also export their own data from **Data and privacy** in the app —
versioned JSON, selected CSV, and explicitly chosen photos.

## What this is not

Worth being clear before you invest time:

- Not a public wine database, social feed, or rating site
- Not comprehensive wine, price, or availability coverage
- Not a guarantee of offline AI, OCR, research, or price lookup
- Not multi-tenant, and not intended to serve strangers

## If you get stuck

- **Sign-in fails** — the page shows the Firebase error code. `auth/unauthorized-domain`
  is step 6's first list, `redirect_uri_mismatch` is its second.
- **Deep links 404** — `not_found_handling` is missing from the `assets` block.
- **Deletions never execute** — the `crons` trigger is missing.
- **Everything looks stale after deploying** — hard-reload; the service worker
  is serving the previous build until you accept the update.
