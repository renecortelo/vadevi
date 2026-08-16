# Your desk to-do

Things only you can do. Everything here is blocked on a decision, an account, or
a browser — not on code.

Last updated 2026-08-15.

---

## 1. Two privacy decisions

Both capabilities are **built and disabled**. Neither activates until you decide.
Each document has a decision line to sign.

### Open Food Facts barcode lookup — `docs/privacy-review-open-food-facts.md`

- [x] Terms checked on 2026-08-16 and recorded in the review
- [ ] Approve or reject

**What leaves your deployment:** the barcode digits, nothing else. No photo, no
wine data, no user or Space identity.

**Honest read:** it is a _food_ database, so wine coverage is thin. Declining
costs you very little — matching a barcode against wines already in your Space
needs no provider at all and is the higher-hit-rate path.

### Workers AI label OCR — `docs/privacy-review-label-ocr.md`

- [x] Cloudflare terms checked on 2026-08-16 and recorded in the review
- [ ] Approve or reject

**What the terms say:** Cloudflare states it does not use Customer Content to
train Workers AI models or improve its services, and that content is stored only
if you use a storage service — which this OCR path does not. Request logging is
not described on that page; if that matters to you, ask their support before
enabling.

**What leaves your deployment:** an actual **photograph**. This one deserves more
thought than the barcode. I deliberately left the retention line blank rather
than answer it from memory — it must be checked on the day.

Without this, identification still works: barcode scanning and Space matching
need no provider.

---

## 2. Preview acceptance run

**Work through `docs/manual-acceptance.md`** — an ordered ~45 minute script for
web and mobile, arranged so anything that would invalidate the rest fails first.
`docs/preview-environment.md` remains the formal checklist behind it.

⚠️ **Migrate before you deploy.** Your preview database is two migrations behind
(`0013`, `0014`); deploying first would 500 on identification and theme.

- [ ] Data rights: JSON export, each CSV dataset, selected-media ZIP
- [ ] Deletion: typed confirmation, cancel, then the scheduled purge and its
      R2 cleanup, then re-run to confirm it changes nothing
- [ ] Account deletion: refused on a stale sign-in, accepted after a fresh one
- [ ] Media: R2 bucket not publicly readable, headers correct
- [ ] PWA: install, update prompt on a second deploy, offline shell, offline
      quick log syncing exactly once, logout clearing partitions
- [ ] Quotas: usage page reports counters; recheck §16.1 provider quotas against
      the official pages **on the day** and record any change
- [ ] Backup: D1 export runs and restores into a scratch database

Worth doing while it is fresh. This environment has already found three
production-blocking bugs that no local test could reach.

---

## 3. Look at the new brand

The palette, icons, and wordmark now follow the supplied lockup. Contrast is
verified by test, but colour is a matter of taste and a screen is not a swatch.

- [ ] Open the preview deployment and check the sign-in screen, the shell
      wordmark, and the app icon on a real device
- [ ] Install the PWA and confirm the home-screen icon and splash colours
- [ ] Say if anything is off — the palette lives in one file
      (`packages/ui/src/styles/tokens.css`) and is cheap to adjust
- [ ] Try the theme control in the top bar: System / Light / Dark. The choice is
      stored on your account, so check it follows you from phone to laptop

---

## 4. Measure performance — §18.4

Bundle budget is enforced at 239.4 KiB against 250 KiB. The rest is unmeasured.

- [ ] LCP ≤ 2.5 s and INP ≤ 200 ms at p75 on a mid-range mobile profile
- [ ] Common API reads p95 ≤ 500 ms, excluding external adapters
- [ ] Quick-log save p95 ≤ 800 ms online

Chrome DevTools against the preview deployment is enough for a first pass.

---

## 5. Sign-offs — §22.2

- [ ] Accessibility
- [ ] Threat model
- [ ] Privacy
- [ ] Restore and delete

Automated evidence exists for all four in `docs/release-review.md`; what is
missing is a person putting their name to it.

---

## 6. When you decide to publish

Do **not** flip this repository to public — §15.9 forbids it, because the
history goes with it.

```bash
pnpm mirror:build
```

That produces a clean single-commit export and verifies it. Then:

- [ ] Review the exported tree by hand, especially `docs/` and fixtures
- [ ] Create an empty public repository
- [ ] Push the mirror to it
- [ ] Point `VITE_SOURCE_URL` at the public repository and redeploy, so the
      AGPL §13 source offer resolves somewhere real

---

## Settled, for reference

- **Licence:** AGPL-3.0-only. One copyleft dependency in the tree
  (`@img/sharp-libvips-*`, LGPL, dev-only, never shipped), fully compatible.
- **Deletion grace periods:** one month for Spaces and accounts.
- **Localization:** fluent-reviewer gate waived; catalogs ship as machine drafts,
  recorded as an accepted risk in `docs/localization-review.md`.
- **Brand assets (§23 #1):** wordmark, app icon, maskable icon, and palette
  applied from your supplied lockup. Every text pair verified at WCAG AA in both
  the light and the dark palette.
- **Theme:** three states (System / Light / Dark), stored on the account so it
  follows you between devices.
- **Repository strategy:** option A — one codebase, differences by configuration.
  The private repository is your personalised line; the public mirror is
  generated from it. No third repository needed.
- **Saved chat history (§23 #5):** never implemented. Assistant turns are
  ephemeral, which is the privacy-preserving default the spec asks for.
- **Member email visibility (§23 #7):** not exposed in any contract, matching
  the specification's default of no.
