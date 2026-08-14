# Preview-environment acceptance

§22.2 requires preview and production resources to be isolated, and §19 makes
preview acceptance against isolated non-production resources a Phase 6 exit
condition before the MVP is called production-ready.

**Status: not executed.** No preview Firebase project, D1 database, or R2 bucket
exists for this repository. Creating one requires deployment credentials and
real project identifiers, which are deliberately absent from a credential-free
public repository. This document defines the run so the acceptance is
reproducible once a deployer supplies their own resources.

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
