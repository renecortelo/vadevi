# Contributing

Va de Vi is built phase-by-phase against the architecture in [`docs/`](docs/).

1. Read the architecture docs and current ADRs before changing behavior.
2. Keep every data access path Space-scoped.
3. Add contracts, implementation, and proportional tests in the same change.
4. Use only synthetic fixtures and placeholder environment identifiers.
5. Run `pnpm check` before requesting review.

Do not add production credentials, personal wine data, private media, or provider payloads.
