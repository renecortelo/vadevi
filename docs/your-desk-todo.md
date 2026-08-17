# Back at your desk

Ordered so that nothing here waits on anything below it. Everything in this file
needs you: a machine with the deployment credentials, a real phone, or a decision
that is yours to make and not mine.

---

## 1. Migrate and deploy (5 min)

The database is two migrations behind the code — `0013` identification drafts and
`0014` the theme preference. The first command is not optional; the application
will fail to start without it.

```powershell
npx wrangler d1 migrations apply vadevi-preview --remote --config wrangler.preview.jsonc
```

```powershell
npx wrangler deploy --config wrangler.preview.jsonc
```

If the build is not current, run `pnpm install` and `pnpm --filter @vadevi/web build`
first. Migrations are forward-only: apply them before deploying the Worker, never
after.

Already installed the app to your home screen? Remove it and install again. The
icon changed, and the system does not re-read it otherwise.

## 2. Work through the acceptance script (45 min)

`docs/manual-acceptance.md`, 38 items, ordered so the things that would
invalidate everything below them come first. Record the date, the browser and
the device — a run on one browser is a data point, not a pass.

Pay particular attention to the parts nothing automated can reach:

- **Saving a label photograph on the iPhone**, in all three places: Quick Log,
  the identification flow, and _Edit_ in Wine Memory. This is the one that was
  broken, and it could only ever break on WebKit. Safari's JPEG encoder writes a
  metadata segment the server refuses — deliberately, because that segment is
  where a photograph's GPS coordinates live — so the bytes are now cleaned on
  the device before they are sent. Chrome never wrote that segment, which is why
  nothing on the desktop and nothing in CI ever saw it. Check the queue drains
  to zero afterwards.
- **Scanning on the iPhone**, both ways: the live scan and _Take a photo of the
  barcode_. This is the thing that did not exist at all before, and I cannot
  verify it on real hardware. Safari has no `BarcodeDetector`; a decoder of our
  own does the work now.
- **Installing the PWA** and opening it from the home screen.
- **Airplane mode**: log a wine offline, come back, check Wine Memory for
  duplicates. The queue is tested, the radio is not.
- **The Google sign-in popup**, which cannot be automated against real Firebase.

Send me what comes back the way you did the first round.

## 3. Two privacy decisions — only if you want OCR and Vicenç

Both providers are off, and the application is fully usable without them. The
camera barcode scan and search within your own Space need neither.

- `docs/privacy-review-open-food-facts.md` — sends a barcode. Wine coverage in a
  food database is thin, so the benefit is modest.
- `docs/privacy-review-label-ocr.md` — sends a **photograph**. It deserves more
  scrutiny, and it asks you to check Cloudflare's current Workers AI retention
  terms _on the day you enable it_, because they change.

Each ends with a decision line. It is a real decision and it is yours: you are
the one who would be sending someone's photograph to a third party. Once you
have decided, the exact binding and variables are in `docs/self-hosting.md`
under _Optional providers_.

## 4. Watch the API while you are in there (0 min extra)

`pnpm perf` measures the budgets against a local Worker and a local database,
with no network in between — a floor, not a forecast. The deployed numbers can
only be seen on the deployment, and the authenticated flow cannot be automated
against real Firebase. Keeping the network panel open during the acceptance run
is enough to catch anything that feels slow.

## 5. Four sign-offs (§22.2)

- [ ] Accessibility
- [ ] Threat model
- [ ] Privacy
- [ ] Restore and delete

The threat model has one thing worth reading before you sign it: `script-src`
now carries `'wasm-unsafe-eval'`, so the barcode decoder can run. It permits
compiling WebAssembly and nothing else — not `eval`, not `new Function`. The
reasoning is written up in `docs/threat-model.md`.

## 6. Publish the mirror, when you are ready

```powershell
Remove-Item -Recurse -Force ..\vadevi-public-mirror
pnpm mirror:build
```

Then review the exported tree, create an empty public repository, and push. The
script prints the remaining steps and refuses to push anything itself.

Two things guard it. `.mirror-denylist` is on your machine, untracked, holding
the terms that must never be exported; the build deletes the export outright if
it finds one. And the private brief and this file are excluded from the mirror
by name — the brief because it refers to your other private repositories.

Afterwards, point `VITE_SOURCE_URL` at the published repository and redeploy, so
the AGPL §13 source offer resolves somewhere real rather than at a private
repository nobody can open.

---

## What is already established, so you do not re-test it

- Every screen, three widths, both palettes, **with data in the account**: no
  overflow, no serious or critical accessibility violation.
- The offline queue does not duplicate, including across a reload while the
  write is still queued.
- The modal dialog takes focus, keeps it, and gives it back.
- The scheduled handler really purges: a Space and its R2 objects, and an
  account — which removes the leaver's own Space, detaches them from shared
  ones, anonymises their record, and leaves other people's bottles alone.
- A photographed barcode decodes on the device and reaches identification.
