# Architecture

Va de Vi is a strict TypeScript monorepo with a React/Vite PWA and Hono API deployed at one Cloudflare origin. Firebase establishes identity; D1 is the application source of truth; R2 stores private media behind authorized routes. Optional providers remain adapters and default to disabled.

Runtime boundaries:

- `apps/web` may depend on contracts, domain value objects, i18n, and UI packages. It cannot import Worker bindings or repositories.
- `apps/api` owns trust-boundary validation, authentication, Space authorization, persistence, provider adapters, audit, and media access.
- `packages/contracts` contains transport schemas only.
- `packages/domain` contains provider-independent policy and value objects.

Phases 0–4 are complete. Phase 4 adds a provider-neutral evidence boundary:

- contracts expose typed facts/citations and ephemeral assistant turns without provider response shapes
- domain ports define bounded product lookup, knowledge-research, and optional statement-rendering candidates
- API adapters own official-host fetching, attribution, local caching/rate budgets, external-text sanitization, and degraded results
- repositories remain the only path from assistant tools to Space-scoped private data
- the public/default `AI_PROVIDER=none` mode executes deterministic structured reads and normal application flows without making an external AI call

Open Food Facts and Wikidata are exposed only through fixed official HTTPS hosts; neither user input nor model output can select a URL. Authorized research jobs persist normalized output as cited proposed facts and never human-verify it. An optional Workers AI adapter can render bounded structured statements, but claim-to-statement and sentence-to-source enforcement rejects invented or uncited output. A future non-fixed fetch boundary must add DNS resolution and private-address rechecks before it is allowed.
