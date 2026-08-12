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
