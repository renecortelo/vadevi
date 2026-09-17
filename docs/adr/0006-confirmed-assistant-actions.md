# ADR 0006: Confirm assistant actions through expiring drafts

## Status

Accepted in Phase 5.

## Context

Vicenç can help a user prepare a wishlist item or price observation, but model or orchestration output must never become authority to write private Space data. The user needs to inspect the exact proposed action, cancel it without side effects, or confirm it safely even when a request is retried.

## Decision

The assistant may create only a strict, user/Space-bound action draft. The server validates its payload against the ordinary command schema, stores a hash and a reviewable copy for at most 30 minutes, and returns a safe summary. The assistant has no direct write-tool path.

Only the authenticated client confirmation endpoint may apply a pending draft. Confirmation revalidates membership and delegates to the normal idempotent repository command using a key derived from the draft ID. The draft records the resulting resource reference. Repeated confirmation returns that reference without another domain write.

Cancellation and expiry create no wishlist or price record. Confirmed, canceled, and expired drafts clear the payload and user-written summary, leaving only the action type, hash, and minimal terminal tombstone. A scheduled Worker cleanup enforces expiry even when the user never opens the draft again. Security-relevant transitions emit audit events without raw payloads.

## Consequences

- Assistant output cannot silently mutate a Space.
- A user can review the exact pending payload while it is actionable.
- Retries are exact-once at both draft creation and confirmation boundaries.
- Terminal drafts support safe replay and audit without retaining the proposal body.
- New assistant-supported writes must add a strict payload schema and use an existing authorized, idempotent command; adding an action enum alone is insufficient.
