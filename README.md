# Va de Vi

Va de Vi is a private, collaborative wine memory, tasting, and discovery PWA. Phases 0–6 are implemented: identity and shared Spaces, Wine Memory and offline logging, deep tasting sessions, sourced research and deterministic Vicenç reads, a light cellar with wishlist and sourced prices, confirmed assistant actions, and now data export, confirmed deletion, the full Wine Memory filter surface, eight-locale release hardening, and private usage budgets.

Phase 6 is code-complete, but the MVP is not yet production-ready. Fluent-human review of the seven non-English catalogs, browser drills for the new screens, and preview-environment acceptance against isolated non-production resources are still open. See `docs/phase-6-handoff.md` for the exact remaining work, and `docs/release-review.md` for evidence separated into automated, browser, human-review, and preview-environment results.

## Prerequisites

- Node.js 24 or newer
- Corepack (included with Node.js)

No production Firebase, Cloudflare, AI, research, or price-provider credentials are needed for the local workflow.

## Start locally

```powershell
corepack enable
pnpm install
pnpm validate:env
pnpm dev
```

Open `http://localhost:5173`. Vite serves the web app and proxies API calls to the local Cloudflare Worker at `http://localhost:8787`. The public health endpoint is available at `http://localhost:8787/health`.

Firebase authentication starts separately when identity work is needed:

```powershell
pnpm dev:auth
```

The emulator uses the synthetic `demo-vadevi` project name and does not contact a production Firebase project.

Run the non-interactive Auth Emulator probe with:

```powershell
pnpm test:auth-emulator
```

It creates a random `example.test` fixture user, verifies the local-only ID token shape, and shuts the emulator down. No Firebase login is required.

## Local D1 and R2

Wrangler creates local-only D1 and R2 state under `.wrangler/`. Apply migrations before database-backed work:

```powershell
pnpm exec wrangler d1 migrations apply vadevi-local --local --config wrangler.example.jsonc
```

The checked-in Wrangler file contains placeholder identifiers only. Preview and production must use separate, ignored or deployment-managed configuration and resources.

## Quality gates

```powershell
pnpm check
```

This runs formatting, linting, strict TypeScript checks, tests, OpenAPI drift detection, translation and pseudo-locale checks, production builds, and the initial-route JavaScript budget. To intentionally refresh the generated contract:

```powershell
pnpm openapi:generate
```

## Workspace map

- `apps/web` — React/Vite PWA
- `apps/api` — Hono Cloudflare Worker
- `packages/contracts` — strict transport schemas and generated OpenAPI
- `packages/domain` — provider-independent domain rules
- `packages/i18n` — eight locale catalogs and the versioned tasting ontology
- `packages/ui` — accessible primitives and design tokens
- `migrations` — immutable D1 migrations
- `docs/adr` — architecture decisions

## Data rights

Signed-in members reach export and deletion from **Data and privacy** in the top
bar:

- JSON is the complete, versioned export. CSV covers one selected table at a
  time. Photos are never included automatically — export the JSON, then select
  the photos you want in a ZIP.
- An owner or admin exports the whole Space. A member exports their own
  contributions plus the shared wine metadata they can already read. Another
  member's unsubmitted draft note is never included.
- Leaving a shared Space keeps its shared records. Deleting a Space needs the
  owner to type its name, and deleting an account needs a recent sign-in. Both
  have a recoverable grace period before anything is purged.
- The same screen shows the private usage report: aggregate daily counters,
  application caps, and which optional providers are enabled.

## Provider defaults

`AI_PROVIDER=none` and `RESEARCH_PROVIDER=none` are the public defaults. Every
core flow — search, filters, tasting, sessions, comparison, cellar, evidence,
export, and deletion — works with both disabled. Enabling either requires a
deployment-specific privacy review.

The source of truth for scope and acceptance is `vadevi_implementation_spec.md`.
