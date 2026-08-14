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

## Completed milestone: Phase 4 — Provenance, learning, and Vicenç read path

Implemented:

- migration `0007` adds Space-scoped sources, typed facts, and fact citations without storing full third-party page content
- registered fact predicates validate value shapes; researched facts cannot be persisted without at least one citation
- conflicting claims coexist, exactly one claim per Space/subject/predicate may be accepted, and selecting a new preferred claim marks the old one disputed
- contract-first source create/read, wine-fact create/list, and fact-acceptance endpoints with generated OpenAPI
- idempotent source/fact creation, optimistic fact acceptance, change events, and safe audit events
- active-membership authorization at every repository boundary with non-enumerating outsider responses
- initial URL boundary rejects non-HTTPS credentials, loopback, private, link-local, metadata-service, and local-only literal targets
- Workers-runtime coverage for citations, conflicts, preference changes, idempotent replay, stale versions, outsider denial, predicate validation, and unsafe source URLs
- Wine Memory links into a localized evidence screen that distinguishes every evidence class and fact state, shows citation publisher/type/retrieval/license metadata, preserves visible alternatives, and makes preference changes explicit
- domain-owned external-research ports plus fixed-host Open Food Facts and Wikidata adapters with bounded response fields, identifying user agents, source/license attribution, D1 TTL caches, application rate budgets, timeouts, manual redirect validation, and deterministic degraded results
- migration `0008` persists only bounded public adapter results and provider rate windows; no full third-party page, image, user note, or provider credential enters that cache
- migration `0009` adds redacted assistant tool-run audit records containing argument hashes, outcomes, counts, citation IDs, and rule/model versions rather than chat text or raw arguments
- migration `0010` adds authorized, idempotent research jobs with explicit provider mode, bounded attempts, warnings, and created fact/source IDs
- research orchestration converts normalized adapter candidates into cited `proposed` facts, reuses canonical sources safely, never auto-verifies a claim, and returns deterministic `degraded` results when providers are disabled or incomplete
- the evidence screen includes an online-only research action, optional confirmed Wikidata IDs, status/warning feedback, fact refresh, and an explicit disabled-provider state without weakening offline/manual flows
- all provider URLs are application-owned fixed official HTTPS hosts; redirects stay on the allowlist, JSON is content-type and byte bounded, and the fetcher is not a general URL/DNS boundary
- external strings are normalized, stripped of control/bidirectional characters, length bounded, and rejected before model input when they resemble instructions, tool requests, credential extraction, or active markup
- contract-first, ephemeral Vicenç turns intersect requested Spaces with live memberships and expose `search_memory`, `get_wine_context`, `get_taste_profile`, deterministic `compare_wines`, and bounded research availability without saved history
- personal profiles require three submitted notes, expose the sample count, and return `insufficient` with no preference values below that threshold; per-wine personal comparison follows the same rule
- researched wine context returns each fact with its stored citations, and the localized UI renders the evidence class plus claim-level sources
- optional Workers AI language rendering receives only bounded structured statements, exposes no tools, and is accepted only when every returned claim maps to known statement IDs; researched claims inherit stored source IDs or the response falls back to deterministic mode
- the public/default `AI_PROVIDER=none` and `RESEARCH_PROVIDER=none` path keeps structured search, wine context, profile thresholds, comparison, evidence, logging, sessions, and offline flows operational without external AI or research calls
- all new research, evidence, profile, comparison, provider-availability, and degraded/offline copy is translated across the eight supported catalogs

Phase 4 exit evidence captured on 2026-08-14:

- the complete `pnpm check` gate passes formatting, lint, strict typechecks, 71 tests, generated OpenAPI, eight-catalog/ontology validation, the PWA production build, and the Worker dry-run
- Workers tests cover researched-fact citations and proposal state, idempotent job replay, disabled-provider degradation, outsider denial, canonical-source reuse, redacted tool audits, cross-Space intersection, personal sample thresholds, deterministic comparisons, and provider claim enforcement
- hostile-provider suites reject same-host escapes, non-JSON and oversized bodies, instruction-like product/entity fields, unknown model statement IDs, and external prompt text before any language-provider call
- web tests cover provenance attribution, the disabled research state, deterministic Vicenç results, and structured tool availability; strict typechecks pass for AI-disabled and service-worker paths
- the current public worktree contains no private-key or common Firebase, OpenAI, GitHub, AWS, Slack, Stripe, or webhook-secret patterns; email-like strings are synthetic test domains, an official Firebase service-account endpoint, or dependency metadata, and checked-in UUID/config values are placeholders

Phase 4 exit criteria:

- every researched statement displayed by Vicenç retains a claim-level mapping to one or more stored sources
- personal claims show their submitted-note sample basis and are withheld below the minimum threshold
- hostile source content cannot select tools, override authorization, make arbitrary HTTP requests, or trigger durable writes
- all core read tools return structured results with AI disabled, while research/manual fallbacks remain explicit and usable

The fetch boundary must add DNS resolution and private-address rechecks before a future phase permits user-selected or non-fixed provider hosts. Provider-specific privacy review remains required before a private deployment enables optional language or research bindings.

## Completed milestone: Phase 5 — Cellar, wishlist, shopping, and confirmed actions

Implemented:

- migration `0011` adds Space-scoped purchases, individual bottles, wishlist items, sourced price observations, and user-bound action drafts
- idempotent purchase creation can create the requested bottle rows and a purchase-sourced price observation in one command
- bottle lifecycle transitions enforce valid state changes and inventory is derived directly from bottle rows rather than a writable aggregate
- wishlist items retain reason, priority, optional target price/currency, referrer, notes, and explicit active/purchased/dismissed state
- manual price observations require amount, currency, source type, observed time, channel, and vintage-match quality; stored observations expose visible staleness and disabled external lookup as degraded coverage
- active-membership authorization and non-enumerating outsider responses protect every cellar, wishlist, purchase, price, and action-draft repository boundary
- Vicenç price results contain only authorized stored observations with their source and observed time
- deterministic recommendation output ranks only real authorized candidates, returns qualitative evidence/reason codes, and never exposes a percentage or hidden numeric match score
- assistant writes are limited to strictly validated 30-minute review drafts for wishlist and price actions; cancellation writes no domain record and repeated confirmation returns the one idempotently created resource
- confirmed, canceled, and expired drafts discard their payload and user-written summary while retaining a hash and minimal replay/audit tombstone; scheduled cleanup enforces expiry independently of later access
- localized Cellar, Wishlist, Shopping, price, recommendation, and action-review UI is complete across all eight catalogs
- Dexie v4 caches user/Space-partitioned cellar, wishlist, and stored-price snapshots for read-only offline views; writes and current lookup remain explicitly online-only
- ADR-0006 records the confirmed-action boundary and payload-retention decision

Phase 5 exit evidence captured on 2026-08-14:

- the complete `pnpm check` gate passes formatting, lint, strict typechecks, 78 tests, generated OpenAPI, eight-catalog/ontology validation, the PWA production build, and the Worker dry-run
- Workers tests cover idempotent purchase/bottle creation, derived inventory, lifecycle conflicts, wishlist transition, timestamp/source validation, stale-price labeling, degraded lookup, outsider denial, cancellation without writes, confirmation replay, and expired-payload deletion
- assistant tests prove recommendation candidates originate in authorized stored Wine Memory, use qualitative labels without probabilities, and expose price sources/observation times only for stored observations
- web tests cover authenticated Phase 5 routes and render the new Cellar, Wishlist, and Shopping views; strict web and service-worker typechecks pass
- the generated OpenAPI contract includes the Phase 5 endpoints and is current with the route schemas

Phase 5 exit criteria:

- every displayed price has a source type and observed time, with stale and incomplete coverage called out explicitly
- recommendation output contains only real authorized candidates and qualitative reason codes, never fabricated offers or percentages
- canceling or expiring an action draft creates no domain record, while repeated confirmation creates exactly one resource

The Phase 0–5 release-candidate audit and explicit Phase 6 handoff are recorded in `docs/phase-6-handoff.md`. That audit distinguishes completed phase commitments from full-MVP acceptance work that intentionally belongs to Phase 6.
