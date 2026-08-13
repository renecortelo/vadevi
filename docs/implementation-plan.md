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

## Current milestone: Phase 2 — Wine Memory and Quick Log

Next:

1. Add Space-scoped wine/media migrations, transport contracts, and repository boundaries.
2. Build manual wine confirmation with duplicate suggestions and explicit draft handling.
3. Add quick tasting and Wine Memory card/table/search views.
4. Introduce offline drafts, an idempotent mutation queue, and visible sync/conflict states before optional photo-assisted identification.
