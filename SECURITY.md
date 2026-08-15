# Security policy

## Reporting a vulnerability

Report suspected security issues **privately** to the repository owner. Do not
open a public issue containing credentials, personal data, or a working exploit.

Please include what you did, what happened, and what you expected — a minimal
reproduction is worth more than a scanner report. If a proof of concept touches
real data, describe it rather than attaching it.

Expect an acknowledgement within a few days. This is a small private project,
not a funded programme: there is no bounty, and fixes are best-effort.

## Scope

Va de Vi is designed to be self-hosted by a household or a small group. A report
is most useful when it concerns something the application itself controls:

**In scope**

- Cross-Space data access — reading, inferring the existence of, mutating, or
  downloading media from a Space without active membership
- Authentication or token-verification bypass
- Server-side request forgery through a provider adapter or the auth proxy
- Prompt injection that causes unauthorized tool use or a durable write
- Leakage of another member's unsubmitted draft content
- Anything that makes a confirmed action non-idempotent or a deletion incomplete

**Out of scope**

- A self-hoster's own misconfiguration, such as a public R2 bucket or a missing
  authorized domain
- Denial of service through volume against your own deployment
- Findings that require a compromised device or browser extension
- Missing hardening headers that no supported flow depends on

## What this project does not promise

It is not multi-tenant, not audited, and not certified. It is a private
application for a small group, and §21 of the specification is explicit about
what it deliberately does not do.

## Handling secrets

Never commit Firebase credentials beyond documented public placeholders,
Cloudflare tokens, provider keys, private media, exports, or production
identifiers.

Two automated gates enforce this, both run by `pnpm check`:

- `pnpm scan:release` fails on credentials, real project or environment
  identifiers, deployment hostnames, personal addresses, and binary media. It
  also asserts that deployment configuration is both git-ignored and untracked.
- `pnpm audit --audit-level high` fails on high or critical advisories.

`docs/threat-model.md` records the current controls and review scope.

## Dependency update process

- Dependencies are pinned by `pnpm-lock.yaml`, and CI installs with
  `--frozen-lockfile` so an unreviewed version cannot enter through a build.
- `pnpm audit --audit-level high` runs on every pull request. High and critical
  advisories block a merge.
- Moderate and low advisories are reviewed rather than auto-merged. A fix that
  needs a major-version override must be justified and the affected workflow
  retested — when the Firebase transitives were overridden, the Auth Emulator
  workflow was rerun to prove the override was safe.
- `pnpm notices:check` fails when a copyleft or undeclared licence appears
  outside the reviewed allowlist in `NOTICES.md`, so a new licence obligation
  cannot arrive unnoticed.
- Regenerate the notices and SBOM with `pnpm notices:generate` when dependencies
  change, and review the diff before release.

## Supported versions

Only the current `main` is supported. There are no backports.
