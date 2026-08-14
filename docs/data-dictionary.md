# Data dictionary

## Identity and Spaces

`0001_identity_spaces.sql` introduces the Phase 1 identity and tenancy foundation:

- `users` maps a private Firebase subject to a Va de Vi ULID and user-controlled profile.
- `spaces` is the tenant root and records `personal`, `couple`, or `group` type.
- `space_memberships` retains role and historical status; authorization accepts only `active` rows.
- `space_invitations` stores only hashed, expiring invitation tokens.

Application identifiers are ULIDs stored as text. Timestamps are UTC ISO 8601 strings with millisecond precision. Mutable resources begin at version 1. Additional tables are introduced only with their implementation phase.

`0002_bootstrap_audit.sql` makes personal-Space bootstrap safe and observable:

- a partial unique index permits at most one active personal Space per creator
- `change_events` records user-visible resource changes for future incremental sync
- `audit_events` records security-relevant actions without token or private-content payloads

## Wine Memory and Quick Log

`0005_wine_memory_quick_log.sql` introduces the Phase 2 memory and capture model:

- `wine_records` stores a user-confirmed wine identity inside one Space. Normalized producer/name columns support matching without replacing the user's display text.
- `wine_grapes` and `wine_aliases` retain ordered grape snapshots and searchable alternate names.
- `media_assets` stores only private R2 metadata and an opaque server-side object key; `wine_media` associates ready media with a wine.
- `tasting_notes` stores quick or future deep notes, author attribution, score, sentiment, and drink/buy intent.
- `tasting_contexts` and `tasting_descriptors` hold optional food/environment/glass context and structured descriptor snapshots.
- `sync_mutations` records the user-scoped mutation identity needed for exact-once application semantics.

Every Phase 2 tenant table carries a `space_id` directly or is reached only through a same-Space parent. Repository methods verify active membership before reading or mutating these rows. Duplicate candidates are suggestions, not database merges.

## Browser offline storage

Dexie stores authenticated bootstrap snapshots, Wine Memory snapshots, Quick Log and deep-tasting drafts, cached tasting-session details and comparisons, pending mutations, processed photo blobs, sync cursors, and conflicts. Records are partitioned by Firebase user and, for tenant content, by Space. Stable client resource IDs allow offline creates to be referenced by dependent commands. Sign-out and account switching remove the outgoing user's partition; refreshed bootstrap data purges records for Spaces that are no longer available.

Phase 2 wine and quick-note mutations use the batched sync endpoint. Phase 3 session and deep-note mutations replay their existing endpoints sequentially with deterministic idempotency keys derived from immutable mutation IDs. Optimistic-version conflicts retain both the local payload and the authorized current server payload until the user chooses a resolution.

## Deep tasting and sessions

`0006_deep_tasting_sessions.sql` extends the shared `tasting_notes` and `tasting_contexts` records with the complete Phase 3 appearance, nose, palate, conclusion, serving, glass, and environment fields. Structured scales use values 1–5; labels live in the versioned ontology catalogs and are not stored as canonical prose.

- `tasting_sessions` is a named, dated Space resource with `draft`, `active`, or `completed` lifecycle state. Blind mode remains constrained off for MVP.
- `session_wines` records the ordered flight. A unique `(session_id, position)` constraint prevents ambiguous ordering.
- a partial unique index allows one active note per author and session-wine entry while permitting each participant to retain a separate note.
- `session_wine_summaries` is disposable derived data keyed by flight entry and algorithm version. It stores the included-note count, score/dispersion in milli-units, deterministic comparison JSON, and a hash of the included note IDs/versions.

Session detail exposes only each caller's own note identity/state plus aggregate submitted-note counts. Comparison reads submitted notes only. Draft text remains author-private at the repository boundary.

## Provenance and facts

`0007_provenance.sql` starts the Phase 4 evidence model:

- `sources` stores citation metadata, retrieval/check timestamps, attribution, license identifiers, and optional content hashes. It deliberately does not retain full third-party page content.
- `facts` stores a typed claim about a Space-scoped subject, its evidence class, confidence, verification state, research method, and optimistic version.
- `fact_citations` links a fact to one or more same-Space sources with an optional locator and `direct`, `supporting`, or `context` strength.

Registered predicates validate their JSON value shape before persistence. Researched facts require at least one citation, conflicting values coexist, and a partial unique index allows only one accepted fact for a Space/subject/predicate. Accepting a different claim marks the previous preferred claim disputed rather than deleting it.

`0008_external_adapter_cache.sql` adds bounded operational state for optional public-data adapters:

- `external_adapter_cache` stores only normalized provider candidates returned by the application adapters, keyed by provider and opaque query key with an explicit expiry. It does not store full web pages, provider images, user notes, or credentials.
- `external_rate_windows` stores fixed-window application request counts so optional providers stop locally before their documented public limits.

`0009_assistant_tool_runs.sql` adds a redacted audit trail for server-authorized read tools:

- `assistant_tool_runs` records the Space, actor, ephemeral turn ID, registered tool name, argument hash, outcome, result count, citation IDs, provider/rule version, latency, and timestamp.
- User messages, rendered answers, hidden prompts, raw tool arguments, provider credentials, and Wine Memory rows are deliberately absent. Default assistant turns have no durable thread/message records.

`0010_research_jobs.sql` adds bounded enrichment orchestration:

- `research_jobs` records the authorized requester, wine, locale, unique topics, provider mode, safe attempt outcomes, created fact/source IDs, warnings, and completion time.
- Jobs are idempotent through the existing user-scoped command keys. Disabled or incomplete providers produce an explicit `degraded` job rather than blocking Wine Memory or manual evidence.
- Provider candidates are normalized before persistence. Sources are canonical-URL deduplicated, every new researched fact has a direct citation, and status begins as `proposed` with no verifier or verification timestamp.

Assistant tool audits now allow `search_memory`, `get_wine_context`, `get_taste_profile`, `compare_wines`, and `research_wine`. Personal profile values remain null below three submitted notes; audit rows retain the sample count and outcome but never the underlying notes or question.
