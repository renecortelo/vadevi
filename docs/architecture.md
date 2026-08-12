# Architecture

Va de Vi is a strict TypeScript monorepo with a React/Vite PWA and Hono API deployed at one Cloudflare origin. Firebase establishes identity; D1 is the application source of truth; R2 stores private media behind authorized routes. Optional providers remain adapters and default to disabled.

Runtime boundaries:

- `apps/web` may depend on contracts, domain value objects, i18n, and UI packages. It cannot import Worker bindings or repositories.
- `apps/api` owns trust-boundary validation, authentication, Space authorization, persistence, provider adapters, audit, and media access.
- `packages/contracts` contains transport schemas only.
- `packages/domain` contains provider-independent policy and value objects.

The current implementation is Phase 0. Identity verification, Space services, and their integration tests arrive in Phase 1; their database shape begins in migration `0001_identity_spaces.sql` so local D1 workflow can be validated now.
