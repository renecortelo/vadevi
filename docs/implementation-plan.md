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

## Current milestone: Phase 1 — identity, onboarding, and Spaces

Completed first vertical slice:

- Firebase bearer-token middleware with full production claim/signature verification
- explicitly local-only support for unsigned Auth Emulator tokens under `demo-*` configuration
- non-interactive real Auth Emulator token probe with no Firebase login
- generated `/api/v1/me/bootstrap` contract and authenticated Worker route
- D1 user upsert, unique personal Space, owner membership, active-Space selection, change event, and audit event in one batch
- Workers-runtime proof that bootstrap retries create exactly one user, Space, membership, and audit event

Next:

1. Build resumable onboarding and an active-Space switcher over the real bootstrap response.
2. Add profile/locale and active-Space update commands.
3. Prove the same-/other-Space/removed-member authorization matrix.
4. Add couple/group creation and invitation links only after isolation is proven.

The owner/admin/member invitation flow follows only after bootstrap isolation is proven.
