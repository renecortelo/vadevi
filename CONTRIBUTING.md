# Contributing

Va de Vi is built phase-by-phase against the architecture in [`docs/`](docs/).

1. Read the architecture docs and current ADRs before changing behavior.
2. Keep every data access path Space-scoped.
3. Add contracts, implementation, and proportional tests in the same change.
4. Use only synthetic fixtures and placeholder environment identifiers.
5. Run `pnpm check` before requesting review.

Do not add production credentials, personal wine data, private media, or provider payloads.

## The gate runs before you push

`pnpm install` points Git at `.githooks`, so `pnpm check` runs on `git push`.
That is the same thing CI's `quality` job runs, so a push that passes here
cannot fail that job — you find out in your own terminal instead of in a red
check a few minutes later.

The browser suite is not in it. That needs a built server and is CI's to run.

When you already know a push is fine — prose, a rebase you have just checked —
skip it with `git push --no-verify`, or `VADEVI_SKIP_CHECK=1 git push`.

If the hook never fires, the one-time wiring did not happen; `pnpm install`
again, or set it by hand with `git config core.hooksPath .githooks`.
