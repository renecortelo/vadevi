# Architecture

Va de Vi is a strict TypeScript monorepo with a React/Vite PWA and Hono API deployed at one Cloudflare origin. Firebase establishes identity; D1 is the application source of truth; R2 stores private media behind authorized routes. Optional providers remain adapters and default to disabled.

Runtime boundaries:

- `apps/web` may depend on contracts, domain value objects, i18n, and UI packages. It cannot import Worker bindings or repositories.
- `apps/api` owns trust-boundary validation, authentication, Space authorization, persistence, provider adapters, audit, and media access.
- `packages/contracts` contains transport schemas only.
- `packages/domain` contains provider-independent policy and value objects.

Phases 0–6 are implemented. Phase 4 adds a provider-neutral evidence boundary:

- contracts expose typed facts/citations and ephemeral assistant turns without provider response shapes
- domain ports define bounded product lookup, knowledge-research, and optional statement-rendering candidates
- API adapters own official-host fetching, attribution, local caching/rate budgets, external-text sanitization, and degraded results
- repositories remain the only path from assistant tools to Space-scoped private data
- the public/default `AI_PROVIDER=none` mode executes deterministic structured reads and normal application flows without making an external AI call

Open Food Facts, Wikidata, Wikipedia, the optional SommelierX pairing provider, and the optional web-search provider (Brave or Tavily) are exposed only through fixed official HTTPS hosts; neither user input nor model output can select a URL. Web search is a discovery provider, not a crawler: it calls one official search API and cites the snippets it returns, and the app never fetches the arbitrary result pages, so the general-web SSRF boundary stays closed. Wikipedia is reached only via the article title stored in the matched Wikidata entity's sitelinks — the same identity footprint as the Wikidata lookup — to add a short, cited summary paragraph. Authorized research jobs persist normalized output as cited proposed facts and never human-verify it. Region country and classification are resolved from an offline curated eAmbrosia gazetteer, and country, appellation, and grape terms from further offline gazetteers, so those facts need no network call at all. An optional Workers AI adapter can render bounded structured statements, but claim-to-statement and sentence-to-source enforcement rejects invented or uncited output. A future non-fixed fetch boundary must add DNS resolution and private-address rechecks before it is allowed.

Phase 5 adds the light-cellar and confirmed-action boundary:

- purchases create immutable purchase evidence and optional individual bottle rows in one idempotent command; inventory is always derived from bottle lifecycle rows
- wishlist items and price observations remain separate Space-scoped relationships instead of becoming overloaded wine status fields
- every price contract requires source type, observation time, currency, and vintage-match quality; optional live lookup remains disabled by default and reports degraded coverage
- deterministic recommendation candidates come only from authorized Wine Memory records and expose qualitative reason codes, not percentages or hidden confidence scores
- Vicenç cannot call a write repository directly; it may create a user-bound review draft that expires after 30 minutes, and only explicit client confirmation invokes the normal idempotent command path
- confirmed, canceled, and expired action drafts discard their payload and user-written summary while retaining a payload hash and small audit/confirmation tombstone; a scheduled cleanup enforces expiry independently of user access

Phase 6 adds the data-rights, budget, and release-hardening boundary:

- export and deletion are contract-first routes whose scope is derived from the server-side role, never from a client claim; author-private draft notes stay author-only in every export scope
- deletion is a scheduled job with a recoverable grace period and a partial unique index that keeps at most one open job per target, so repeated confirmation is safe and the executor is re-runnable
- the media archive is assembled inside the Worker with a small stored-method ZIP writer, so private photo bytes never reach a packaging service
- a confirmed merge is an explicit versioned command that moves references and leaves a tombstone on the losing record; duplicate suggestions still never merge on their own
- optional-provider budgets are reserved before the provider is called, and reaching a cap routes the request to the same deterministic or manual path an unconfigured deployment uses
- service-worker cache policy lives in a plain module so the boundaries in §14.2 are asserted by tests as well as applied by the worker
- the web API client is split into eager and lazy modules so contract schemas for cellar, tasting, assistant, and data-rights routes load with those routes, keeping initial-route JavaScript inside its budget
