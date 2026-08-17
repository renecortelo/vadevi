# Back at your desk

Ordered so that nothing here waits on anything below it. Everything in this file
needs you: a machine with the deployment credentials, a real phone, or a decision
that is yours to make and not mine.

---

## 1. Deploy the latest `main` (5 min)

The database is already current — the last migration, `0014`, is applied, and
nothing since has needed one. Everything merged since is client code, so a build
and a deploy are all this takes. Rebuilding the web bundle is not optional: the
photo fix and every UI change live in it, and deploying only the Worker would
ship none of them.

```powershell
pnpm install --frozen-lockfile
```

```powershell
pnpm --filter @vadevi/web build
```

```powershell
npx wrangler deploy --config wrangler.preview.jsonc
```

Then, on the iPhone, close and reopen the app — or remove it from the home
screen and install it again — so the service worker picks up the new bundle.
With the old bundle still cached, none of the recent fixes are present.

If a later change ever does add a migration, apply it before deploying the
Worker, never after; migrations are forward-only:

```powershell
npx wrangler d1 migrations apply vadevi-preview --remote --config wrangler.preview.jsonc
```

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

## 3. Both providers are now ON in your deployment — test them, and do the one check that is still yours

You decided to enable OCR (Vicenç) and Open Food Facts. They are switched on in
`wrangler.preview.jsonc` — which is your machine's file, untracked, so the public
default stays `none` and nothing about this is committed. What is set:

| Variable / binding  | Value                                    | Turns on                          |
| ------------------- | ---------------------------------------- | --------------------------------- |
| `ai` binding        | `{ "binding": "AI" }`                    | Workers AI access                 |
| `AI_PROVIDER`       | `cloudflare`                             | both AI features                  |
| `AI_OCR_MODEL`      | `@cf/meta/llama-3.2-11b-vision-instruct` | reading a label from a photo      |
| `AI_MODEL`          | `@cf/meta/llama-3.1-8b-instruct`         | Vicenç's replies                  |
| `RESEARCH_PROVIDER` | `open_data`                              | barcode lookup in Open Food Facts |

The OCR model is one of the three on the allowlist in `apps/api/src/adapters/label-ocr.ts`.
The text model is a current Cloudflare one; if Vicenç ever answers with an error,
check the model catalogue and swap `AI_MODEL` — the names change over time.

A dry-run (`wrangler deploy --dry-run`) confirmed the config is valid and the `AI`
binding resolves. It takes effect on your next real deploy (step 1).

**One thing is still yours and I could not do it:** the label-OCR review asks you
to read Cloudflare's _current_ Workers AI data-retention terms on the day you turn
it on, because a photograph leaves your deployment for their model and the terms
change. Read `docs/privacy-review-label-ocr.md`, confirm the terms are acceptable
to you today, and if they are not, set `AI_PROVIDER` back to `none`.

Then test, after deploying: photograph a label and see it read fields (OCR),
ask Vicenç something (text model), and scan a barcode you expect to be in a food
database (Open Food Facts). Watch the usage counters on **Data and privacy** —
every call is metered and capped per member and per deployment.

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
repository nobody can open. The current default is
`https://github.com/renecortelo/vadevi`; if the public repository is that same
URL made public, nothing needs to change here.

## 7. Optional: tidy the stale branches on GitHub

Thirteen old `codex/phase-*` branches from before pull requests were set to
delete on merge are still on the remote. They are all merged into `main` and
harmless, only clutter. Delete them from the branches page, or:

```powershell
git branch -r | Select-String 'origin/codex/' | ForEach-Object { git push origin --delete ($_ -replace '\s*origin/','') }
```

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
