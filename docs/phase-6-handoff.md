# Phase 6 handoff

## Baseline

Phases 0–6 are implemented on a synchronized, green `main` as one
credential-free, strict-TypeScript Cloudflare/Firebase-emulator development
baseline. Phase 6 adds the data-rights, filter, merge, localization, PWA,
budget, and review-evidence work described below. The public/default provider
mode remains `AI_PROVIDER=none` and `RESEARCH_PROVIDER=none`.

The release candidate must continue to pass:

```powershell
pnpm install --frozen-lockfile
pnpm validate:env
pnpm check
pnpm audit --audit-level high
```

`pnpm check` now also enforces the §18.4 initial-route JavaScript budget.

## Phase-by-phase evidence

| Phase | Delivered boundary                                                                                                                                                                                                                       | Primary automated evidence                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 0     | monorepo, one-origin Worker/PWA, strict gates, placeholder configuration, generated OpenAPI, offline shell                                                                                                                               | health/Worker tests, environment validation, build and OpenAPI drift gates                                         |
| 1     | Firebase identity, resumable onboarding, personal/couple/group Spaces, invitations, membership enforcement                                                                                                                               | bootstrap, Worker-runtime, and Space-lifecycle authorization tests                                                 |
| 2     | manual Wine Memory, duplicate suggestions, private media, Quick Log, offline drafts and exact-once sync                                                                                                                                  | Wine Memory/media/sync Worker tests and web route tests                                                            |
| 3     | ontology `2026.1`, deep notes, sessions, flight ordering, author privacy, deterministic comparisons, conflict preservation                                                                                                               | tasting-session Worker tests and offline session/deep-note web tests                                               |
| 4     | sources/facts/citations, fixed-host research adapters, hostile-content defenses, ephemeral deterministic Vicenç reads                                                                                                                    | provenance, research, external-adapter, assistant-language, and assistant authorization tests                      |
| 5     | purchases, bottle lifecycle and derived inventory, wishlist, sourced prices, qualitative recommendations, confirmed action drafts, read-only offline snapshots                                                                           | cellar/action-draft/assistant Worker tests, web route tests, i18n parity, generated OpenAPI                        |
| 6     | versioned export and selected CSV/media, confirmed idempotent deletion with media cleanup, full Wine Memory filters and confirmed merge, pseudo-localization and eight-locale flow, hardened service worker, usage budgets and hard caps | export/deletion/merge/filter/usage Worker tests, service-worker and eight-locale web tests, enforced bundle budget |

## What Phase 6 closed

- **`AC-063`** — versioned JSON export plus selected CSV datasets, role-scoped,
  with author-private drafts withheld in every scope and media bytes released
  only for an explicit authorized selection.
- **`AC-064`** — confirmed, recoverable, idempotent Space and account deletion
  executed by the scheduled handler, including R2 media cleanup, with a re-run
  that changes nothing.
- **`AC-013`, `AC-031`** — the broader MVP filter surface with accent-insensitive
  matching and stable pagination on every sort order, plus a deliberate
  confirmed merge that preserves references and audit and never runs implicitly.
- **`AC-054`** (partly) — pseudo-localization above the 35% floor, per-locale
  interpolation/format checks, and an eight-locale main-flow test. Fluent-human
  review remains open; see below.
- **`AC-050`–`AC-053`** — service-worker cache boundaries, revision-derived cache
  names, update handling, install guidance, and storage-pressure warnings, on
  top of the existing exactly-once replay and partition-clearing coverage.
- **`AC-065`** — the usage and budget page with per-user and global daily caps,
  70%/90% thresholds, and hard caps that degrade rather than escalate.
- **`AC-066`** (partly) — no failing CI gate, no critical or high security
  finding, and both previously outstanding moderate development-only advisories
  under `firebase-tools` resolved by targeted overrides with the Firebase
  emulator workflow retested afterwards.

## Phase 6 scope that remains intentionally open

These are judgement or environment items that code cannot close. They are the
gate between "Phase 6 is code-complete" and "the MVP is production-ready".

1. **Authenticated browser coverage.** A 20-test Playwright suite now covers the
   offline shell, service-worker update, manifest, accessibility, 320 px layout,
   and storage pressure on signed-out routes. The app signs in only through
   Google redirect, so an emulator-backed sign-in fixture is still needed before
   axe and layout checks reach the authenticated screens.
2. **Preview-environment acceptance.** `docs/preview-environment.md` now carries
   both the setup steps and the acceptance checklist. It has not been executed,
   because doing so needs deployment credentials that a credential-free public
   repository deliberately lacks.
3. **Measured performance numbers.** The initial-route JavaScript budget is
   enforced at 247.3 KiB gzip against 250 KiB, but LCP, INP, and API p95 have
   not been measured on a mid-range mobile profile.
4. **Remaining §22.2 sign-offs.** Accessibility, threat-model, privacy, and
   restore/delete reviews are unsigned.
5. **Localization wording.** The product owner waived the §13.4 fluent-reviewer
   gate on 2026-08-14. The catalogs are structurally complete and free of English
   fallback, but the non-English wording has not been judged by a speaker of
   those languages. Recorded as an accepted risk in
   `docs/localization-review.md`.
6. **The §23 license decision**, which blocks Phase 7. The dependency tree
   carries no copyleft obligation, so every option remains open.

Do not enable non-fixed external hosts without DNS resolution plus
private-address rechecks. Do not enable an optional AI or research provider
without its deployment-specific privacy review.

## Next phase

Phase 7 prepares the public template: license decision and third-party notices,
a clean public mirror created from a reviewed export rather than by flipping the
private repository, a self-hosting guide, synthetic demonstration data, and a
public release scanner plus SBOM. The Phase 6 evidence documents feed directly
into the §22.3 public-release checklist.

## Publication workflow

Branch from a synchronized, green `main`. Keep environment-specific
Wrangler/Firebase values outside the repository, use synthetic fixtures only,
run the four baseline commands above, and open a PR whose evidence distinguishes
automated checks, browser checks, human review, and preview-environment results.
