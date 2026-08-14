# ADR-0005: Offline queue and conflict policy

- Status: accepted
- Date: 2026-08-13

## Context

Quick Log, deep tasting, and tasting-session work must remain usable during a restaurant or cellar network outage. Phase 3 also introduces dependent writes: a flight entry requires its session, and a session note requires its flight entry. Retrying these writes must not create duplicates or silently replace another device's edits.

## Decision

Store local work in a Dexie database partitioned by Firebase user and Space. Stable client-generated ULIDs identify new resources and immutable mutation IDs identify queued commands.

Phase 2 wine and quick-note commands continue to use the batched `/sync` contract. Phase 3 commands replay sequentially through their existing typed endpoints so the same authorization, validation, optimistic-version, and comparison behavior applies online and after an outage. A Phase 3 create derives its endpoint-compatible idempotency key as `base64url(SHA-256(mutationId))`; retries therefore reuse the same 256-bit key without storing a secret. Parent commands are queued before dependent commands.

Optimistic-version conflicts are never resolved with last-write-wins. The local payload and the authorized current server payload are both retained until the user explicitly keeps the server version or retries the local version against the current version. Another participant's draft is never cached or returned as conflict data.

Cached Wine Memory, tasting-session, comparison, and author-owned deep-note snapshots support read and resume flows during an outage. Sign-out, account switching, and loss of Space access purge the affected local partitions.

## Consequences

- Retrying a queued create is exactly-once at the server boundary.
- Dependent session writes preserve a deterministic replay order.
- Online and offline writes share repository authorization and validation rules.
- Conflict resolution requires visible user intent and retains unsent text.
- Offline storage is private application state, not a public or shared cache.
