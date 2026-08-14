# Privacy baseline

Va de Vi is private by default. The repository contains no analytics, production identifiers, or personal fixtures. Public/default configuration uses `AI_PROVIDER=none` and `RESEARCH_PROVIDER=none`, so Vicenç’s deterministic tools and ordinary application flows make no external AI or research call. Local provider state, environment files, build output, and temporary data are ignored by Git. Checked-in runtime configuration contains synthetic placeholders only.

A private deployment may opt into fixed-host public-data research with an identifying user agent. It may separately configure Workers AI with a binding and allowlisted model name. In that mode the provider receives the current bounded question plus authorized structured statement summaries, which may include an aggregate personal sample; it does not receive saved chat history, raw repository rows, credentials, hidden authorization context, or arbitrary page content. Provider-specific privacy review is required before enabling either optional path.

Wine and tasting data is scoped to a Space and can be read only after active-membership verification. Optional label photos are resized, re-encoded, stripped of metadata in the browser, and then validated again by the Worker. R2 objects are private: authenticated routes perform membership checks, and opaque object keys are neither authorization credentials nor normal client-contract fields.

Offline storage is intentionally limited to the last verified session bootstrap, Wine Memory snapshots, drafts, queued mutations, conflicts, and temporary processed photo blobs. It is partitioned by user and Space, never contains manually persisted bearer tokens or raw audio, and can be cleared explicitly. Logout or account switching clears the outgoing user's data. On the next successful bootstrap, data for removed Spaces is purged.

Incomplete media reservations expire after 24 hours and are not treated as durable user media. Export and account/Space deletion are later-phase features and must not be represented as available before their acceptance tests pass.
