# Manual acceptance run

The ordered script for the preview acceptance in `docs/preview-environment.md`.
It is written to be worked through in one sitting, roughly 45 minutes, in the
order that fails fastest — anything that would invalidate the rest comes first.

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

Confirm you are on the new build: the sign-in screen should show the blush
palette, the signed-in shell should show the lowercase `vadevi` wordmark above
the navigation rail rather than a serif "Va de Vi", and the top bar should carry
both a language menu and a System / Light / Dark control.

---

## A. Desktop — identity and Spaces (10 min)

1. [ ] Sign in with Google. You reach the first-run profile screen.
2. [ ] Set a display name and language, enter the app.
3. [ ] **Theme:** switch to Dark. The whole interface inverts — check the left
       navigation rail specifically, including the label of the page you are on.
4. [ ] Reload the page. It stays Dark and **does not flash light first**.
5. [ ] Switch to System. It follows your operating system setting.
6. [ ] **Language:** change it from the top-bar menu. The whole interface
       follows immediately, and stays changed after a reload. This is the
       _reader's_ language: a Space's own default locale does not override it,
       so switching Space must not switch the interface language back.
7. [ ] Create a group Space. Invite yourself at a second email if you have one,
       or note this as untested.
8. [ ] Switch active Space from the top bar. The Wine Memory contents change.

**Stop if any of A fails.** Everything below assumes a working session.

## B. Desktop — the main flow (10 min)

9. [ ] Quick Log a wine manually: producer and name only. It saves.
10. [ ] Open **Identify** — from the card on the home screen, or from the link
        inside the wine identity block on the Quick Log screen. Do not navigate
        by URL: if you cannot reach it by clicking, that is the finding.
11. [ ] Type part of the producer you just saved into "or type what you can
        read" and search. It proposes your own wine as a candidate, marked as
        coming from your Space.
12. [ ] Edit a field on the proposal, then confirm. Exactly **one** wine is
        created, with your edit, not the proposal's value.
13. [ ] In Wine Memory, open **More filters** and use region, vintage range and
        score. Try an unaccented spelling of an accented region and confirm it
        still matches. Collapse the panel again: the summary must still report
        how many filters are active, so a narrowed list is never silently
        narrowed.
14. [ ] Add a photo to a wine. It uploads and displays.
15. [ ] Record a purchase and check the cellar inventory changes.

## C. Desktop — data rights (10 min)

16. [ ] **Data and privacy** → Export JSON. The file downloads and contains your
        wines and your notes.
17. [ ] Export a CSV. It opens in a spreadsheet **without any cell being treated
        as a formula**.
18. [ ] Select a photo and export the media ZIP. It contains exactly what you
        selected.
19. [ ] Read the privacy notice on that screen. Confirm it matches what the app
        actually does — if it overclaims, that is a finding.
20. [ ] Type the wrong Space name into the delete field. The button stays
        disabled.
21. [ ] Type the correct name, schedule deletion, then **cancel it**. The Space
        survives.
22. [ ] Type DELETE in the account field and confirm the button enables. **Do
        not proceed** unless you want the account gone.

## D. Mobile — the part desktop cannot tell you (10 min)

Use your phone against the same preview URL.

23. [ ] Sign in on mobile. The Google flow completes.
24. [ ] **Install the PWA** to the home screen. Check the icon: it should be the
        burgundy tile with the VV monogram, not a generic screenshot.
25. [ ] Open from the home screen. It launches standalone, with no browser
        chrome, and the status bar colour matches the theme.
26. [ ] **The theme followed you.** If you set Dark on desktop, mobile opens
        Dark without you touching anything. This is the whole point of storing it
        on the account.
27. [ ] Quick Log a wine one-handed. Judge whether the targets are comfortable,
        not just whether they work.
28. [ ] **Turn on airplane mode.** Open the installed app. The shell loads.
29. [ ] Quick Log a wine while offline. It saves locally and shows a pending
        state.
30. [ ] Turn airplane mode off. The queued wine syncs, **exactly once** — check
        Wine Memory for duplicates.
31. [ ] Rotate to landscape on a couple of screens. Nothing overflows.

## E. Operational (5 min)

32. [ ] Open the usage page. Counters are present and both providers read
        `none`.
33. [ ] Recheck the §16.1 provider quotas against the official pages **today**
        and note any change from what the spec records.
34. [ ] Run the D1 export and confirm the file is non-trivial:
        `wrangler d1 export vadevi-preview --remote --config wrangler.preview.jsonc --output backup.sql`
35. [ ] Confirm the R2 bucket is **not** publicly readable — a direct object URL
        should fail.

## F. Deletion actually deletes (do this last)

This is destructive to the Space you name, so do it on a throwaway Space.

36. [ ] Create a throwaway Space, add one wine and one photo.
37. [ ] Schedule its deletion and let the grace period pass, or shorten
        `purge_after` directly in D1 for the test.
38. [ ] Wait for the cron to fire, then confirm the Space rows and the R2 object
        are gone, and that the owner gets a not-found on the next request.

---

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

Send them over and I will work through them.
