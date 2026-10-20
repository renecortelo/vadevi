# Changelog

What changed between releases, for readers and for anyone running their own
deployment. Each release lists what you will notice first; the commit history
has the reasons.

## Unreleased

### First impressions

- **The sign-in card, with the reel in it**: one card instead of two. Its head
  is the reel, told with the logo's bottles: it opens on the word, and with
  each of six quick steps — a tasting, a label, the library, Vicenç, your
  cellar on the map, your taste — a small bottle drops into its place in a
  row until all seven are there; then the bottles stretch up or shrink down,
  each by its own measure and a moment apart, and the row grows into the logo, the letters falling across it, above a one-line close and
  «Continue with Google», and the logo stays a while. Under twenty seconds a
  pass, it loops, with one quiet pause button in its corner; still for
  reduced motion, and the logo holds its place until it loads.
- **Light or dark before signing in**: the sun-and-moon button sits beside
  the language on the sign-in screen; the choice stays on the device until
  the account's own preference takes over.

### The library

- **Your wheels, in the taste profile**: the aromas you chose and the colours
  you saw in your own tastings, each part as large as the tastings that name
  it, and nothing you did not note. The profile (`GET /api/v1/me/taste-profile`)
  gains `wheels`: each cue's and each colour's count of tastings, the colour
  read back to its code from the name it was written in.
- **The wheels in the detailed tasting**: the colour is chosen on the colour
  wheel, with only the colours that kind of wine shows (a red's five, no
  white's), and names its colour family when none was chosen; a colour saved
  earlier in other words is kept and shown until another is chosen. The nose
  finds its aromas on the aroma wheel, folded away until asked for: each one
  chosen becomes one of the nose's cues, beside the ones the form offers, with
  its intensity. Saved notes, the profile and the sessions name these aromas
  in the reader's language, from the library's vocabulary, offline too.
- **The wheels and the atlas in figures are tabs of the library's page**,
  like the grapes and the names: the page stays as it is and only what is
  beneath the tabs changes (`/library?tab=wheels`, `/library?tab=atlas`; the
  old addresses lead there).
- **Aroma and colour wheels**: a new shelf of the library. The aroma wheel
  narrows the vocabulary by family and group to one aroma, drawn and named,
  with the grapes whose sources name it; aromas no grape carries yet are
  faint. The colour wheel holds the colours a tasting notes, by the kind of
  wine that shows them, each in its own tint. One thin ring at a time, its
  parts fanning out as a level opens; the part pointed at or chosen steps out
  and is named large in the centre, with its grapes or its kind of wine; the
  level's parts are listed beneath as buttons, for touch, keyboard and screen
  reader alike; a round button with a drawn return arrow, in the ring's
  centre, steps back, naming where it leads («Back to Aromas»). A family
  with a single group (Flowers, Spice, Nuts, Sweet) opens straight onto its
  aromas, without a level that repeats its name. A colour leads to your own wines tasted in it
  (`GET …/wines?hue=`, matching the colour's name in any of the eight
  languages a tasting was written in).
  `GET /api/v1/library/aromas` answers each aroma's name and its number of
  grapes, and `GET /api/v1/library/grapes?aroma=` the grapes that carry one.
- **No tannin gauge for a white grape**: its wine has next to no tannin, so
  the card leaves the row out instead of showing an empty one that read as a
  figure missing — unless a source gives a level.
- **Pairings read by hand**: a hand reading can carry the dishes a grape's
  article pairs it with, in the article's own words; eleven more grapes
  have them — Chardonnay, Sangiovese, Albariño among them (34).
- **Austria's vineyards, from Statistik Austria**: 27 Austrian names — the
  states, the wine-growing areas such as Wachau, Kamptal or Neusiedlersee,
  and the regions — show their vineyard area from the 2020 vineyard survey,
  credited as an extract with the year and a link.
- **Germany's vineyards, from Destatis**: the 13 German wine-growing regions
  — Rheinhessen, Pfalz, Baden, Mosel among them — show their planted area
  from the Federal Statistical Office's 2022 survey, credited with the year
  and a link.
- **More grapes for regions beyond the EU, from their whole article**: 72
  more regions — Lodi, Alexander Valley, Walla Walla Valley, Eden Valley,
  Canberra District among them — show the grapes their English article says
  are grown there today, each with its sentence; history, a single estate
  and a climate merely suited to a grape are left out; 13 more from their
  Spanish, French or German article — Chile's Maipo, Itata and Aconcagua,
  Switzerland's La Côte, Chablais and Dézaley (228 regions).

## 0.4.0 — 19 October 2026

### Finding your way

- **Five destinations**: the bar now holds Home, Log, My wines, Discover
  and Me, and each section's pages are tabs at its head — Quick tasting ·
  Identify a bottle · New event; Memory · Cellar · Wishlist · Prices; Library
  · Vicenç; Cellar book · My taste profile · Events · Settings and more. The
  home's shortcuts are grouped the same way, and the bar's icons are larger.
  The source code (AGPL-3.0) is offered on «Settings and more».
- **Always a way back**: every page deeper than a section's tabs opens with
  «← » and the name of the page you came from, and goes back to it in place;
  reached from outside, it leads to the section's first page. The library
  keeps its own trail from card to card.

### The library

- **What Va de Vi is for, in nineteen seconds**: the sign-in screen shows a
  short reel below the sign-in card — a tasting by hand or voice, a label
  read, the library counting up to its own figures, Vicenç citing a source —
  and ends on «Get started», which leads to the sign-in button. Drawn in
  code, so it is light, sharp, offline and in all eight languages; the
  figures are counted from `data/kb` when the app is built
  (`virtual:library-figures`), never written by hand. It loads after the
  card, can be paused, and with reduced motion is its last frame, still.
- **A grape at a glance**: a grape's card now draws its aromas — raspberry,
  white pepper, leather — each over its name in your language, and shows
  acidity, tannin and body as three steps; a value no source gives is marked
  «no figure in the sources» instead of left blank. A small round shows the
  grape's colour. The drawings are Va de Vi's own, in one line style; most
  aromas take their group's drawing (red fruit, citrus, flowers), so a wheel
  of them will not be a crowd.
- **A region's height, and your wines from it**: the climate adds the height
  of the name's point (Copernicus DEM GLO-90, through Open-Meteo; CC BY 4.0),
  and the card lists your own wines from that name in the Space you are in —
  how many, how often tasted, their mean score, each linked to its page.
  Only wines whose region the library knows for certain to be that name
  count. The wine list takes a new filter, `regionRef`.
- **A grape's levels as gauges**: acidity, tannin, body, alcohol and dry or
  sweet are drawn as one continuous gauge each, filled to where the level
  sits (a range for sweetness), with no figure: the sources give three
  levels, and the gauge claims no more.
- **France's vineyards, from the customs**: 342 French PDOs show their area
  in production and the volume produced from the customs' 2024 harvest
  declarations (Licence Ouverte), credited with the year and a link. A PDO's
  sum takes in its alternative names, its complementary geographical names
  and premiers crus, and the wine declared as fit for it — so Champagne, the
  crémants, the Beaujolais crus and Côtes de Bordeaux's Blaye or Castillon
  count — and leaves out wine meant for Cognac or Armagnac.
- **Argentina's vineyards, from the INV**: 66 Argentine indications named
  after a department or a province — Mendoza, Luján de Cuyo, Maipú, San
  Juan, Chilecito, show their vineyard area from the
  wine institute's 2024 report (CC BY 4.0), credited with the year and a link.
- **Spain's vineyards, from the Ministry**: 94 Spanish PDOs show their
  registered vineyard area from the Ministry of Agriculture's 2022/2023
  report, newer than any article's and credited to it.
- **More grapes with alcohol, sweetness and body**: their articles in six
  more languages (`pnpm kb:fetch-grape-articles`) and 51 more values read by
  hand bring alcohol to 61 grapes, sweetness to 88 and body to 78; acidity
  reaches 110 grapes and tannin 49. Aromas can be read by hand too, in the
  article's own words: 20 more grapes have them, Pinot noir among them (172).
- **Grapes for regions beyond the EU**: 143 regions with no register list —
  American AVAs such as Napa Valley or Willamette Valley, Australia and its
  GIs, Chile's valleys, Mendoza, New Zealand — now show the grapes their own
  article, in any of the library's languages, says are grown there, each
  with its sentence (585 links); 122 of them had no grape at all.
- **Dry or sweet, and alcohol**: a grape's card adds two scales — the
  alcohol its wines typically reach, and how dry or sweet they are, as a
  range where its sources give one (Sémillon's «dry and sweet white wines»
  fill the whole bar). 107 values read by hand from the grapes' articles in
  seven languages, each with its sentence and checked against it like every
  other: alcohol for 38 grapes, sweetness for 63, body for 62.
- **Smaller fixes from a first look on a phone**: a region's three figures
  stay on one row (large ones in short: «65 mil ha», «3,2 M hl», the exact
  figure on hover); they are credited as every Wikipedia text is («De
  Wikipedia · CC BY-SA 4.0»); the month-by-month chart and the bars keep a
  phone's width on a wide screen; spice is drawn as a mortar and pestle.
- **A region at a glance**: a registered name's card now opens with how many
  varieties its specification lists, its planted hectares and its yearly
  hectolitres — the last two from its Wikipedia article's infobox, with the
  year and a link; a figure given in acres says it was converted. Then its
  climate: the Köppen–Geiger type in words («Mediterranean, warm summer»),
  the rain of a year, the mean temperature, the heat of the vine's season on
  Winkler's five steps, and twelve months of rain and temperature in one
  small chart. The climate is the one at the name's point on the map,
  1981–2010, from CHELSA V2.1 (CC0), and the card says that for a large area
  it is only a guide. 2613 names have a climate; 652 have area or
  production.
- **One aroma vocabulary**: the library's 123 aroma terms now sit in nine
  families and twenty groups (`packages/i18n/src/ontology/aromas.ts`),
  reusing the tasting ontology's codes where it has the aroma — the base for
  the aroma wheel and the tasting picker to come. The grape API adds
  `aromaTerms`, each aroma's term in the same order as `aromas`.

### Tastings

- **Where a tasting came from**: a note first recorded by voice (voice
  tastings are coming, see `docs/privacy-review-voice-tasting.md`) keeps a
  quiet microphone in the wine's history and on the note itself — where it
  came from, never a judgement of it, and no edit removes it. Every note
  written so far reads as written by hand.

### For operators

- Migration `0043` adds `kb_grapes.alcohol` and `kb_grapes.sweetness` in
  place; the grape API adds `alcohol` and `sweetness` (`{from, to}`). Body,
  alcohol and sweetness read by hand live in `data/kb/grape-readings.json`.
- Migration `0042` adds `kb_regions.climate` and `kb_regions.figures` in
  place (nothing is rebuilt); `pnpm kb:load` fills them. New builds:
  `pnpm kb:fetch-climate` and `pnpm kb:fetch-region-figures`
  (`data/kb/README.md`).
- **Voice tastings can be switched on**: the privacy review
  (`docs/privacy-review-voice-tasting.md`) records the Workers AI terms as
  read on 18 October 2026 — no retention of inputs, no training on them —
  and the reference deployment's decision. To make room in the free Workers
  AI pool, label reads go from 80 to 60 a day; voice allows ten recordings a
  member and fifteen for the deployment, at most two minutes each.
- Migration `0040` rebuilds `kb_regions` without the list of designations
  `gi_type` admitted, so each new register no longer needs a rebuild. Back up
  before deploying it. `pnpm kb:fetch-registers` reads the registers
  transcribed in `data/kb/registers/`.
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
- **Voice tastings, the deep tasting and a new wine (off)**: the same in the
  deep tasting, where what was said fills the empty fields of every step
  (the serving temperature and the food in the context, the aromas as the
  nose's note when nothing else was said of it), never the wine or the date;
  and in «Identify a bottle», where what was said of the bottle is looked up
  as a typed hint would be, then fills what the review leaves empty.
- **Voice tastings, from the first real notes**: the nose and the mouth are
  kept in the taster's own sentences when the model gives only aromas and
  levels; the tasting words the form offers are ticked from what was said
  («vainilla», «brioche», «flor blanca»); a name, a region or a bottle size
  that was never said is dropped («local region» for «de aquí de la zona»);
  «no sé…» is a doubt, offered rather than filled; and the day said
  («ayer») becomes the tasting's. A second note into a draft never saved
  replaces what the first one filled and the reader left alone, never what
  they typed; the quick log has «Clear the form»; and a draft begun on
  another day, its date never changed, is taken up today.
- **Voice tastings, levels from the words**: a level said plainly — «alta»,
  «hoher», «corto», «ligero», «muy alta», in the app's eight languages — is
  read from the words, not from the model's sense of the scale (it read
  German "high" as 5); a wine said to be dry or sweet gets its sweetness
  from that sentence when the model left it out. Measured on 20 notes it
  had never seen: 97 % of the fields proposed right, 84 % of those expected
  proposed.
- **The day a tasting was, counted, not guessed**: «ayer», «antes de
  ayer», «el sábado», «hace tres días» and their like in the app's eight
  languages are counted back from the reader's own day by the server; the
  model only finds which words name it (it once put "last Saturday" a day
  off). Words naming two days leave the model's answer.
- **Send a spoken note to improve voice**: beside a voice note's result, a
  button keeps that one note — the transcript as corrected, what the app
  proposed and the form as left, never the audio — for thirty days, so real
  use can correct the extraction. Only when pressed, at most thirty a day,
  removed with the Space or the account. Migration `0041` adds
  `voice_reviews`; the scheduled handler removes what has expired.
- **Voice tastings, read more faithfully (off)**: measured on 35 new
  recordings in seven languages, the fields proposed were right 93 % of the
  time. "Would buy" and "would drink again" said as yes or no are now kept
  (they were dropped); clarity, texture and type said in the note's own
  language are read as the form's; "no bubbles" fills nothing instead of
  the lowest level; a short or long finish is 2 or 4; and a change of
  bottle is heard in every language, but "buy another bottle" is not one.

- **Keeping the registers current**: the routine is in `data/kb/README.md`,
  and `pnpm kb:diff-appellations` shows, country by country, what a refresh
  added, dropped or changed in the atlas before it is committed.

### The atlas

- **The cellar book's map names before it opens**: touching a point shows
  the name and how many of your wines come from it, with «Open its page»;
  that page, and a name opened from the atlas in figures' map, now lead back
  to where you came from instead of to the library.
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
- **Figures move whenever you reach them**: the cellar book's and the atlas
  in figures' bars grow, and their figures count, each time they come back
  into view and after the page has finished changing — not only the first
  time, and not unseen beneath the cross-fade. The atlas's country bars move
  too.
- **Maps that come closer**: the atlas in figures', a name's and the cellar
  book's maps zoom with the wheel, a pinch or their + and − buttons, and move
  with a drag (one finger still scrolls the page until the map is zoomed).
  On the atlas in figures, touching a country chooses it — the page shows its
  figures alone — and frames it with a point for each of its names; touching
  a point names it, with its kind and a link to its page. The points are
  small solid dots (fainter where a name is placed only approximately), each
  answering a fingertip around it; once a country is chosen, a touch on the
  land around no longer chooses another, and «All countries» brings the whole
  map back. Every map zooms out as far as its whole sheet, from wherever it
  opens.
- **Your taste profile, drawn**: what you score above and below your own
  average is a chart of bars either side of a line, green and red; what you
  drink most is a ring, by type, country or grape, its shares counting up —
  as many as together hold four fifths of your tastings (up to ten), so
  «Others» is never more than a fifth, the legend in two columns;
  and how your drinking moved is a pair of bars, before and the last twelve
  months. Each plays as it comes into view; the wines behind each trait are
  folded underneath.
- **Styles and methods, browsable**: a gallery like the grapes', each card
  with its picture, its kind and a line of what it is; filtered by kind
  (types of wine, in the vineyard and the cellar, how it is made, concepts)
  and ordered by best known or A to Z. Pictures come from Wikimedia Commons
  under free licences, each credited on its page (`pnpm
kb:fetch-topic-images`; 19 of the 41 have one).
- **The memory's map in the app's style**: «Where they're from» is drawn on
  the app's own map, like the atlas and the cellar book, zooming and naming
  the wines of a touched point, and shows (Europe's sheet) even before any
  region is placed; «Where I tasted» keeps street tiles, tinted
  to the app's palette (dark at night), with its points in the app's colour.
- **Credits, quietly**: every note of where a text, a photo or a map's
  points come from is set the same way across the app — smaller and fainter
  than what it credits. The maps no longer credit Natural Earth, which is
  public domain and asks for none.
- **The atlas in figures, a shelf of the library**: it is the fourth tab
  (Grapes · Names · Styles and methods · The atlas in figures), with a way
  back; each country reads in the page's own type with a link to its names;
  and «With grapes» now counts the grapes a name's own register lists, not
  only those a grape's article names (about 60 % of names, not 10 %).

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
- **126 more names described by the article of their place**: where no
  article describes a registered name, the article of its town, valley,
  commune or wine region often has one sentence on its wine — Martinborough's
  Pinot noir, Stellenbosch's Huguenot vines, the Calchaquí valleys'
  Torrontés, Lake Thun's four winegrowing villages. Each was read by hand,
  copied as written, and kept only if it reads on its own, speaks of wine
  (not table grapes, raisins or pisco) and is about a place in the name's
  own country; homonyms elsewhere — Spain's Salamanca, California's San
  Carlos, France's Jura — were refused. Afrikaans articles count too. All
  are translated into the eight languages. Names beyond the EU without a
  summary go from 506 to 380.
- **Rogue Valley, spelled right**: its regulation misspells it «Rouge
  Valley» once; the atlas now shows the name every other line of it uses,
  keeps the misspelling as an alias, and describes it by its article.
- **Thirty-seven more names described beyond the EU**: Mexico's and
  Uruguay's regions keep the sentence chosen for them; the UK's five take
  the opening of their GOV.UK specifications (Open Government Licence); and
  21 South African, Argentine, Australian, New Zealand, Chilean and Canadian
  names take the sentence their country's English wine article gives them,
  each read by hand (six were refused: they leaned on the sentence before,
  or spoke of another wine). All are translated into the eight languages.
- **Every EU name described**: Samos, the one registered name with neither
  an item nor a summary, takes its German and French articles, translated
  faithfully into the other six languages.
- **Eighteen more grapes in the library**: those the registers beyond the EU
  name — Koshu, Delaware, Concord, Niagara, Campbell Early, Petit Manseng,
  Moscato Giallo, Ruby Cabernet, Grechetto, Pignolo, Refosco dal Peduncolo
  Rosso, Rondo, Siegerrebe, Cabernet Dorsa, Usakhelouri, Ruché and others —
  each with its facts quoted from its article and checked as every other
  grape's, and a picture under a free licence where Commons has one: 209
  grapes, and 372 of the varieties the registers name now link to a card.
  `grapes-include.txt` may name a Wikidata item where a name's search finds
  a city first (Koshu, Delaware).
  Their summaries are in all eight languages: where no Wikipedia has one,
  the English is translated faithfully and marked as a translation (74).
- **Japan's and Brazil's grapes from their own specifications**: Japan's
  five wine indications list the varieties their National Tax Agency
  specifications allow, and Brazil's thirteen the cultivars of their INPI
  cadernos (scanned ones read by text recognition and checked); with
  Georgia's, 504 varieties, 333 linked to their grape cards. Varieties the
  library has no card for (Koshu, Muscat Bailey A, Brazil's Moscato Branco)
  are listed as written.
- **Georgia's grapes from its own documents**: each of the 30 wine
  appellations lists the varieties its Sakpatenti specification allows, as
  written there, 57 of 73 linked to their grape cards (the documents' own
  spellings — Aleksandrouli, Takveri, Kakhuri Mtsvane — matched to the
  library's by hand). Outside the EU the page names the register's own
  document rather than an EU single document.
- **Nineteen more names on the map**: Teliani and Sviri at the coordinates
  their Sakpatenti documents state; Ontario's sub-appellations, which its
  regulation bounds by roads and creeks, at the places it names or the
  village of their name (Niagara Escarpment and West Niagara amid them, and
  St. David's Bench at St. Davids rather than at Niagara-on-the-Lake);
  Sutherland-Karoo, Leipoldtville-Sandveld and Nieuwoudtville at their towns
  (Nieuwoudtville approximately: SAWIS lists it under the Western Cape, the
  map puts the town in the Northern Cape), Karoo-Hoogland with them; and
  Waipara Valley at Waipara. Each place is in `data/kb/appellation-areas.json`
  with its source. Then North Canterbury and Waitaki Valley North Otago
  inside the boundaries IPONZ publishes for them, Darnibole at the Camel
  Valley winery its single document says it adjoins, and Zürichsee at its
  lake, approximately. 8 names remain unplaced, for want of a source that
  places them: Greater Cape, which spans three provinces; four South African
  names the Wine of Origin list gives without places; Patagonia and Valles
  Calchaquíes, whose resolutions name no province; and Valle de Calafia.
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
- **Switzerland, Japan and Moldova in the atlas**: Switzerland's 63 AOCs from
  the federal directory — cantonal, regional and local, each within its
  canton's (Dézaley within Vaud); Japan's five geographical indications for
  wine (Yamanashi, Hokkaido, Yamagata, Osaka, Nagano), on a new map sheet;
  Moldova's three geographical indications (Codru, Ștefan Vodă, Valul lui
  Traian) and four appellations of origin, Tigheci within Valul lui Traian.
  Each links to its source. None has a summary yet.
- **Wine regions no register protects**: the atlas can now hold a wine
  region that is not a protected name, marked as such on its page («Not a
  protected name») and left out of the count of registered names. It enters
  only where an article names it as a wine-growing area, and links that
  article. First, Mexico's: the Valle de Guadalupe (with its own summary in
  the eight languages), San Antonio de las Minas, the San Vicente, Santo
  Tomás, Calafia and Tecate valleys, La Laguna and the Parras Valley. Wines
  whose region reads «Valle de Guadalupe» or «Parras» are now linked to them.
- **Summaries from each country's own Wikipedia**: names outside the EU are
  now described also from articles in their country's language, not only
  English ones titled "<name> wine" — the Vale dos Vinhedos from the
  Portuguese and Spanish Wikipedias, Vaud, Valais, Lavaux and Dézaley from
  the French, Zürichsee from the German, Short Hills Bench from the English
  — each translated faithfully into the eight languages and marked so.
  Lavaux takes its point from its article's item.
- **More names described**: 38 more names beyond the EU have a summary
  from an article chosen by hand — fifteen of Chile's denominations, thirteen
  Australian regions, Cuyo and the DOC Luján de Cuyo, the Okanagan Valley, La
  Côte and Calamin, the Breede River Valley, Swan Creek, the Ancient Lakes of
  Columbia Valley and Codru — and six Brazilian indications one from their
  delimitation in the INPI's list; all in the eight languages.
- **Summaries from official texts**: Japan's five wine indications are
  described by the opening of their product specifications, in the National
  Tax Agency's own English translation, as written, and translated into the
  other languages. The page credits such a summary to the name's official
  text, not to Wikipedia.
- **British Columbia and Uruguay in the atlas**: British Columbia's 22
  geographical indications (section 56 of its Wines of Marked Quality
  Regulation), the Okanagan Valley's thirteen subdivisions within it, with
  the province's summary in the eight languages; and Uruguay, which protects
  no wine region by law, through the four departments where most of its
  vineyards are (Canelones, Montevideo, Colonia, San José), marked as not
  protected names.
- **Georgia in the atlas**: the 31 appellations of origin for wine in
  Sakpatenti's state registry — Khvanchkara, Mukuzani, Tsinandali,
  Kindzmarauli, Kakheti and the rest — and its three wine geographical
  indications (Eniseli, Gremi, Vartsikhe), each with its registration number
  and date and a link to its registered document; nested where the document
  places it (Mukuzani in Kakheti, Tsarapi in Kardenakhi); described by its
  own article or by its document's sentence on the kind of wine, in the eight
  languages. The Europe map sheet now reaches all of Kakheti.
- **Ontario in the atlas**: the 17 viticultural areas of its VQA rules
  (Table 1 of O. Reg. 406/00), from the Niagara Peninsula and Prince Edward
  County to the benches of the Niagara Escarpment, each within the areas the
  table says comprise it (St. David's Bench in both the Niagara Escarpment
  and Niagara-on-the-Lake). Eight benches and shores have no point yet.

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
