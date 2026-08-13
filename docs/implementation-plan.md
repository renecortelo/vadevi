# Implementation plan

## Completed milestone: Phase 0 — repository and decisions

Implemented:

- strict pnpm/TypeScript monorepo with a frozen dependency lockfile
- React/Vite app shell and Hono Worker at one deployment origin
- `/health`, safe error envelope, request IDs, and generated OpenAPI 3.1
- local D1/R2 and Firebase Auth Emulator placeholder workflow
- first identity/Space migration, applied successfully to local D1
- CSS Modules plus shared design tokens and accessible navigation foundation
- eight Phase 0 locale catalogs with key-parity validation
- installable offline shell with explicit service-worker cache boundaries
- ADRs 0001–0003 and initial architecture, data, privacy, and threat-model docs
- CI quality workflow and local `pnpm check` command
- Cloudflare Workers-runtime tests for a fresh D1 migration and exported `/health`
- browser evidence for 320 CSS px layout, route state, degraded API state, and a server-down offline reload
- frozen-lockfile dependency recreation and a complete credential-free `pnpm check`

Phase 0 exit evidence captured on 2026-08-12:

- a true clone of baseline commit `64a691a` installed from `pnpm-lock.yaml` with no production credentials
- formatting, lint, strict typechecks, 16 tests, generated-contract checks, i18n checks, PWA build, and Worker dry-run all pass in that clone
- no real Firebase/Cloudflare identifier or secret is required by the local configuration
- `/health` passes both contract and Workers-runtime tests
- the installed PWA shell reloads after the preview server is stopped

Automated Playwright/axe route coverage and service-worker update recovery remain continuous quality work; they are not Phase 0 exit criteria and will grow with Phase 1 routes.

## Completed milestone: Phase 1 — identity, onboarding, and Spaces

Completed identity/onboarding vertical slice:

- Firebase bearer-token middleware with full production claim/signature verification
- explicitly local-only support for unsigned Auth Emulator tokens under `demo-*` configuration
- non-interactive real Auth Emulator token probe with no Firebase login
- pinned Firebase Web SDK with Google redirect sign-in and Auth Emulator account flow
- public, validated `/runtime-config` with non-secret Firebase web configuration and feature flags
- generated `/api/v1/me/bootstrap` contract and authenticated Worker route
- D1 user upsert, unique personal Space, owner membership, active-Space selection, change event, and audit event in one batch
- Workers-runtime proof that bootstrap retries create exactly one user, Space, membership, and audit event
- resumable display-name/locale onboarding backed by `PATCH /api/v1/me`
- membership-validated active-Space updates with change and audit events
- accessible authenticated Space switcher, one forced token-refresh retry, sign-out, and eight localized auth/onboarding catalogs
- auditable, idempotent couple/group Space creation with the creator as owner
- owner/admin invitation capability with seven-day expiry and couple-Space capacity enforcement
- SHA-256 token hashes at rest; raw 256-bit invitation capabilities are returned only in private links
- public non-enumerating invitation preview and authenticated single-use, idempotent acceptance
- active-member detail views and two-step owner/admin removal of non-owner members
- immediate active-Space fallback and access denial after membership removal
- localized creation, member management, invitation preview/acceptance, and invalid-link UI across all eight catalogs

Evidence captured on 2026-08-13:

- the full `pnpm check` gate passes: formatting, lint, strict typechecks, 25 tests, generated-contract checks, all eight catalogs, PWA build, and Worker dry-run
- a real browser flow passes through Firebase Auth Emulator Google redirect, local account creation, first-run profile, locale change, reload/resume, persistent authorized Space switching, and sign-out
- the sign-in UI remains functional at 320 CSS px
- an unauthorized active-Space ID receives the same safe `404 NOT_FOUND` response and cannot change the stored preference
- the Workers authorization matrix covers same-Space access, outsider denial, member invite denial, expired invites, couple capacity, idempotency conflicts, and removed-member denial
- a real two-account browser flow passes group creation, invitation preview, guest onboarding/acceptance, switching, owner removal, immediate guest fallback, and used-link invalidation
- the new Space form remains functional at 320 CSS px

Phase 1 exit criteria:

- E2E users can create, accept, and switch Spaces
- the authorization matrix proves no cross-Space access
- a removed member loses server access on the next request

## Completed milestone: Phase 2 — Wine Memory and Quick Log

Implemented:

- Space-scoped wine, alias, grape, private-media, quick-tasting, descriptor, context, and sync-mutation storage
- contract-first Wine Memory, Quick Log, media, identification-fallback, and sync APIs with generated OpenAPI
- manual wine confirmation with explicit duplicate suggestions; similar wines remain separate unless a user chooses otherwise
- stable cursor pagination plus accent-insensitive producer, wine-name, region, and alias search
- Quick Log for vintage/NV, wine type, score, sentiment, drink/buy intent, descriptors, food, and a short comment
- private photo preprocessing in the browser and authenticated R2 reservation, upload, validation, and read routes
- offline drafts, user/Space-partitioned Dexie snapshots, an idempotent mutation queue, conflict preservation, and visible sync state
- cached authenticated bootstrap state so a previously visited user can reopen Quick Log during an API outage
- card and table Wine Memory views with cached fallback, type filters, search, private image loading, and explicit offline-data clearing
- truthful manual fallback when optional barcode/OCR identification is unavailable
- all Phase 2 interface strings translated across the eight supported locale catalogs

Phase 2 exit evidence captured on 2026-08-13:

- Workers-runtime integration tests cover exact-once retry, non-merging duplicate suggestions, accent-insensitive search, conflict payloads, and complete Quick Note persistence
- the authorization matrix denies outsider wine reads/writes and private-media reads with the same safe not-found response
- media tests reject MIME spoofing, hash mismatch, EXIF-bearing images, and oversized uploads; valid private images remain membership-gated
- web component tests cover the Quick Log and Wine Memory routes, while TypeScript, lint, generated-contract, localization, and production-build gates pass
- offline session, draft, mutation, snapshot, and conflict records are partitioned by Firebase user and Space; logout/account switching clears the outgoing user's records
- the in-app browser could not open the listening local dev URL because its local-address policy blocked the alias; automated UI and Workers-runtime evidence is retained instead of claiming a manual browser pass

Phase 2 exit criteria:

- a restaurant Quick Log can be captured into the local queue without the API, survive reload, and sync through mutation IDs exactly once
- cross-Space Wine Memory, tasting, sync, and private-media access is denied at the repository boundary
- duplicate suggestions never silently merge user records

## Completed milestone: Phase 3 — Deep tasting and sessions

Implemented:

- migration `0006` extends tasting notes and contexts with every Phase 3 structured field and adds sessions, ordered flight entries, and reproducible summary storage
- reviewed ontology contract version `2026.1` with stable numeric scales, descriptor codes, context codes, and translated-label separation
- contract-first deep-note create/update/submit, session create/list/detail, batch flight append, exact reordering, and deterministic comparison endpoints
- active-membership checks at every session boundary and author-only deep-note reads/updates/submission
- one active note per participant/flight entry enforced in D1; another member's draft content is never returned in session detail or comparison
- author-only deep-note retrieval so a participant can resume a saved draft without exposing it through shared session reads
- optimistic version conflicts return the authorized current note while preserving the client's unsent local text for explicit resolution
- comparisons use submitted notes only, suppress group scores below two scored submissions, rank deterministically, compute dispersion/descriptor overlap/buy-again count, and persist an algorithm-versioned summary with a hashed source-version input
- progressive Appearance, Nose, Palate, Context, and Conclusion UI with autosave, explicit draft submission, complete structured fields, and visible local/server conflict resolution
- private session index, offline-ready session creation, stable flight ordering, participant state, and submitted-only comparison UI
- Dexie v3 deep drafts, session/comparison snapshots, sequential dependent replay, deterministic endpoint idempotency keys, and user/Space-partitioned cleanup
- versioned ontology `2026.1` with 14 stable descriptor codes and localized labels/help text across all eight supported locales
- Wine Memory Cards, Table, Timeline, and Sessions views with direct tasting and session actions
- route-level code splitting and on-demand non-default locale loading so the initial JavaScript remains inside the Phase 3 performance target
- ADR-0005 documenting exactly-once offline replay, dependency ordering, conflict preservation, and local privacy boundaries

Phase 3 exit evidence captured on 2026-08-13:

- the complete `pnpm check` gate passes: formatting, lint, strict typechecks, 36 tests, generated OpenAPI, eight-catalog and ontology validation, PWA build, and Worker dry-run
- the Workers-runtime suite covers two members, separate notes, every structured section/context, descriptor replacement, flight ordering, author-only retrieval, conflict data, submission, comparison, summary persistence, and outsider denial
- a real Auth Emulator browser flow creates an ordered session, saves and resumes a complete deep draft, submits it, and verifies the flight and one-participant comparison without exposing draft content
- stopping the API still allows cached session index, flight, comparison, and author-owned deep-note resume views to render from the user/Space partition
- measured 320 CSS px and 1280 CSS px layouts have no document-level horizontal overflow; narrow Memory controls and session/deep-tasting views remain usable
- the production build splits Phase 3 routes and non-default locale catalogs; initial module plus preloads total approximately 247 KiB gzip against the 250 KiB target
- the public-worktree scan finds no private keys or common Firebase, OpenAI, GitHub, AWS, Slack, or similar credential formats; checked-in runtime identifiers remain synthetic placeholders

Phase 3 exit criteria:

- a deep tasting can be drafted offline, resumed by its author, submitted exactly once, and compared only after submission
- session flights retain explicit order and every participant's opinion remains distinct
- all structured codes remain locale-independent while labels and help text are complete in every supported locale
