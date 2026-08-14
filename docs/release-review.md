# Phase 6 release review

This record separates four kinds of evidence, because they carry different
weight:

- **Automated** — reproducible from a clean clone by running the documented
  commands.
- **Browser** — observed in a real browser against the local stack.
- **Human review** — a person's judgement, signed off by name and date.
- **Preview environment** — observed against isolated non-production Firebase,
  D1, and R2 resources.

Anything not yet observed is listed as outstanding rather than assumed.

## Baseline commands

Captured on 2026-08-14 from the Phase 6 branch:

```powershell
pnpm install --frozen-lockfile
pnpm validate:env
pnpm check
pnpm audit --audit-level high
```

| Command                          | Result                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Reinstalls from the committed lockfile with no production credentials.                                                                                                         |
| `pnpm validate:env`              | `Environment is valid (local, AI provider: none).`                                                                                                                             |
| `pnpm check`                     | Formatting, lint, strict typechecks, 109 tests, generated OpenAPI, eight-catalog and pseudo-locale validation, PWA production build, Worker dry-run, bundle budget — all pass. |
| `pnpm audit --audit-level high`  | `No known vulnerabilities found` (see dependency review below).                                                                                                                |

Test totals: 4 contract, 9 domain, 66 Workers-runtime/API, 30 web — 109 total.

## 1. Automated evidence

### Data rights (AC-063, AC-064)

- The versioned JSON export carries `schemaVersion` `2026.1`, the Space
  identity, wines, tastings, bottles, purchases, prices, wishlist, facts,
  sources, and an audit subset scoped to the requester.
- An owner or admin export covers the Space; a member export covers their own
  contributions plus the shared wine metadata they can already read.
- Another member's unsubmitted draft note is withheld in **every** scope,
  including a Space-wide owner export.
- CSV export requires an explicit dataset. Cells beginning `=`, `+`, `-`, `@`,
  tab, or carriage return are prefixed with a quote so a spreadsheet never
  evaluates exported user text as a formula.
- Media bytes are never included implicitly. The JSON lists each asset with
  `selectionRequired: true`, and a ZIP is produced only for an explicit,
  authorized selection. Unauthorized ids are skipped rather than reported, so an
  archive never discloses that another Space owns them.
- An outsider receives the same safe `404 NOT_FOUND` for export as for every
  other Space-scoped resource.
- Space deletion requires a typed confirmation matching the Space name, is
  owner-only, is idempotent across repeats, and is cancelable during its grace
  period. A non-owner member and an outsider both receive `404`.
- Leaving a shared Space is idempotent, removes server access on the next
  request, and leaves shared records intact. A personal Space is refused.
- Account deletion requires a sign-in within the last 15 minutes; a stale token
  receives `403 FORBIDDEN`. Repeats return the same job.
- The scheduled executor purges Space rows and the matching R2 objects, is a
  no-op when re-run, and does nothing before the grace period elapses. The owner
  loses access to the purged Space on the next request.

### Wine Memory filters and confirmed merge (AC-031, AC-013)

- Region, country, vintage range, score range, sentiment, grape, photo
  presence, and tasted-date range all filter server-side. An unaccented query
  matches an accented stored value (`penedes` finds `Penedès`).
- Contradictory ranges are rejected with `400` rather than silently ignored.
- Sorted pagination is stable across `recent`, `tasted`, `score`, and `name`;
  a two-page walk neither repeats nor drops a record.
- A merge runs only on explicit confirmation of both records at their current
  versions. A stale version returns `409`; merging a wine into itself returns
  `400`; an outsider receives `404`.
- A confirmed merge moves tastings, bottles, purchases, prices, wishlist items,
  facts, grapes, and media links, records exactly one `wine.merged` audit event,
  and leaves a tombstone on the losing record so references stay resolvable in
  the export.
- Repeating a confirmed merge returns the earlier outcome and moves zero rows.
- The losing display name survives as a searchable merge alias.

### Localization (AC-054)

- All eight catalogs match the English source key set exactly.
- Interpolation and ICU blocks must match the source placeholder set per key;
  an added, dropped, or renamed placeholder fails the gate.
- Unbalanced interpolation braces, empty values, and raw source-key leakage
  fail the gate.
- German and Dutch strings are held to a 200-character budget so a long
  compound noun cannot silently break a narrow layout.
- `Intl` behaviour is asserted per locale: decimal separator, short-date leading
  field (English leads with the month, the other seven lead with the day), and
  currency symbol presence.
- Pseudo-localization expands every source string by at least 36%, above the
  documented 35% floor, while preserving every placeholder.
- The main flow — home, Quick Log, Wine Memory, Sessions, Cellar, and Data and
  privacy — renders in all eight locales with its own localized heading, no raw
  key leak, and no unresolved `{{placeholder}}`.
- The same main flow renders under the pseudo locale, proving each screen
  resolves strings from the catalog rather than hard-coded or concatenated text.

### Offline and PWA (AC-050–AC-053)

- API, `/health`, `/openapi.json`, and `/runtime-config` are never served from a
  cache, so one environment or account can never see another's state.
- Versioned translation and ontology bundles use a separate stale-while-revalidate
  cache, keeping the current and previous build.
- Cache names derive from the build revision, so an update installs beside the
  live cache instead of overwriting it.
- Cache cleanup removes only caches this application owns; a cache belonging to
  another application on the same origin is untouched.
- Precaching tolerates an individually unreachable asset, so one missing file
  cannot strand the user on a worker that can never update.
- Exactly-once offline replay, conflict preservation, and user/Space-partitioned
  clearing on logout and account switch remain covered by the Phase 2–3 suites.

### Usage and budgets (AC-065)

- The usage report exposes aggregate counters, per-user and global daily caps,
  70%/90% thresholds, and the provider modes — and nothing else. No wine name,
  note text, chat text, email, location, or provider payload is stored or
  returned.
- The public default reports `aiProvider: none` and `researchProvider: none`.
- An outsider receives `404`.
- Reaching a cap degrades the feature rather than erroring: an assistant turn
  falls back to the deterministic path, and a research job runs with disabled
  providers and returns the same explicit degraded result as an unconfigured
  deployment. No path upgrades a plan, retries indefinitely, or switches to a
  paid model.

### Performance (AC-066)

Initial-route JavaScript is now enforced in `pnpm check` by
`scripts/check-bundle-budget.ts`, not merely measured.

| Measurement              | Value                                               |
| ------------------------ | --------------------------------------------------- |
| Initial route JavaScript | **247.3 KiB gzip** against the §18.4 250 KiB budget |
| Render-blocking CSS      | 6.8 KiB gzip (reported, not budgeted)               |

Phase 6 kept the budget while adding a page and five endpoints by splitting the
API client into `api`, `tasting`, `cellar`, `assistant`, and `data-rights`
modules, loading session and deep-note replay clients on demand inside the
offline flush, and marking the workspace packages side-effect free. Without
those changes the same feature set measured 251.7 KiB.

`LCP`, `INP`, and API p95 targets are **not** yet measured; see outstanding work.

### Dependency review (AC-066)

Both moderate development-only advisories carried into Phase 6 are now closed:

| Advisory              | Package                      | Path                                                          | Resolution                                                            |
| --------------------- | ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GHSA-w5hq-g745-h8pq` | `uuid@9.0.1`                 | `firebase-tools > gaxios > uuid`                              | `pnpm.overrides` raises the floor to `>=11.1.1`; resolved to `14.0.1` |
| `GHSA-8988-4f7v-96qf` | `@opentelemetry/core@1.30.1` | `firebase-tools > @google-cloud/pubsub > @opentelemetry/core` | `pnpm.overrides` raises the floor to `>=2.8.0`; resolved to `2.10.0`  |

Neither package is reachable from the Worker, the web application, or any
production path — both are development-only transitives of the Firebase CLI.
The overrides raise a transitive floor and change no direct dependency. As the
Phase 6 handoff requires, the Firebase Auth Emulator workflow was retested after
the change:

```
pnpm test:auth-emulator
→ Firebase Auth Emulator issued a valid local-only demo project ID token.
→ Script exited successfully (code 0)
```

`pnpm audit` now reports **no known vulnerabilities** at any severity.

### Repository hygiene (AC-062)

A scan of all tracked and untracked non-ignored files finds no private key,
certificate, Firebase/Google API key, GitHub, AWS, Slack, OpenAI, or webhook
secret pattern. Checked-in configuration contains placeholders only, and
`AI_PROVIDER=none` plus `RESEARCH_PROVIDER=none` remain the public defaults in
`.dev.vars.example` and `wrangler.example.jsonc`.

## 2. Browser evidence

Recorded against the local Vite dev server and Worker with the Firebase Auth
Emulator:

- The Firebase Auth Emulator issues a valid local-only `demo-vadevi` ID token
  through the non-interactive probe, with no Firebase login.

**Not yet recorded in a browser for Phase 6**, and therefore listed as
outstanding rather than claimed:

- installed-PWA update prompt taking effect through `SKIP_WAITING`
- install prompt appearing and being dismissed on a real installable origin
- offline quota exhaustion producing the storage-pressure notice
- axe scans of the new Data and privacy screen and the extended Memory filters
- 320 CSS px layout check of the new filter row and Data and privacy screen

The Phase 2 note still applies: the in-app browser's local-address policy blocks
the local dev URL, so these must be run from an ordinary desktop browser.

## 3. Human review

**Localization sign-off is outstanding.** §13.4 requires a fluent human reviewer
per production catalog and states that machine translation may produce a draft
only. The Phase 6 strings added for data rights, usage and budgets, the extended
Memory filters, the confirmed merge, and the PWA install/update/storage messages
are drafts. `docs/localization-review.md` tracks the sign-off table; every
non-English locale is currently `draft — awaiting fluent reviewer`.

Per §13.4, English fallback in a non-English production screen is a release
blocker. The automated gate proves there is no fallback and no missing key; it
cannot prove the wording is idiomatic. **The MVP is not production-ready until
that table is signed.**

The accessibility, threat-model, privacy, and restore/delete sign-offs listed in
§22.2 are likewise unsigned.

## 4. Preview environment

`docs/preview-environment.md` defines the isolated-resource acceptance run.
**It has not been executed.** No preview Firebase project, D1 database, or R2
bucket exists for this repository, and creating one requires deployment
credentials that are deliberately absent from a credential-free public
repository.

## Outstanding before the MVP is production-ready

1. Fluent-human sign-off for all seven non-English catalogs.
2. Browser drills: service-worker update, install prompt, offline quota, axe
   scans, and 320 px layout for the Phase 6 screens.
3. Preview-environment acceptance against isolated non-production Firebase, D1,
   and R2 resources.
4. Measured `LCP`, `INP`, and API p95 numbers on a mid-range mobile profile.
5. Accessibility, threat-model, privacy, and restore/delete sign-offs (§22.2).
6. Product-owner decisions still open in §23, in particular the exact
   Space-deletion grace period, which is implemented as a documented seven-day
   default (24 hours for an account) pending that review.
