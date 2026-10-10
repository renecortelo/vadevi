# Changelog

What changed between releases, for readers and for anyone running their own
deployment. Each release lists what you will notice first; the commit history
has the reasons.

## 0.2.0 — 10 October 2026

### A wine library, from open sources

- **Grapes**: cards for 191 varieties in eight languages, with structure,
  aromas, colour, origin and pairings — every value with the sentence of the
  article it was read from — and photographs from Wikimedia Commons.
- **Atlas**: all 1,637 wine names registered in the EU, from the register
  itself, each on a map, with its categories of product and main grape
  varieties read from its own single document (technical file or Official
  Journal). 895 carry a summary from Wikipedia.
- **Styles and methods** explained in every language.
- **Pairing** from rules, each rule with an open source, without a provider.

### Your own numbers and your taste

- **Cellar book**: what you taste, buy and keep, counted — yours across every
  Space, or a Space's — narrowed by type, country, region or grape; spending in
  each currency apart; the most points for the money; every wine opens.
- **Your taste profile**: what you score above and below your own average, by
  grape, region, country, type, descriptor, structure and price band, with the
  tastings and wines behind each trait; what you reach for, what you rebuy, how
  your taste moved over the last year; bottles in your cellar that match.
- **What you say**: your own words about your taste, kept apart from what is
  deduced; Vicenç reads both and says when they disagree.
- **Vicenç** answers "what is my style?", "how much have I spent?" from the
  same numbers, and can tell your taste in a few sentences, every figure
  checked to be yours.

### Names that hold together

- A wine's grapes and region link to the library where the name is certain,
  and read in the app's language: "Samsó" is Carignan in English and Cariñena
  in Spanish; a registered region reads by its official name.
- A missing country is taken from the region or, failing that, from the
  producer's other wines.
- Regions, producers and grapes written several ways read as one; **Tidy
  names** offers what cannot be linked, to rename once confirmed.
- A wine is corrected from its own page, country included.

### Sharing and privacy

- In a couple's or group's Space, the comparison of a tasting with its sources
  names every taster rather than saying "you".
- A deployment can be private: an allowlist of who may sign in, and Cloudflare
  Access in front of the administrator's screens.
- Account deletion can be read back and canceled; a purged account is
  anonymised and unlinked.

### Offline and reliability

- The app starts offline from a cold launch, and never shows a blank screen.
- Backups cover the photographs as well as the database (`pnpm backup:r2`).
- Every page opens at its top; a wine opened from a list shows the way back.

### For operators

- Migrations `0022`–`0032`. The wine library loads with each deploy and writes
  only what changed, within a daily write budget.
- Export schema `2026.2` (adds what a reader says of their taste).
- Every optional provider defaults to none; the AI cap is per day.

## 0.1.0 — 17 September 2026

The first public release: Wine Memory, quick and deep tastings, tasting
sessions, cellar and wishlist, evidence with sources, Vicenç, eight languages,
offline use, Spaces for one, two or a group.
