# Manual acceptance run

The ordered script for the preview acceptance in `docs/preview-environment.md`.
It is written to be worked through in one sitting — roughly 45 minutes for
sections A to G, 20 for section H, and 20 more for I to K — in the order that
fails fastest: anything that would invalidate the rest comes first.

Record the date, the browser, and the device. A run on one browser is a data
point, not a pass.

- Run by: ______________ Date: ______________
- Desktop browser/version: ______________
- Mobile device/OS/browser: ______________

---

## Before you start

Deploy the current code and migrate first, or half of this tests an old build.
The exact commands are in the chat message that accompanied this file, and in
`docs/self-hosting.md`.

Confirm you are on the new build: the sign-in screen should show the bottle-row
lockup with the lowercase `vadevi` drawn across it, the signed-in shell should
show that same wordmark above the navigation rail rather than a serif
"Va de Vi", and the top bar should carry both a language menu and a
System / Light / Dark control.

---

## A. Desktop — identity and Spaces (10 min)

1. [x] Sign in with Google. You reach the first-run profile screen.
2. [x] Set a display name and language, enter the app.
3. [x] **Theme:** switch to Dark. The whole interface inverts — check the left
       navigation rail specifically, including the label of the page you are on.
4. [x] Reload the page. It stays Dark and **does not flash light first**.
5. [x] Switch to System. It follows your operating system setting.
6. [x] **Language:** change it from the top-bar menu. The whole interface
       follows immediately, and stays changed after a reload. This is the
       _reader's_ language: a Space's own default locale does not override it,
       so switching Space must not switch the interface language back.
7. [x] Create a group Space. Invite yourself at a second email if you have one,
       or note this as untested.
8. [x] Switch active Space from the top bar. The Wine Memory contents change.

**Stop if any of A fails.** Everything below assumes a working session.

## B. Desktop — the main flow (10 min)

9. [x] Quick Log a wine manually: producer and name only. It saves.
10. [x] Open **Identify** — from the card on the home screen, or from the link
        inside the wine identity block on the Quick Log screen. Do not navigate
        by URL: if you cannot reach it by clicking, that is the finding.
11. [x] Type part of the producer you just saved into "or type what you can
        read" and search. It proposes your own wine as a candidate, marked as
        coming from your Space.
12. [x] Edit a field on the proposal, then confirm. Exactly **one** wine is
        created, with your edit, not the proposal's value.
13. [x] In Wine Memory, open **More filters** and use region, vintage range and
        score. Try an unaccented spelling of an accented region and confirm it
        still matches. Collapse the panel again: the summary must still report
        how many filters are active, so a narrowed list is never silently
        narrowed.
14. [x] Add a photo to a wine. It uploads and displays.
15. [x] Record a purchase and check the cellar inventory changes.

## C. Desktop — data rights (10 min)

16. [x] **Data and privacy** → Export JSON. The file downloads and contains your
        wines and your notes.
17. [x] Export a CSV. It opens in a spreadsheet **without any cell being treated
        as a formula**.
18. [x] Select a photo and export the media ZIP. It contains exactly what you
        selected.
19. [x] Read the privacy notice on that screen. Confirm it matches what the app
        actually does — if it overclaims, that is a finding.
        Steps 20 and 21 need a **group Space you own** active — switch to the one you
        created in step 7. A personal Space has no delete of its own; it goes with the
        account in step 22, and the screen now says so rather than showing nothing.

20. [x] Type the wrong Space name into the delete field. The button stays
        disabled.
21. [x] Type the correct name, schedule deletion, then **cancel it**. The Space
        survives.
22. [x] Type DELETE in the account field and confirm the button enables. **Do
        not proceed** unless you want the account gone.

## D. Mobile — the part desktop cannot tell you (10 min)

Use your phone against the same preview URL.

23. [x] Sign in on mobile. The Google flow completes.
24. [x] **Install the PWA** to the home screen. Check the icon: it should be the
        wine-red tile with the bottle row and the `vdv` monogram, not a
        generic screenshot.
25. [x] Open from the home screen. It launches standalone, with no browser
        chrome, and the status bar colour matches the theme.
26. [x] **The theme followed you.** If you set Dark on desktop, mobile opens
        Dark without you touching anything. This is the whole point of storing it
        on the account.
27. [x] Quick Log a wine one-handed. Judge whether the targets are comfortable,
        not just whether they work.
28. [x] **Turn on airplane mode.** Open the installed app. The shell loads.
29. [x] Quick Log a wine while offline. It saves locally and shows a pending
        state.
30. [x] Turn airplane mode off. The queued wine syncs, **exactly once** — check
        Wine Memory for duplicates.
31. [x] Rotate to landscape on a couple of screens. Nothing overflows.

## E. Operational (5 min)

This section is the operator's, not the reader's: three of its four steps run
from your terminal, in the repository, with the same `wrangler` login you deploy
with.

32. [x] **Data and privacy**, at the bottom: the usage counters. Each metric
        shows today's count against its cap. What it reports must match what
        this deployment actually configured — a provider you switched on shows
        activity, one you left at `none` shows nothing. A counter that disagrees
        with the config is the finding, not the value itself.
33. [x] Recheck the provider quotas against the official pages **today**.
        `docs/self-hosting.md` under _The caps your providers enforce_ records
        what they were and when; note any change. Done once on 17 September
        2026 — the item is about doing it again on the day you rely on it.
34. [x] Export the database and confirm the file is real:

    ```bash
    npx wrangler d1 export vadevi-preview --remote --config wrangler.preview.jsonc --output backup.sql
    grep -c "INSERT INTO" backup.sql
    ```

    A count in the thousands is a database; a count of zero is a finding.

35. [x] Confirm the R2 bucket is **not** publicly readable. There is no public
        URL to try, and that is the point: a bucket with no public access
        enabled has no address a browser can reach. Check it from the
        dashboard — **R2 → vadevi-preview-media → Settings → Public access**
        must show both the r2.dev subdomain and any custom domain as
        **disabled**. Either one enabled is a serious finding.

### The other half of the backup

Step 34 takes the database. It is not a backup on its own: it carries the rows
that index the photographs, and the photographs are bytes in R2. Restore it
alone and every bottle has a record and no label.

```bash
pnpm backup:r2 ~/r2-backup
```

It prints a line per object and ends with a count verified against the hash D1
recorded, and exits non-zero if a single one did not come back intact. Keep it
beside the `.sql` from step 34, dated the same day: neither half restores without
the other.

## F. Deletion actually deletes (do this last)

This is destructive to the Space you name, so do it on a throwaway Space.

36. [x] Create a throwaway Space (**Spaces → New Space**, type Group), make it
        active in the top-bar switcher, add one wine and one photo.
37. [x] With it still active, **Data and privacy** → type its name → schedule
        deletion. The grace period is a month; shorten it for the test with the
        command under "Shortening the grace period" below.
38. [x] The cron runs every five minutes. After it fires, confirm the Space is
        gone from the switcher, that the wine count for its id is 0 (second
        command below), and that the photo's object is gone from the bucket
        (`npx wrangler r2 object get vadevi-preview-media/<key>` fails).

### Shortening the grace period

Run from the repository, with the deployment's configuration. The first moves
every scheduled job's purge time into the past; the second checks the rows are
gone once the cron has run.

```bash
npx wrangler d1 execute vadevi-preview --remote --config wrangler.preview.jsonc --command "UPDATE deletion_jobs SET purge_after = '2000-01-01T00:00:00.000Z' WHERE state = 'scheduled'"
```

```bash
npx wrangler d1 execute vadevi-preview --remote --config wrangler.preview.jsonc --command "SELECT COUNT(*) AS wines FROM wine_records WHERE space_id = '<id>'"
```

## G. Research, Vicenç, and the entry shortcuts (15 min)

Steps 39–46 need the optional providers on: `RESEARCH_PROVIDER=open_data`,
`WEBSEARCH_PROVIDER` with its key, and `AI_PROVIDER=cloudflare`. With them off,
each screen must still work — the research panel says so plainly, and the wine
records fine — which is itself worth one pass.

39. [x] Open a wine → **Evidence** → **Investigate this wine**. It runs without
        asking you to choose an entity from a list, and comes back with a
        paragraph at the top and small "key → value" cards under "What we found".
40. [x] Read the paragraph and the cards **in your own language**. English text
        here is a finding: translation runs when Workers AI is on. Then **switch
        the language** in the top bar: the paragraph, the curiosities, the
        pairings and the card headings all follow it, not only the labels. The
        first switch to a language takes a few seconds — the evidence is being
        translated, once — and every later one is instant.
41. [x] Check a card's **Source**: it expands to the publisher, the class, and
        the licence. That detail belongs there, not on the face of the card.
42. [x] **Discard** one card. It asks for confirmation, then the card goes and
        stays gone on reload. The paragraph is left alone.
43. [x] Press **Rewrite the text**. The paragraph is written again from the cards
        that remain — the discarded detail must not survive in it.
44. [x] Discard everything, then **Investigate this wine** again. It starts from
        zero: what you discarded is proposed again rather than counted while the
        screen stays empty.
45. [x] Ask Vicenç "what can I pair the ⟨wine name⟩ with?" and then the same
        question by style ("…with that cava?"). Both answer about **that** wine
        and suggest dishes; an answer about a different bottle is a finding.
46. [x] Confirm the suggestions use what research found — a wine you have just
        investigated should give more specific ideas than an empty one.
47. [x] In **Quick Log**, use "Prefill from a wine you have", pick a wine, change
        only the year, and save. It creates a **new** wine, leaving the original
        alone.
48. [x] In Wine Memory, **Edit** a wine and change its **type**. It saves.
49. [x] On the same form, the **country** is a list of country names in your
        language — not a two-letter code — and the wine keeps the country it had.

---

## H. What shipped since the last round (20 min)

None of this existed when the script above was written, so nothing here has ever
been through a real run. The automated tests say it works; what they cannot say
is whether it is any good to use.

Sections **I to K** are newer still — the tastings a wine gathers, the map, and
pairing — and were added on 18 September 2026 when this script turned out to end
before the work it was meant to check. A run that stops at section H passes
without touching any of it.

### The tasting form now follows the wine

50. [x] Start a tasting on a **red**. Tannin is there, and the hues offered are
        red ones — ruby, garnet, brick and so on, not a generic list.
51. [x] Start one on a **white**. **Tannin is gone**, and the hues are white
        ones. A white asking about tannin is a finding.
52. [x] Start one on a **sparkling**. There is a bubble section — bead size and
        effervescence — that the still wines do not show.
53. [x] On any tasting, the **nose is read twice**: once still, once after
        swirling. Both save and come back after a reload.
54. [x] The **descriptors** offered match the wine: a white must not be offered a
        red's vocabulary.
55. [x] Add a wine of type **vermut tinto** and another **vermut blanco**. Both
        save, and both read as proper names rather than as a raw key like
        `wineType.vermouth`.

### Where the wine was tasted

56. [x] On a tasting, type a real bar or restaurant in **the place field** and
        press **Buscar el lugar**. A list appears; pick one. The name, city,
        area **and country** fill in together.
57. [x] Press **Estoy aquí**. The browser asks permission — say yes — and it
        offers where you are. Say no on a second try: it must tell you plainly
        and leave the field usable by hand.
58. [x] Save the tasting, reload, and open it. The place is still there.
59. [x] With `PLACES_PROVIDER` unset the field is four plain text boxes and still
        saves. Worth one pass if you ever intend to turn it off.

### Bottle photos and the evidence screen

60. [x] Open a wine → **Evidence**. Search for a **bottle photo**, and check on
        **the phone** that the results do not spill past the margins.
61. [x] Pick one. It becomes the wine's main photo, replacing the one you took at
        the table.
62. [x] Ask for **more photos** — a second page of results, not the same six.
63. [x] **Remove** a saved photo. It goes, and stays gone after a reload.
64. [x] From a wine **card**, tap the name or the image: it opens that wine's
        evidence.

### Events

65. [x] Create an **Event**, then log a wine straight into it from Quick Log.
        The wine appears under that event.

### The group, and the comparison paragraph

Steps 66–69 need **two accounts** in one shared Space. Invite a second person, or
sign in as yourself on a second browser profile.

66. [x] Both accounts taste the same wine, each with a score and their own
        written note.
67. [x] Ask Vicenç about that wine generally. It gives **the group's average and
        range**, and names people when it attributes a score.
68. [x] Ask about the other person by name. It answers for them — **and never
        quotes their written note**. A peer's prose appearing anywhere is a
        finding, and a serious one.
69. [x] On the wine's **Evidence** screen, with the wine both researched and
        tasted, press **Escribir la comparación**. A paragraph appears setting
        what you tasted against what the producer and the web say. It must not
        invent a flavour neither side mentioned, and must not repeat the other
        person's written words.
70. [x] On a wine that is researched but **never tasted**, the same button says
        plainly that one side is missing rather than writing something anyway.

## I. A wine's tastings, gathered

A wine holds many tastings, and they used to have nowhere to live.

71. [x] Taste the same wine **twice**. On its **Memory card**, the two are behind
        one count — not two buttons, and not a card that has grown a list.
72. [x] Tap the count. The tastings unfold; each opens to read, and from there to
        correct.
73. [x] On a wine you have **never** tasted, the card offers only the way to
        start. A count of zero is a finding.
74. [x] Open that wine's **Evidence**. The same list is there, beside the tasting
        button, and the button says **register another** rather than inviting you
        to taste a wine you clearly already have.

## J. The map

75. [x] **Memory → Mapa.** Real streets, not a grid of lines. A schematic with a
        notice means `MAP_TILES_PROVIDER` is off in the deployment, which is a
        configuration finding rather than a bug.
76. [x] Switch between **tasting places** and **regions of origin**. Both draw,
        and a wine with no coordinate simply is not on the map.
77. [x] Tap a point. It names the wines there and links to each one's evidence.
78. [x] Two tastings at the same bar share **one** point carrying a count, rather
        than stacking two markers on top of each other.
79. [x] **On the phone**, pan and pinch the map. It must not trap the page scroll
        or spill past the margins.
80. [x] **Keyboard, on a desktop.** Tab until a point takes focus: the ring is
        visible, and **Enter opens it**. A point you can reach and cannot open is
        a finding — it was one, until recently.

## K. Pairing, and the venue split

81. [x] On a tasting, the place is now **two separate fields**: a name you type,
        and a box to paste coordinates into. Paste a point copied from a map app;
        the name you already typed survives, and the place reads as located.
82. [x] Paste something that is not a point — a shortened map link, or prose. It
        is refused plainly rather than saved as a place at 0,0.
83. [x] Ask Vicenç **what goes with a dish** — a roast chicken, a steak, whatever
        you are actually cooking. The answer must give **the general criteria
        first**: what the dish is, and what a wine needs to match it, as advice
        anyone could act on. Opening with a bottle from your own cellar is a
        finding; that was the bug.
84. [x] Only **after** that should it turn to your own wines, say which fit and
        why, and distinguish a wine you have **tasted** from one you have a
        **bottle of** right now.
85. [x] Ask about a dish in **your own words** — a regional dish, a diminutive,
        whatever you would really type. If it does not know the dish it must say
        so and **ask you what is in it**, offering the choices. Answering with a
        wine anyway is a finding.
86. [x] Answer that question in one word. The next turn understands it.

---

## L. The door (private deployment)

Needs `ACCESS_MODE=allowlist` and your address in `ADMIN_EMAILS`, which the
maintainer's deployment has.

87. [ ] **About → Allowed accounts** lists the administrator, and each listed
        e-mail says whether it has signed in.
88. [ ] Sign in with a Google account that is **not** listed (a second account,
        or a friend's). The screen says the deployment is private, shows the
        address to pass on, and offers only _Sign out_ — no cellar, no Space is
        created (check the list: the address does not appear as signed in).
89. [ ] Add that address on the admin page, sign in with it again: it comes in.
        Remove it: on its next request it is refused, and its data is still
        there when it is re-added.

90. [ ] **The second door** (needs `ACCESS_TEAM_DOMAIN` and `ACCESS_ADMIN_AUD`,
        which the maintainer's deployment has): open **About → Allowed
        accounts** in a fresh browser. Cloudflare Access asks for a one-time
        PIN sent to your e-mail before the page loads; after it, the list
        loads as before. From the terminal, `curl -I <origin>/api/v1/admin/allowed-accounts`
        answers 302 to `cloudflareaccess.com`, while `/api/v1/me/bootstrap`
        still answers 401 — the door is on the admin routes only.

## M. After the 2026-09-20 review

The first wave of fixes from the external review. Each has a regression
test; these are the parts worth a pair of eyes and a real deployment.

91. [ ] **A co-member's prose stays theirs, in export.** In a shared Space, a
        second member logs a quick note on one of your wines with a comment and
        a "with" text. As the owner, **Data and privacy → Export → JSON**: their
        note is there with its score, and `comment` and `foodText` are `null`.
        The CSV of tastings likewise. Their own export has their words.
92. [ ] **…and in Vicenç.** With Vectorize on (the maintainer's deployment),
        ask Vicenç for something only the second member's comment says. It does
        not surface their note as "your note", nor the wine by it. Your own
        note, asked the same way, is found. (After the deploy, the maintainer
        runs the one-off re-index in `docs/self-hosting.md`; until the next
        scheduled runs have re-embedded, semantic matches are simply fewer.)
93. [ ] **Merging two wines that both list grapes.** Two records of the same
        wine, each with grapes — one grape in common, one not. Merge them: it
        succeeds, the survivor lists the union in order without the duplicate,
        an event that poured the loser now shows the survivor, and the loser
        is gone from the list.
94. [ ] **A page of 100.** With `?limit=100` on the wines request (or a cellar
        that large), the list answers. Export → photographs with a long
        selection answers too.
95. [ ] **Sort by score, page through.** With unscored wines in the cellar,
        page through the score sort to the end: every wine appears once, the
        unscored ones last.
96. [ ] **A screen that fails is not a white page.** On a tasting form, clear
        the date field completely: the form keeps the previous date and
        nothing breaks. (The boundary itself: open the app in a tab, deploy
        a new bundle, then navigate to a screen not yet visited — the
        explanation appears with _Reload Va de Vi_, not a blank page.)
97. [ ] **A misspelled door fails closed.** Not to try on the live deployment:
        `pnpm validate:env --config wrangler.preview.jsonc` passes as it is,
        and with `ACCESS_MODE` misspelled in a copy of the file it refuses,
        as does `pnpm deploy:preview --config <copy>` before touching anything.

98. [ ] **Keep my account.** Data and privacy → type DELETE → schedule. Reload
        the page: the pending purge and its date are shown, with _Keep my
        account_. Press it: the job is canceled, and a reload shows nothing
        pending. (Then, if you are the only owner of a shared Space, the
        schedule itself is refused and names the Space — as is leaving it.)
99. [ ] **Currencies are a list.** Cellar, Shop and Wishlist offer EUR, USD,
        GBP, CHF and MXN in a select; a price in USD shows as dollars.
100.  [ ] **A cleared field stays cleared.** On a saved deep tasting, empty the
          score and one written section, save, reload: both are empty. Set the
          score to 0: it shows 0, not empty.
101.  [ ] **Too many photographs at once.** Export → select photographs whose
          sizes add to more than 48 MB (or trust the test): the request is
          refused with the total in the message, and a smaller selection
          downloads.

## Recording results

For each failure note: what you did, what happened, what you expected, and
whether it reproduces. A screenshot of the console helps more than a description
of the symptom.

Things that are **findings**, not nitpicks:

- Any screen that overflows horizontally on your phone
- Any text you cannot read comfortably in either theme
- Any wording in a non-English catalog that is wrong rather than merely awkward
- Anything the privacy notice claims that the app does not actually do
- Any duplicate created by the offline sync
- Any of another member's **written** tasting text reaching you or Vicenç

Send them over and I will work through them.
