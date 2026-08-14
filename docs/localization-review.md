# Localization review

§13.4 requires a fluent human reviewer to sign off each production catalog, and
states explicitly that machine translation may create a draft only. This file is
that record.

## What the automated gate proves

`pnpm i18n:check` fails the build on any of:

- a missing or extra key against the English source catalog
- an added, dropped, or renamed `{{placeholder}}` or ICU block
- unbalanced interpolation braces
- an empty value
- a raw source key leaking into a translated value
- a German or Dutch string above the 200-character layout budget
- a wrong decimal separator, short-date field order, or missing currency symbol
  for a locale
- a pseudo-localized string that expands by less than 35% or loses a placeholder

`apps/web/src/locales.test.tsx` additionally renders the main flow — home, Quick
Log, Wine Memory, Sessions, Cellar, and Data and privacy — in all eight locales
and under the pseudo locale, asserting each screen shows its own localized
heading with no raw key and no unresolved placeholder.

## What the automated gate cannot prove

Whether the wording is idiomatic, uses the right register, and matches how wine
is actually talked about in each language. Only a fluent reviewer can judge that,
and §13.4 makes English fallback in a non-English production screen a release
blocker.

## Product-owner decision, 2026-08-14

§13.4 makes fluent-human sign-off a release gate and treats English fallback in
a non-English screen as a release blocker. The product owner has **waived the
sign-off gate** for this release: no fluent reviewers are available, and the
release proceeds with machine-drafted catalogs.

This is a recorded, accepted risk, not a satisfied requirement. What it means
concretely:

- The catalogs are complete and structurally correct. The automated gate proves
  there is no missing key, no broken interpolation, and no English fallback.
- The wording in the seven non-English catalogs has not been judged by a speaker
  of that language. Expect register and terminology to need correction.
- Any locale can be revised later without a schema or code change, because
  stable domain codes are never translated in storage — only their labels are.
- If a reviewer does become available, the table below is where their sign-off
  is recorded, and this waiver should be replaced by their entry.

## Sign-off table

English is the source catalog and needs no translation review.

| Locale  | Catalog state          | Reviewer | Date       | Notes                                 |
| ------- | ---------------------- | -------- | ---------- | ------------------------------------- |
| `en`    | source                 | —        | —          | Source of truth for key completeness. |
| `ca`    | machine draft — waived | —        | 2026-08-14 | Shipped under the waiver above.       |
| `es`    | machine draft — waived | —        | 2026-08-14 | Shipped under the waiver above.       |
| `fr`    | machine draft — waived | —        | 2026-08-14 | Shipped under the waiver above.       |
| `it`    | machine draft — waived | —        | 2026-08-14 | Shipped under the waiver above.       |
| `pt-PT` | machine draft — waived | —        | 2026-08-14 | Shipped under the waiver above.       |
| `nl`    | machine draft — waived | —        | 2026-08-14 | Shipped under the waiver above.       |
| `de`    | machine draft — waived | —        | 2026-08-14 | Shipped under the waiver above.       |

No locale carries a fluent reviewer's name. The release proceeds anyway by the
decision above.

## Review procedure

Kept for whenever a reviewer becomes available.

1. Run `pnpm dev` and switch the interface language from the profile settings.
2. Walk the main flow: sign-in, onboarding, Quick Log, Wine Memory with the full
   filter row, a tasting session, the cellar, Vicenç, and Data and privacy.
3. Check register and terminology, not only literal accuracy. Wine vocabulary
   (`producer`, `vintage`, `appellation`, `grape`, `flight`) should read the way
   the language's own wine writing uses it.
4. Confirm that stable domain codes are never translated in storage — only their
   labels are.
5. Check that destructive confirmations read unambiguously: leaving a Space,
   deleting a Space, deleting an account, and confirming a merge.
6. Record the reviewer's name and date in the table above, and open a change for
   any wording that needs revision.

## Areas needing particular attention

- **Data and privacy** copy distinguishes leaving a Space, deleting a Space, and
  deleting an account. Those three must not blur together in translation.
- **Merge confirmation** must make it unmistakable which record survives.
- **Budget status** labels (`Within budget`, `Approaching the cap`, `Close to the
cap`, `Capped`) must stay clearly ordered by severity.
- **Retention wording** must not promise immediate physical erasure of
  provider-managed backups.
- **German and Dutch** compound nouns are the most likely to overflow the
  narrow layouts; the pseudo-locale probe is a proxy, not a substitute for
  looking at the real strings.
