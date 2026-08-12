# ADR-0003: Firebase Authentication with D1 as source of truth

- Status: accepted
- Date: 2026-08-12

## Context

Google sign-in is required, while membership, tenancy, audit, and wine-domain data are relational. Duplicating application state between Firebase and Cloudflare would create inconsistent authorization decisions.

## Decision

Use Firebase Authentication only to establish an external identity. The Worker verifies each bearer token and maps its `sub` claim to `users.firebase_uid`. D1 owns user profiles, Space memberships, roles, active-Space preference, and all domain data. Every tenant repository operation receives an `AuthorizationContext` and includes `space_id` in its SQL predicate.

Local development defaults to the Firebase Auth Emulator using the synthetic `demo-vadevi` project namespace.

## Consequences

- Firebase claims never grant a Space role directly.
- Removed members lose server access on the next authorized request.
- Authentication outages never permit an insecure fallback.
- Preview and production need distinct Firebase projects and Cloudflare data resources.
