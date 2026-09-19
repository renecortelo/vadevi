# Acceptance findings

What the manual runs in `docs/manual-acceptance.md` actually found, and what was
done about it. Kept because a fixed defect is only evidence if the fix is
attached to the report that produced it.

---

## Round 2 — 18 September 2026, the maintainer, iPhone (Safari, installed PWA) and desktop

Sections A to G of the script. Seven findings, six of them defects; one of the
six turned out to be five defects stacked behind a single symptom.

### 1. The loading screen was in the wrong language

**Reported:** "It says 'Opening your cellar' in English or Portuguese when I
have it in Spanish or Catalan."

**Cause:** the account's language was applied after bootstrap and never
remembered locally, so a cold start had only the browser's own language until
the network answered. The theme had solved the identical flash in
`theme-init.js`; the language had not copied it.

**Fix:** the session writes the account locale to storage whenever it applies
it, and the next launch reads it before the network.

### 2. Research failed on every wine

**Reported:** "Investigate says: the research could not be completed, the
existing evidence has not changed."

**Cause:** a budget metric, `websearch_calls`, had been added to the code the
day before without a migration. `usage_counters.metric` carries a CHECK naming
the metrics it accepts; every research run reserved `research_lookups`, then
tripped the constraint on the new metric and answered 500 — while the first
reservation quietly counted a lookup that never ran. No test exercised the
reservation.

**Fix:** migration 0022 widens the CHECK, and a test now reserves every metric
the code knows against the migrated schema, so the next one added without a
migration fails there rather than on a reader's screen. Verified to fail with
the migration removed.

### 3. The Space delete button was missing

**Reported:** "Looks like I can't delete a Space at all, I don't see the button."

**Cause:** not a defect in the code, but one in the screen. A personal Space has
no delete of its own — it goes with the account, by design — and the screen
showed nothing where the button would be, so the design read as a bug. The
script also did not say which Space to have active.

**Fix:** the personal Space now says it is deleted with the account; the script
says to switch to a group Space first.

### 4. The app came up blank when launched offline

**Reported:** "Blank page in airplane mode, unless the app had been open
before; closed and reopened, it won't load."

This one took five fixes, because five separate defects stood behind the same
white screen and each was only visible once the one in front of it was gone.
The order below is the order they were found.

- **The precached shell could not be served.** Workers Assets answers
  `/index.html` with a 307 to `/`, so the precached shell carried the
  `redirected` flag, and a redirected response may not satisfy a navigation:
  the browser refuses it with a network error. It worked after an online visit
  because a successful navigation stored `/` afresh without the flag — so the
  one case offline exists for was the one that failed. The precache now drops
  the flag. Reproduced in Chromium by making the shell redirect the same way.
- **The locale catalogue could not be found offline.** Catalogues are served
  stale-while-revalidate from a bundle cache that fills only online; the
  precache had put them in the shell cache, unlooked-at. The catalogue import
  rejected, and it is awaited at the top of the i18n module, so the module
  failed and nothing rendered. English is inline and never needs the chunk,
  which is why every test in English passed — and why fixing the loading
  screen's language, which made Spanish the reliable boot locale, made the
  blank launch reliable too. The lookup now falls through to any cache, and a
  catalogue that cannot load starts the app in English rather than not at all.
- **The shell could be blank at all.** `#root` shipped empty, so a failed start
  was indistinguishable from a shell that never arrived — which is exactly the
  question that had to be answered. It now carries the wordmark until React
  replaces it, and a plain line saying the app could not start if that never
  happens.
- **The runtime configuration could not be had offline.** It is network-only by
  policy, and in production its failure was rethrown, so a cold launch died
  before Firebase could restore the persisted session. The last configuration
  served is now remembered locally — public browser configuration, validated on
  the way back — and used when the network cannot answer.
- **A missing redirect result undid the restored session.** `getRedirectResult`
  rejects offline after `onAuthStateChanged` has already restored the user, and
  that rejection reached the catch that sets the error screen. It is now
  nothing: there is no redirect to complete offline.

The last two were production-only and invisible to every drill, because the
drills run against the emulator, whose fallback path never throws. They were
found from the device: Web Inspector over USB gave the console, and a listing
of the worker's cache proved the worker current and the precache complete —
seventy-four of seventy-four — which ruled the worker out and pointed at the
application's own start.

Also found on the device: Firebase's auth iframe script in the shell cache.
The policy says auth is never served from a cache; `/__/auth/` was not on the
network-only list. It is now.

**Worth keeping from this one:** a symptom that survives a correct fix is not
evidence the fix was wrong. It is evidence there is another cause behind it.

### 5. The operational section had no instructions

**Reported:** "Not sure how to test the entire section."

**Fix:** each item now says where to look and what to run, including the R2
half of the backup, which the section had not mentioned.

### 6. The evidence did not change language with the interface

**Reported:** "The evidence does not change language when I change it up top.
If I regenerate the text the paragraph changes, but the curiosities and
pairings do not. Everything must be consistent in language."

**Cause:** research translated what it gathered into the language the reader
had on that day, and stored that as the fact. The page then fetched the facts
as written, whatever the interface was set to. Regenerating the paragraph wrote
a fresh one in the new language, which is why that one moved; nothing else was
ever written again. Two more things sat behind it: pairing notes were never
translated at all, even at research time, and a wine with more than seven web
notes was silently not translated either — the translator takes sixteen strings
a call, the caller sent them all in one, and treated the shorter answer as a
failure.

**Fix:** a fact now records the language it was written in, and the evidence
page asks for the facts in the interface's language. Prose in another language
is translated on first read and kept, per language, so a wine is translated
once for each language anyone reads it in and never on every visit; the record
underneath is not rewritten. Each translation call is metered like the
assistant's, and at the cap the page answers in the written language rather
than failing. Pairing notes are translated at research time with the rest, and
long batches are split. Migration `0023`.

### 7. The Space settings page said nothing about deleting the Space

**Reported (after the round):** "It is not clear to me how it is possible to
schedule or delete a Space, if I do not see that option anywhere."

**Cause:** the delete lives on Data and privacy, for the active Space, and the
page where an owner goes to manage a Space said nothing about it. That read as
"you cannot".

**Fix:** Space settings now says where the delete is, for an owner of a group or
couple Space, and links there; the Data and privacy note for a personal Space
says to activate a group Space in the switcher and come back. Section F of the
script, which schedules a deletion for real, had the same gap — it did not say
to make the throwaway Space active — and now does, with the two commands that
shorten the grace period and check the purge.

## Round 4 — 19 September 2026, the maintainer, iPhone and desktop, two accounts

Every item of the script ticked. Five things found outside it.

### 1. The tasting comparison set the tasting against the wrong material

**Reported:** "It sometimes brings data that has nothing to do with it — winery
facts, years, places. Only what is relevant to tasting can be compared against
mine."

**Cause:** the paragraph was written from every prose fact on the wine,
including the Wikidata highlights (a founding year, a country, hectares) and
the producer's history, and the prompt did not tell the model which part of a
source to use.

**Fix:** only the composed narrative, the web notes and the pairing notes go
in, and the model is told to use from them only what describes how the wine
looks, smells, tastes and feels — and to say plainly when the sources say
nothing about that. The test that seeds a data-point highlight now asserts it
never reaches the paragraph.

### 2. The event form seemed to have one place field

**Reported:** "Creating an event, the place is still a single field; the split
into place and coordinates you did on the tasting has to be replicated."

**Checked:** the event form uses the same component as the tasting and, on the
current deployment, shows both — the place and the "paste Google Maps
coordinates" box, with _Search_ and _I'm here_ (Chrome, 19 September). The
box landed on 16 September (#158), after the event form was last looked at on
the phone. Not reproduced; to be re-checked on the phone after an update. If
it still shows one field there, that is a real finding with a different cause.

### 3. A raw key on the tasting read screen

**Reported:** `quicklog.sentimentValue.undefined`.

**Cause:** a deep note's sentiment is optional — absent, not null — and the
screen tested for null.

**Fix:** tested for absence.

### 4. Vicenç answered one account and not the other

**Reported:** "In one of my accounts Vicenç returned 'the AI could not reply
just now: this is a direct structured search'; in the other it answered."

**Cause:** the first account had spent the day's twenty AI replies — the
counters show 20 of 20 for it and 7 for the other. Evidence translation draws
on the same metric, and the day's language switching on several wines had
used most of it before Vicenç was asked. The cap is the application working
as designed; the message said "could not reply", which reads as an outage.

**Fix:** a turn refused by the budget now says the daily limit is reached and
comes back tomorrow, in all eight languages; "could not reply" is kept for a
model that was asked and produced nothing. The member share of the AI budget
is 40 of the deployment's 60 (the deployment cap is what bounds the cost; the
member cap only divides it). The caps table in `docs/self-hosting.md` had
drifted again — it said 30/120 — and `pnpm docs:check` now fails the gate
when it disagrees with the code.

### 5. Vicenç kept the previous Space's conversation

**Reported:** "Switching group and coming back to Vicenç shows the earlier
chats; those must be cleared."

**Fix:** the saved chat remembers the Space it belongs to and is dropped for
any other, and a switch while the screen is open clears it at once.

## Round 3 — 19 September 2026, Claude on the maintainer's behalf, Chrome (desktop) and the terminal

Items 34–38 of the script, run as the operator: the two halves of the backup,
the bucket's public access, and the deletion drill on a throwaway Space the
maintainer had created (`Testaborrar`). All five pass; the drill found one
defect on the way.

### 1. The Space purge failed on its first run

**Observed:** with the throwaway Space holding one wine and one photo and its
purge time moved into the past, the 08:20 cron run threw
`D1_ERROR: FOREIGN KEY constraint failed` inside `purgeSpace`; the 08:25 run
completed it (11 rows, 1 object). Seen in `wrangler tail`; the app showed
nothing either way.

**Cause:** `identification_drafts` is Space-scoped and references `spaces`,
`media_assets` and `wine_records`, and the purge list did not include it. An
unconfirmed draft expires after thirty minutes and is swept by the same
schedule — which is why the second run got through. A **confirmed** draft is
kept as a tombstone with no expiry, so any Space in which a bottle was ever
confirmed through identification would have failed its purge every five
minutes, for ever, with nothing to say so: one job's exception also stopped
every job behind it and the rest of the scheduled work.

**Fix:** the table is purged first. A schema test now takes every table with a
`space_id` column from `sqlite_master` and fails unless it is on the purge list
or named as exempt with a reason, so the next Space-scoped table cannot be
forgotten. Each job runs on its own: one that cannot complete is logged and
retried next time, and the others still run. The reproduction — a confirmed
draft in the purged Space — is in `deletion-executor.test.ts` and fails
against the previous list.

### 2. Evidence translation on read returned nothing on the deployment

**Observed:** opening a researched wine's Evidence in Spanish reserved one
model call and stored no translation; the log said
`translation returned no usable array (wanted=16)`. The page still rendered,
in the written language, as designed — but the language switch it exists for
did not happen.

**Cause:** sixteen translated paragraphs written as a bare JSON array is a
long reply for the model to keep well-formed; the assistant learned the same
lesson and asks for its claims against a strict JSON schema.

**Fix:** the translator asks for a schema-bound object first and falls back to
the plain prompt only if the model rejects the schema; the failure log now
carries the reply's shape (never its text). Verified on the deployment after
redeploying: the same wine read in Spanish came back with every curiosity and
pairing in Spanish, switched to German in twenty-seven seconds with all of
them in German, and back to Spanish in under two hundred milliseconds from
the kept translations. The log for that switch also showed the page sending
the read twice — the effect re-ran once for the catalogue and once for the
language — so two full translations were paid for; the error text is now
kept as a key so the effect depends on the language alone. And the batches,
which ran one after another, now run together, so a first read in a new
language waits for the longest batch rather than the sum.

## Round 1 — 16 August 2026, the maintainer, Google Chrome, desktop

Mobile was not exercised. Items 1–8 of that run passed; the run stopped at the
identification step.

### 1. The wordmark was still the old serif "Va de Vi"

**Reported:** "The current deploy shows the system/light/dark… Logos are still
out."

**Cause:** two separate defects behind one symptom.

- The desktop shell drew the brand from a CSS pseudo-element,
  `.primary-nav::before { content: "Va de Vi" }`, which sat on top of the real
  wordmark and hid it at wide viewports. The brand work replaced the element it
  could see and never the string in the stylesheet. Text in `content` is also
  invisible to translation and inconsistently exposed to assistive technology,
  so it should not have been carrying a brand name in the first place.
- The application icon had been redeployed correctly but drew badly: the two
  V-shapes overlapped enough to read as a single W.

**Fixed:** the wordmark is now one real element that moves into the navigation
column on wide viewports, and the pseudo-element is gone. The icon was redrawn
with the two letterforms separated and checked by rendering it, not by reading
the path data.

### 2. The navigation rail was unreadable in dark mode

**Reported:** "in the left pane, when dark, nothing is readable, colors are
similar."

**Cause:** `.primary-nav` painted itself with a literal `rgb(255 250 244 / 92%)`,
so it stayed a light surface while the text inverted around it. Auditing the
stylesheet for the same mistake found **32 hardcoded colours** in total.

**Fixed:** every one of them now resolves through a token that both palettes
declare, with new tokens added where the palettes had no equivalent. The one
literal deliberately left is the Google brand blue on its white sign-in mark,
which is not ours to theme.

A contrast test covers the pairs the interface renders in both palettes, so this
class of defect fails a build rather than a run.

### 3. Identification was unreachable

**Reported:** "couldn't find **identify** anywhere. If you meant **Wine
Identity** the section, then if I type part of the producer nothing happens."

**Cause:** the screen existed and worked, and nothing linked to it. What was
found instead was the manual identity fieldset on the Quick Log screen, which is
a different thing that happens to be named similarly.

**Fixed:** entry points added on the home screen and inside the Quick Log
identity block. An end-to-end test now walks to the screen by clicking from
both, so a reachable-only-by-URL screen fails a build.

### Raised separately in the same session, not from the script

- **No way to change the interface language after onboarding.** The language was
  asked once, at first run, and then fixed for the life of the account. Added a
  language menu to the top bar, saved to the account like the theme. Worth
  stating plainly, because the report also expected a Space's locale to change
  it: the two are separate on purpose. A Space's default locale describes the
  Space; the interface language describes the reader, and one member switching
  Space must not restyle the interface for what another member chose.
- **Wine Memory filters crowded out the wines.** Eleven controls sat above the
  results. They now collapse behind a disclosure, with free-text search left
  open and a count of active filters shown even when the panel is closed.
- **The top bar ate nearly half a phone screen**, and the theme control was
  hidden below 640px entirely — so the control the report asked for did not
  exist on the device where it matters most. Both fixed: the controls wrap along
  a row instead of stacking, and neither is hidden.

### Follow-up: the artwork itself

Supplied afterwards as four images — the wordmark lockup and the app icon, each
on a wine ground and on a cream one. The marks and the palette were rebuilt from
them.

The lesson from finding 1 is built into how: every mark now comes from
`scripts/generate-brand.ts`, which describes the letterforms and the bottle
silhouettes once and writes out the icon, the maskable icon, both lockups, and
the geometry the application draws inline. `pnpm brand:check` fails the build if
a committed asset stops matching that description, because hand-editing one file
at a time is exactly how the icon drifted into a W while looking plausible on
its own.

The letterforms are drawn rather than set in a font. A geometric face is circles
and straight strokes, so it can be built from them, and doing so avoids both a
CSP exception for an external font host and the weight of self-hosting a whole
typeface to draw six letters. The wordmark inherits `currentColor`, so one mark
serves both themes.
