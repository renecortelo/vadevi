# Threat model

## Protected assets

Memberships, wine and tasting data, private media, location text, provider credentials, assistant context, export archives, and audit records.

## Phase 0 controls

- Single-origin deployment and restrictive browser headers.
- Strict Zod validation at HTTP boundaries and a stable, non-sensitive error envelope.
- A request ID on every response without returning stack traces.
- Placeholder-only checked-in environment configuration.
- Parameterized D1 migration design and mandatory future Space-scoped repositories.
- Dependency lockfile, lint/type/test/build gates, and generated-contract drift detection.

## Required follow-up

Phase 1 must add Firebase JWT verification and a route-by-route same-Space, other-Space, removed-member, and unauthenticated authorization matrix. Later phases add upload validation, SSRF defenses, prompt-injection controls, sync conflict tests, export/deletion tests, secret scanning, and manual review evidence as mapped in the implementation specification.
