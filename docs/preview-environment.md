# Preview-environment acceptance

§22.2 requires preview and production resources to be isolated, and §19 makes
preview acceptance against isolated non-production resources a Phase 6 exit
condition before the MVP is called production-ready.

**Status: not executed.** No preview Firebase project, D1 database, or R2 bucket
exists for this repository. Creating them requires deployment credentials and
real project identifiers, which are deliberately absent from a credential-free
public repository — so the setup below is written for the deployer to run under
their own accounts, and the acceptance checklist that follows is what to verify
once it is standing.

## Isolation requirements

Every resource below must be distinct from production. Sharing any one of them
makes the run invalid.

| Resource                    | Requirement                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Firebase project            | A separate preview project. Never the production project, and never a `demo-*` project, since preview must exercise real signature verification. |
| Firebase authorized domains | Only the preview origin.                                                                                                                         |
| D1 database                 | A separate database with its own id. Migrations applied from `migrations/` in order.                                                             |
| R2 bucket                   | A separate private bucket. Never a bucket that production reads or writes.                                                                       |
| Worker                      | A separate Worker name and route.                                                                                                                |
| Secrets                     | Cloudflare secret bindings only. Never committed, never shared with production.                                                                  |

`wrangler.example.jsonc` holds placeholders only. A preview deployment uses its
own ignored or deployment-managed Wrangler configuration.

## Configuration

`pnpm validate:env` enforces the boundaries that matter here:

- `APP_ENV=preview` must not set `FIREBASE_AUTH_EMULATOR_HOST`.
- `APP_ENV=preview` must not set `VITE_FIREBASE_USE_EMULATOR=true`.
- A non-`local` environment may use a real Firebase project id; `local` is held
  to the `demo-*` namespace.

Providers stay disabled unless the deployment-specific privacy review in §15.8
has been completed for that provider:

```
AI_PROVIDER=none
RESEARCH_PROVIDER=none
```

Enabling either without that review is out of scope for preview acceptance.

## Setup: creating the isolated resources

These steps create the preview resources under your own accounts. Nothing here
is committed — every identifier and secret produced below stays in your local
ignored configuration or in Cloudflare secret bindings.

### 1. Firebase preview project

1. In the Firebase console, create a **new project** — do not reuse production.
   Name it something unmistakable such as `vadevi-preview`.
2. **Authentication → Sign-in method → Google**: enable it, and set a support
   email.
3. **Authentication → Settings → Authorized domains**: add only your preview
   origin (for example `vadevi-preview.<your-subdomain>.workers.dev`). Remove
   any domain you do not control.
4. **Project settings → General → Your apps → Web app**: register a web app and
   copy the `apiKey`, `authDomain`, and `projectId`. These three are public
   browser configuration, not secrets, but they are still environment
   identifiers and must not be committed.

### 2. Cloudflare D1

```bash
npx wrangler d1 create vadevi-preview
```

Copy the returned `database_id`. Then apply the migrations:

```bash
npx wrangler d1 migrations apply vadevi-preview --remote --config wrangler.preview.jsonc
```

### 3. Cloudflare R2

```bash
npx wrangler r2 bucket create vadevi-preview-media
```

Leave it private. Do not add a public bucket URL or a custom domain — the
application serves media only through authorized Worker routes.

### 4. Preview Wrangler configuration

Create `wrangler.preview.jsonc` next to the example file. **It is git-ignored**
and holds your real identifiers:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "vadevi-preview",
  "main": "apps/api/src/worker.ts",
  "compatibility_date": "2026-08-11",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "apps/web/dist",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*", "/health", "/openapi.json", "/runtime-config", "/__/auth/*"],
    "not_found_handling": "single-page-application",
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "vadevi-preview",
      "database_id": "<the id from step 2>",
      "migrations_dir": "migrations",
    },
  ],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "vadevi-preview-media" }],
  "triggers": { "crons": ["*/5 * * * *"] },
  "vars": {
    "APP_ENV": "preview",
    "APP_VERSION": "0.1.0",
    "AI_PROVIDER": "none",
    "RESEARCH_PROVIDER": "none",
    "FIREBASE_AUTH_DOMAIN": "<from step 1>",
    // Serves /__/auth/* from this origin so sign-in is same-origin. Browsers
    // partition third-party storage, which breaks both popup and redirect
    // sign-in when the auth domain differs from the application origin.
    "FIREBASE_AUTH_PROXY": "true",
    "FIREBASE_PROJECT_ID": "<from step 1>",
    "FIREBASE_WEB_API_KEY": "<from step 1>",
  },
}
```

Two things matter here. `APP_ENV` must be `preview`, not `local`, so real
Firebase signature verification runs — `pnpm validate:env` fails if a non-local
environment still points at the emulator. And the cron trigger must exist, or
confirmed deletions will be scheduled but never executed.

Add the file to `.gitignore` if it is not already covered:

```
wrangler.preview.jsonc
```

### 4b. Authorize the redirect URI on the OAuth client

Because the application serves the Firebase auth handler from its **own** origin
(see `FIREBASE_AUTH_PROXY` below), Google must be told that this origin is a
legitimate destination. Firebase's authorized-domain list is **not** enough —
the underlying Google OAuth client keeps its own, stricter list, and a mismatch
fails with `Error 400: redirect_uri_mismatch` _after_ the account chooser.

1. Open **https://console.cloud.google.com/apis/credentials** and select your
   preview project.
2. Under **OAuth 2.0 Client IDs**, open the entry named
   **Web client (auto created by Google Service)**. Firebase created it when you
   enabled Google sign-in.
3. Under **Authorized JavaScript origins**, add your deployed origin:
   ```
   https://<your-worker>.<your-subdomain>.workers.dev
   ```
4. Under **Authorized redirect URIs**, add the handler path:
   ```
   https://<your-worker>.<your-subdomain>.workers.dev/__/auth/handler
   ```
5. **Save.** Google can take several minutes to propagate the change.

Skipping this step is the single most common reason a correctly configured
deployment still cannot sign in.

### 5. Deploy

```bash
pnpm --filter @vadevi/web build
npx wrangler deploy --config wrangler.preview.jsonc
```

Then return to step 3 of the Firebase setup and confirm the deployed origin is
the authorized domain.

### 6. Confirm isolation before testing

```bash
npx wrangler d1 execute vadevi-preview --remote --config wrangler.preview.jsonc \
  --command "SELECT COUNT(*) AS users FROM users"
```

A fresh preview database returns zero. If it does not, you are pointed at the
wrong database and the acceptance run is invalid.

## Acceptance checklist

Record the result of each item, with the date and the person who ran it.

### Identity and Spaces

- [ ] Google sign-in against the preview Firebase project creates exactly one
      user and one personal Space across a retried bootstrap.
- [ ] A second account accepts an invitation link, switches Space, and is
      removed; access ends on the next request.
- [ ] An unauthorized Space id returns the same safe `404` and does not change
      the stored preference.

### Data rights

- [ ] JSON export downloads, carries `schemaVersion` `2026.1`, and matches the
      requester's scope.
- [ ] Each CSV dataset downloads and opens correctly in a spreadsheet, with no
      cell evaluated as a formula.
- [ ] A selected-media ZIP contains exactly the selected authorized photos.
- [ ] Space deletion requires the typed name, is cancelable, and after the grace
      period the scheduled run purges D1 rows and R2 objects.
- [ ] Re-running the scheduled purge changes nothing.
- [ ] Account deletion refuses a stale sign-in and succeeds after a fresh one.

### Media and security headers

- [ ] The R2 bucket is private; a direct object URL is not publicly readable.
- [ ] Media responses carry a safe image MIME, an inline content disposition
      with a fixed `"image"` filename, `X-Content-Type-Options: nosniff`, and
      `Cache-Control: private, no-store`.
- [ ] CSP and security headers do not break sign-in, media, or the service
      worker.
- [ ] Logs contain no protected field: no wine name, note text, chat text,
      email, or precise location.

### PWA

- [ ] The app installs from the preview HTTPS origin.
- [ ] A second deployment surfaces the update prompt, and accepting it activates
      the new worker without closing every tab.
- [ ] After one successful online visit the shell loads offline.
- [ ] A quick log captured offline survives reload and syncs exactly once.
- [ ] Logout clears user-partitioned offline data and pending private media.

### Quotas and budgets

- [ ] The usage page reports counters for the preview deployment.
- [ ] Zero-cost quotas are rechecked against the official provider pages listed
      in §16.1 on the day of the run, and any change is recorded.
- [ ] Degraded modes behave as documented when a provider is disabled.

### Accessibility and performance

- [ ] axe reports no serious or critical violation on the main flow.
- [ ] Layouts hold at 320 CSS px with no document-level horizontal overflow.
- [ ] LCP ≤ 2.5 s and INP ≤ 200 ms at the 75th percentile on a mid-range mobile
      profile.
- [ ] Common API reads p95 ≤ 500 ms excluding external adapters.

### Backup and restore

- [ ] The D1 export/backup procedure runs and the export is restorable into a
      scratch database.
- [ ] Provider-managed backup and time-travel retention is documented
      accurately, and is not presented as immediate physical erasure.

## Sign-off

| Item               | Result  | Run by | Date |
| ------------------ | ------- | ------ | ---- |
| Preview acceptance | not run |        |      |
