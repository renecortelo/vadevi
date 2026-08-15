# Public-release checklist

§22.3, with each item marked by what actually verifies it. An item backed by an
automated gate is checked by running that gate; the rest need a person.

Status key: **automated** runs in `pnpm check`; **manual** needs you.

---

## Licensing

- [x] **automated** — Licence chosen and applied. AGPL-3.0-only, verbatim from
      gnu.org, with an SPDX identifier on every workspace package.
- [x] **automated** — Third-party notices and SBOM generated and licence-policy
      checked (`pnpm notices:check`).
- [x] **manual** — AGPL compatibility reviewed. One copyleft dependency,
      `@img/sharp-libvips-*` (LGPL-3.0-or-later), reached through
      `sharp → miniflare → wrangler`. Development-only, never shipped, and LGPL
      is compatible with AGPL.
- [x] **manual** — No copied third-party implementation code. The tasting
      ontology is original and §21 forbids reproducing another product's
      taxonomy or copy.
- [ ] **manual** — `VITE_SOURCE_URL` points at the published repository, so the
      AGPL §13 source offer resolves. Only possible once the mirror exists.

## Repository hygiene

- [x] **automated** — Secret, PII, project id, hostname, media, and fixture scan
      (`pnpm scan:release`).
- [x] **automated** — Deployment configuration is git-ignored _and_ untracked.
- [x] **automated** — Configuration files contain placeholders only.
- [x] **automated** — Public template defaults to `AI_PROVIDER=none` and
      `RESEARCH_PROVIDER=none`.
- [x] **automated** — Demonstration data is clearly fictional
      (`pnpm seed:demo`), local-only, and refuses to seed a deployed database.
- [ ] **manual** — Clean mirror created without private history
      (`pnpm mirror:build`), then reviewed by eye before pushing.

## Documentation

- [x] **manual** — Self-hosting guide works from a clean account and clone
      (`docs/self-hosting.md`). Written from a real preview deployment, including
      the three failures that deployment actually hit.
- [x] **manual** — Security reporting policy and dependency update process
      documented (`SECURITY.md`).
- [x] **manual** — Privacy posture and optional-provider disclosures written
      (`docs/privacy.md`, plus a review per provider).
- [x] **manual** — Self-hosting limitations stated. `docs/self-hosting.md` names
      what the project is not.

## Quality gates

- [x] **automated** — Formatting, lint, strict typecheck.
- [x] **automated** — 132 unit, contract, domain, and Workers-runtime tests.
- [x] **automated** — 30 browser tests, including authenticated axe and 320 px
      drills.
- [x] **automated** — Generated OpenAPI is current.
- [x] **automated** — Eight locale catalogs, ontology, and pseudo-locale.
- [x] **automated** — Initial-route JavaScript within the §18.4 budget.
- [x] **automated** — `pnpm audit --audit-level high` clean.

## Before publishing — outstanding

These are tracked in `docs/your-desk-todo.md`.

- [ ] Decide the two optional-provider privacy reviews.
- [ ] Run the preview acceptance checklist end to end.
- [ ] Measure LCP, INP, and API p95.
- [ ] Sign off accessibility, threat model, privacy, and restore/delete (§22.2).
- [ ] Build, review, and push the public mirror.

---

## What publication does not change

Publishing the source does not make any deployment public. Wine data lives in
the deployer's own D1 and R2, and the public template ships with every optional
provider disabled.
