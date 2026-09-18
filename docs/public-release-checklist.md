# Public-release checklist

§22.3, with each item marked by what actually verifies it. An item backed by an
automated gate is checked by running that gate; the rest need a person.

This is about publishing the source. Putting a deployment in front of other
people is a different list: `pre-production-checklist.md` (§22.2).

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
- [x] **manual** — `VITE_SOURCE_URL` points at the published repository, so the
      AGPL §13 source offer resolves. Nothing had to change: the default baked
      into `apps/web/src/config/env.ts` is `https://github.com/renecortelo/vadevi`,
      and the public mirror was published at that same URL on purpose, so the
      offer already resolves to the source it offers.

## Repository hygiene

- [x] **automated** — Secret, PII, project id, hostname, media, and fixture scan
      (`pnpm scan:release`).
- [x] **automated** — Deployment configuration is git-ignored _and_ untracked.
- [x] **automated** — The export is checked against `.mirror-denylist`, and is
      deleted rather than left on disk if a denied term is found. The denylist
      is untracked on purpose: writing those terms into a script that is itself
      published would publish exactly what they exist to hold back.

### What the by-hand review of the export found

Run against the tree `pnpm mirror:build` produces, which is the only thing that
would actually be published. The scanner had passed; these are what it does not
look for.

- **`vadevi_implementation_spec.md` named two other private repositories.** It
  is the private brief this was built from, and it is excluded from the mirror
  altogether. What a reader of the public repository needs — architecture,
  privacy, threat model, data dictionary, the ADRs, self-hosting — is in `docs/`.

  Excluding it from the mirror turned out not to be enough, and this is the
  finding worth keeping. The development repository had itself been made public
  — the one thing §15.9 says never to do — so the brief was readable from the
  first commit onward, and the mirror's exclusion list protected an export that
  had not been published yet. A gate only guards the door it is fitted to. The
  brief was removed and purged from all 219 commits, the development repository
  is now private as `renecortelo/vadevi-dev`, and `renecortelo/vadevi` is a
  fresh single-commit mirror. Assume the names were read: the repository served
  them publicly for its whole life, and roughly a dozen external clones landed
  in the fortnight before the purge.

- **`docs/your-desk-todo.md` is the operator's own task list**, with the state of
  their acceptance run. Excluded.
- **`docs/acceptance-findings.md` carried a real name** in a run heading. The
  findings themselves are worth publishing — they explain why several gates
  exist — so the attribution was generalised rather than the file dropped.
- `vadevi-preview` appears throughout `docs/preview-environment.md`, and that is
  fine: it is offered as a name to choose, not a name in use.

The denylist gate exists so this class of finding fails a command rather than
depending on someone reading 274 files carefully.

- [x] **automated** — Configuration files contain placeholders only.
- [x] **automated** — Public template defaults to `AI_PROVIDER=none` and
      `RESEARCH_PROVIDER=none`.
- [x] **automated** — Demonstration data is clearly fictional
      (`pnpm seed:demo`), local-only, and refuses to seed a deployed database.
- [x] **manual** — Clean mirror created without private history
      (`pnpm mirror:build`), then reviewed by eye before pushing. Published as
      `renecortelo/vadevi`: one root commit, 364 files, no ancestry. The
      development repository is now `renecortelo/vadevi-dev`, private.

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

- [x] Decide the two optional-provider privacy reviews. Both approved by the
      maintainer, 17 September 2026, on terms rechecked against the providers'
      live pages that day rather than on the month-old reading they carried.
      Each review says in its own words to recheck on the day the provider is
      enabled, and both providers had been enabled in the meantime.
- [ ] Run the preview acceptance checklist end to end.
- [x] Measure LCP, INP, and API p95. `docs/performance-evidence.md`, re-measured
      18 September 2026 after the map work: every §18.4 budget met, nothing
      regressed. INP is reported for what it is — it cannot be measured in a lab,
      being a p75 over real sessions, so interaction latency stands in and is
      labelled as a proxy rather than passed off as the metric.
- [x] Sign off accessibility, threat model, privacy, and restore/delete (§22.2).
      Signed by the maintainer, 17 September 2026, against the gates and code
      rather than against a reading of the documents — which is why two of them
      were signed only after a change. Accessibility waited on a real defect:
      the memory map's points were unnamed, unactivatable SVG circles, invisible
      to a sweep that only ever sees `/memory` in its card view. The threat
      model waited on the two outbound boundaries it had never recorded, venue
      lookup and map tiles. The reasoning for each is kept with the sign-off.
- [x] Build, review, and push the public mirror. Done: `renecortelo/vadevi`,
      tagged `v0.1.0`.

---

## What publication does not change

Publishing the source does not make any deployment public. Wine data lives in
the deployer's own D1 and R2, and the public template ships with every optional
provider disabled.
