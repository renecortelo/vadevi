# Va de Vi

Va de Vi is a private, collaborative wine memory, tasting, and discovery PWA. The Phase 0 foundation is complete and Phase 1 identity, onboarding, and Spaces work is underway.

## Prerequisites

- Node.js 24 or newer
- Corepack (included with Node.js)

No production Firebase or Cloudflare credentials are needed for the Phase 0 local workflow.

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
- `packages/i18n` — locale catalogs and, later, the tasting ontology
- `packages/ui` — accessible primitives and design tokens
- `migrations` — immutable D1 migrations
- `docs/adr` — architecture decisions

The source of truth for scope and acceptance is `vadevi_implementation_spec.md`.
