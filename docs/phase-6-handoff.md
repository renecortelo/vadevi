# Phase 6 handoff

## Baseline

Phases 0–5 are implemented on a synchronized, green `main` as one credential-free, strict-TypeScript Cloudflare/Firebase-emulator development baseline. Phase 5 adds the cellar, shopping, confirmed-action, offline-cache, localization, and documentation work described below. The public/default provider mode remains `AI_PROVIDER=none` and `RESEARCH_PROVIDER=none`.

The release candidate must continue to pass:

```powershell
pnpm install --frozen-lockfile
pnpm validate:env
pnpm check
pnpm audit --audit-level high
```

## Phase-by-phase evidence

| Phase | Delivered boundary                                                                                                                                             | Primary automated evidence                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0     | monorepo, one-origin Worker/PWA, strict gates, placeholder configuration, generated OpenAPI, offline shell                                                     | health/Worker tests, environment validation, build and OpenAPI drift gates                    |
| 1     | Firebase identity, resumable onboarding, personal/couple/group Spaces, invitations, membership enforcement                                                     | bootstrap, Worker-runtime, and Space-lifecycle authorization tests                            |
| 2     | manual Wine Memory, duplicate suggestions, private media, Quick Log, offline drafts and exact-once sync                                                        | Wine Memory/media/sync Worker tests and web route tests                                       |
| 3     | ontology `2026.1`, deep notes, sessions, flight ordering, author privacy, deterministic comparisons, conflict preservation                                     | tasting-session Worker tests and offline session/deep-note web tests                          |
| 4     | sources/facts/citations, fixed-host research adapters, hostile-content defenses, ephemeral deterministic Vicenç reads                                          | provenance, research, external-adapter, assistant-language, and assistant authorization tests |
| 5     | purchases, bottle lifecycle and derived inventory, wishlist, sourced prices, qualitative recommendations, confirmed action drafts, read-only offline snapshots | cellar/action-draft/assistant Worker tests, web route tests, i18n parity, generated OpenAPI   |

The final Phase 0–5 audit additionally closes these cross-cutting gaps:

- bottle creation rejects a purchase belonging to a different wine
- deep-tasting context rejects a previous-flight entry from another Space
- generic recommendation and price questions fall back to authorized stored wines instead of treating intent words as wine names
- merchant-sourced observations require merchant identity
- wishlist target currency is user-selectable rather than silently fixed
- logout, account switching, and explicit offline clearing remove the local active-Space identifier along with IndexedDB partitions
- confirmed, canceled, and expired action drafts remove both payload and user-written summary; scheduled cleanup does not depend on a later request
- README and architecture/privacy/security documentation describe the actual Phase 5 baseline instead of the original Phase 0 state

## Phase 6 scope that remains intentionally open

Phase 6 owns the full-MVP release-hardening criteria rather than silently treating them as completed:

- add versioned JSON and selected CSV/media export (`AC-063`)
- add confirmed, idempotent account/Space deletion and media cleanup (`AC-064`)
- complete the broader MVP Wine Memory filter surface and a deliberate confirmed-merge flow if retained in scope (`AC-013`, `AC-031`)
- add pseudo-localization, main-flow E2E in all eight locales, and recorded fluent-human catalog review (`AC-054`)
- test service-worker update recovery, install prompts, offline quota/degraded drills, and production-like offline E2E (`AC-050`–`AC-053`)
- add the usage/budget page and hard-cap/degraded-mode evidence for optional providers (`AC-065`)
- run and record accessibility, performance, dependency, privacy, and security reviews; close every serious/critical accessibility or critical/high security result (`AC-066`)
- resolve or re-evaluate the two current moderate, development-only transitive advisories under `firebase-tools`: `uuid@9.0.1` (`GHSA-w5hq-g745-h8pq`) and `@opentelemetry/core@1.30.1` (`GHSA-8988-4f7v-96qf`). The Phase 5 release gate has zero high/critical advisories; avoid unsafe major-version overrides without retesting the Firebase emulator workflow.
- perform preview-environment acceptance with isolated non-production Firebase, D1, and R2 resources before calling the MVP production-ready

Do not enable non-fixed external hosts in Phase 6 without DNS resolution plus private-address rechecks. Do not enable an optional AI/research provider without its deployment-specific privacy review.

## Publication workflow

Phase 6 should branch from a synchronized, green `main`. Keep environment-specific Wrangler/Firebase values outside the repository, use synthetic fixtures only, run the four baseline commands above, and open a PR whose evidence distinguishes automated checks, browser checks, and any human review.
