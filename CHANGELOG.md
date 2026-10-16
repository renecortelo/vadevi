# Changelog

What changed between releases, for readers and for anyone running their own
deployment. Each release lists what you will notice first; the commit history
has the reasons.

## Unreleased

### Tastings

- **Where a tasting came from**: a note first recorded by voice (voice
  tastings are coming, see `docs/privacy-review-voice-tasting.md`) keeps a
  quiet microphone in the wine's history and on the note itself — where it
  came from, never a judgement of it, and no edit removes it. Every note
  written so far reads as written by hand.

### For operators

- Migration `0038` adds `tasting_notes.creation_method`; the export schema is
  now `2026.3` and carries it with each tasting.
- Migration `0039` rebuilds `usage_counters` without the metric `CHECK` (the
  metrics are fixed by the code), for a new daily budget,
  `voice_transcriptions`. Back up before deploying it.
- **Voice tastings, step one (off)**: `POST
/api/v1/spaces/{spaceId}/voice/transcribe` turns a spoken tasting into text
  with Workers AI, keeping nothing. It answers "unavailable" unless the
  deployment sets `STT_PROVIDER=cloudflare` after approving
  `docs/privacy-review-voice-tasting.md`; the public default is `none`, and
  the release scan checks it.
- **Voice tastings, step two (off)**: `POST
/api/v1/spaces/{spaceId}/voice/extract` proposes tasting fields from the
  corrected transcript with the deployment's language model, each with the
  words it came from. A value whose words are not in the transcript is
  dropped; a hedged one ("I think", "diria que") is only offered; the
  taster's sentences stay in their own words and language; a producer read
  out of the wine's name is dropped; the region is placed in the atlas even
  when misheard ("Ries Baixes" → Rías Baixas). It draws on the assistant's
  daily budget and saves nothing.
- **Voice tastings, the quick log (off)**: when a deployment turns voice
  tastings on, the quick log offers to describe the wine aloud — record (up
  to two minutes), read and correct what was heard, then fill the form. Only
  empty fields are filled, a hedged value is offered with its words, a second
  wine is pointed out, and nothing is saved until the reader saves. Offline
  the button is off, with its reason.

- **Keeping the registers current**: the routine is in `data/kb/README.md`,
  and `pnpm kb:diff-appellations` shows, country by country, what a refresh
  added, dropped or changed in the atlas before it is committed.
- **The atlas in figures**: `GET /api/v1/library/atlas/coverage` answers, by
  country, how many registered names there are, how many are described in the
  reader's language and in all eight, how each is placed on the map, and how
  many name their grapes — and a page shows it: Library → Atlas → «The atlas
  in figures», a map shading each country by its names (touch one for its
  figures), and each country's bars growing as the page arrives (still, where
  the system asks for reduced motion).
- **Your cellar on the map**: the cellar book's regions come with a map — a
  point for each registered name your wines are from, larger with more wines,
  hollow where the atlas places it approximately; each opens the name in the
  atlas. The statistics add `wines.regionPlaces` for it (a response cached
  before reads as none).

### The atlas

- **The cellar book moves like a dashboard**: its figures count up to their
  value as the page arrives, and its bars — scores, answers, countries,
  regions, grapes, months — grow one row after another as the reader reaches
  them, and slide from old to
  new when a filter changes them. Screen readers read the value itself; with
  reduced motion, nothing moves.
- **Pages change smoothly**: moving between the main sections, or from the
  library's lists to a grape, a registered name or a style, or from Memory,
  sessions and notes to a wine,
  fades the page
  out and lets the next rise in, the title you touched travelling to the
  new page's, while the top bar and the icon bar stay still — where the
  browser can, and never with reduced motion. Disclosures unfold to their
  height and fold away instead of jumping open, and a card's tastings arrive
  the way a page does.
- **More of South Africa on the map**: Vredendal, Koekenaap and Still Bay are
  placed at their town (Still Bay was some 140 km off), and with them Olifants
  River and the names inside it, approximately; in Argentina, Chapadmalal and
  Balcarce at their towns. 15 names remain unplaced.
- **Mexico in the atlas**: «Vinos de la Región Vitivinícola de Querétaro»,
  the protected geographical indication the IMPI declared in the Diario
  Oficial de la Federación on 10 March 2025 — the only one for Mexican wine
  so far — with its summary in the eight languages, its point in the state of
  Querétaro, and a link to the declaration. A wine whose region reads
  "Querétaro" is linked to it. Baja California, the Valle de Guadalupe and
  Parras have no declaration yet, so their wines stay unlinked.
- **Brazil in the atlas**: the 13 indications for wine in the INPI's lists
  of recognised geographical indications — ten indications of provenance
  (IP) and three denominations of origin (DO), from Vale dos Vinhedos and
  Pinto Bandeira to the Vale do São Francisco and the Sul de Minas — each
  with its number, its date and a link to its list, and on the map at its
  place or amid the municipalities its delimitation names (approximately;
  the South America sheet now reaches 6° S). None has a summary yet: no
  article on its wine was found. Vale dos Vinhedos is both an IP (2002) and
  a DO (2012), so a wine that names it is linked to neither until it says
  which.

## 0.3.0 — 12 October 2026

### The atlas beyond the EU

- **Every EU name described**: 1,636 of the 1,637 registered names now have a
  summary — from Wikipedia, from the name's single document in the Official
  Journal (in the EU's own translations), or from its technical file in the
  EU register, translated faithfully and marked as such. Where the Journal
  publishes no Catalan, or leaves out another of the app's languages, a
  faithful translation of its own text fills it, so every described name
  reads in all eight languages.
- **American Viticultural Areas**: all 280, from the Code of Federal
  Regulations (27 CFR part 9), each placed inside its official boundary (UC
  Davis AVA project) on a new map of the Americas and linked to its section
  on eCFR. A wine recorded as "Napa Valley" links to its page.
- **New Zealand**: its 22 wine geographical indications, from IPONZ's
  register, each linked to its page there, on a new map of Oceania. A wine
  recorded as "New Zealand Marlborough" links to Marlborough.
- **South Africa**: the 150 production areas of the Wine of Origin scheme —
  geographical units, regions, districts and wards — each showing the areas
  it lies in and the ones inside it, on a new map of southern Africa.
- **Australia**: all 114 geographical indications of Wine Australia's
  register — the country, its states, zones, regions and subregions — each
  with its date of entry, inside its official boundary, and within the zone
  and state the register lists it under.
- **Chile**: the 118 denominations of origin of its viticultural zoning
  (Decree 464 of 1994) — regions, subregions, zones and areas, Rapa Nui
  included — on a new map of South America.
- **Argentina**: its 121 geographical indications and controlled
  denominations of origin, from the INV's list and its resolutions to 2025,
  each with the resolution that recognised it and where it lies — Agrelo
  in Luján de Cuyo, in Mendoza, in Cuyo.
- **The United Kingdom**: its six registered wine names (English, Welsh,
  Sussex, Darnibole, English Regional, Welsh Regional), from the UK's own
  register.
- **In every language**: the summaries of the names beyond the EU — the
  AVAs, Australia's, New Zealand's, South Africa's, Chile's, Argentina's and
  the UK's — are in all eight of the app's languages, translated faithfully
  from the article and marked as translations.
- **Your wines find their names however the label writes them**: with the
  designation before or after the name ("DO Empordà", "Rioja DOCa", "Napa
  Valley AVA", "Wine of Origin Stellenbosch"), with the country or where it
  lies after a comma ("Margaret River, Western Australia"), or in English for
  a Chilean valley ("Maipo Valley" is Valle del Maipo).
- **Within its country**: a region is read within the wine's own country, so
  a wine from Argentina recorded as "Victoria" is not linked to the
  Australian state — and wines saved before a name entered the atlas are
  linked to it by the scheduled run, once per library build, without
  changing the wine's version.
- **A hyphenated name is one place**: "Sainte-Foy-Bordeaux" was also read as
  "Bordeaux", "Chorey-lès-Beaune" as "Beaune", and a wine recorded as
  Bordeaux matched neither. Only "Jerez-Xérès-Sherry" lists one place in
  several languages. Sainte-Foy-Bordeaux, Chorey-lès-Beaune,
  Savigny-lès-Beaune, Trentino and Oltrepò Pavese metodo classico no longer
  carry another wine's Wikidata item, and the first three are placed at the
  commune their register text names.
- **Each name its own Wikidata item**: every EU link was checked against
  Wikidata. Côtes du Rhône was the whole Rhône valley, Côtes du Rhône
  Villages the Côtes du Rhône, La Clape the Coteaux du Languedoc, Montefalco
  one of its own wines, La Mancha the Manchego cheese; each now has its own
  item, and so do Chorey-lès-Beaune, Savigny-lès-Beaune, Trentino and
  Oltrepò Pavese metodo classico.
- **Within and inside**: a name's page lists the names whose area holds it
  and those it holds — a ward's district and region, an AVA's larger AVAs.
- **Deploying your own**: migration `0033` rebuilds the atlas table so it can
  hold names outside the EU register, `0034` adds where each lies, and `0035`
  and `0036` admit Australia's and Chile's kinds of area; the deploy's library load fills them.
  `0037` records which library build last read each wine's region.

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
