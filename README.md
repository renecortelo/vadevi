# Va de Vi

Va de Vi is a private, collaborative wine memory, tasting, and discovery PWA. Phases 0–5 are complete: the repository includes identity and shared Spaces, Wine Memory and offline logging, deep tasting sessions, sourced research and deterministic Vicenç reads, plus a light cellar, wishlist, sourced prices, and confirmed assistant actions.

Phase 6 is the next milestone and focuses on release hardening, data rights, accessibility, performance, and human review. See `docs/phase-6-handoff.md` for the verified baseline and remaining acceptance work.

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

This runs formatting, linting, strict TypeScript checks, tests, OpenAPI drift detection, translation-key checks, and production builds. To intentionally refresh the generated contract:

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

The source of truth for scope and acceptance is `vadevi_implementation_spec.md`.
