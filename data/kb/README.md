# The wine library

Reference knowledge about grapes and the world's registered wine names — the
EU's, and the American Viticultural Areas so far — loaded into D1 (migrations
`0025`–`0030` and `0033`) by
`pnpm kb:load` — and by every deploy, which reloads only when this directory
changes, and then writes only the rows that changed. D1's free plan allows
100,000 written rows a day for the whole database, the application's own
saves included; a load that would write more than 25,000 stops before writing
anything (`--max-writes` to raise it, after 00:00 UTC). Vicenç and the app read it instead of searching the web for general
questions ("what does a Garnacha smell like?").

## Where it comes from

| File                               | Built by                                                                                       | Sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grapes.json`                      | `pnpm kb:fetch-grapes`, `pnpm kb:extract-grapes`, `pnpm kb:build-grapes`                       | Wikidata (names, aliases), Wikipedia (prose)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `terms.json`                       | by hand                                                                                        | The vocabulary aromas and foods are shown in, in eight languages                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `appellations.json`                | `pnpm kb:fetch-appellations`, `pnpm kb:fetch-world-appellations`, `pnpm kb:build-appellations` | eAmbrosia (the EU register), 27 CFR part 9 (eCFR), the UC Davis AVA project, IPONZ's register of geographical indications, the Wine of Origin scheme's production areas (SAWIS), Wine Australia's register and open data, Chile's Decree 464 (Ley Chile), the INV's list and resolutions (Argentina), the UK register (GOV.UK), the IMPI's declarations in the Diario Oficial de la Federación (Mexico), the INPI's lists of recognised indications (Brazil), OpenStreetMap, Wikidata, Wikipedia |
| `za-wine-of-origin.json`           | transcribed by hand                                                                            | The Wine of Origin scheme's list of production areas (SAWIS, February 2026)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `mx-indicaciones-geograficas.json` | transcribed by hand                                                                            | The IMPI's declarations of protection for wine in the Diario Oficial de la Federación (Mexico, March 2025)                                                                                                                                                                                                                                                                                                                                                                                       |
| `br-indicacoes-geograficas.json`   | transcribed by hand                                                                            | The INPI's lists of recognised indications of provenance and denominations of origin (Brazil, September 2026)                                                                                                                                                                                                                                                                                                                                                                                    |
| `topics.json`                      | `pnpm kb:fetch-topics`, `pnpm kb:build-topics` (from `topics-include.json`)                    | Wikidata (names), Wikipedia (explanations)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `grape-images.json`                | `pnpm kb:fetch-grape-images`                                                                   | Wikimedia Commons (photographs, in `apps/web/public/library/grapes/`)                                                                                                                                                                                                                                                                                                                                                                                                                            |

Every structured value carries `evidence`: the sentence of the English
Wikipedia article it was read from. A language model reads the article and
proposes values with quotes; `scripts/kb/grape-validation.ts` keeps a value
only if its quote occurs in the article and says it. The model is the reader,
never the source.

The atlas (`appellations.json`) involves no model at all. Every registered
wine PDO and PGI comes from the EU register itself; Wikidata adds names in
other languages and a point on the map, matched by the register's id or by
name in the same country (Greek and Bulgarian names in Latin letters too),
or by an item labelled with the name and its designation ("Côte-Rôtie AOC"),
or labelled with the name alone and described as a wine ("Marsannay",
"région viticole" — many wine items are filed under no class). Names are
searched in the country's own language too (`pnpm kb:search-appellation-names`,
then fetch again). A few items carrying another wine's name by a stray alias
are excluded by hand. Where the wine's own item has no point, the areas it
lies in give an approximate one (the median of their points, never the
country's). The place the name is named after (same name, same country; not
a building, a station or a river) gives the point instead when Wikidata puts
it inside those areas, or puts them inside it, or it is the one place of
that name and lies within 100 km of them. Where nothing says where the wine
is, the best-known place of the name is taken if it is well known (40
Wikipedia articles or more), or else the searches' first — unless another of
the name, about as well known, lies more than 60 km away and neither lies in
the other: then there is no point rather than a guess. The page says when a
point is approximate; a Wikipedia lead becomes the summary only when it is
about the wine rather than the town it is named for. Where a wine's only
article is in its country's language (Greek, Hungarian, Romanian…), that
lead is the original a faithful translation is made from. A grape is listed under a
registered name only where the grape's own article says it is grown there,
with that sentence — the full list of authorised varieties is in each name's
product specification, linked from the register.

What each name's own single document says of its wines is read from it, with
no model either (`pnpm kb:fetch-register-documents`, then
`scripts/kb/register-facts.ts`): the categories of grapevine product it covers,
by their number in Annex VII, Part II of Regulation (EU) No 1308/2013 (the
number reads the same in every language), and its main grape varieties as the
document writes them, cleaned only of the register's own marks (colour codes,
"(OIV)", asterisks, the Journal's synonyms after a dash). The document is the
technical file the register holds or, where it holds none, the single document
published in the Official Journal, read from the Publications Office's Cellar
in English. A file that cannot be read gives nothing rather than a guess.

A name no Wikipedia article describes takes, as its summary, the opening of
the "link with the geographical area" of its single document, as the Official
Journal publishes it (`pnpm kb:fetch-register-links`, then
`scripts/kb/register-links.ts`): the land, the climate and the people that make
the wine what it is, in the Union's own words. The Journal publishes it in
every official language, translated by the Union itself, so the summary is
taken in English, Spanish, French, Italian, German, Dutch and Portuguese as
published — whole paragraphs, whole sentences, nothing reworded. It is never
put over an article's summary, and the page says where it comes from. These
texts are © European Union, reused under the Commission's reuse notice
(Decision 2011/833/EU), and `data/kb/register-summaries.json` keeps each with
the publication it was read from.

The Journal publishes no Catalan, and now and then leaves out another of the
app's languages. Those are translated by hand from the Journal's own text — the
Spanish where it has one — faithfully and nothing added
(`data/kb/journal-translations.json`, by register id, with the text translated
as `original`), checked like every other translation and marked as such on the
page. A translation is used only while its original is still the text the
library shows.

A name protected before 2011 has no single document in the Journal: the
Union never published or translated it. Its technical file in the register is
the Member State's single document, in the language it was filed in, and the
opening of its link with the geographical area summarises it
(`pnpm kb:extract-technical-file-links`, reading the files
`kb:fetch-register-documents` cached; `data/kb/technical-file-summaries.json`).
The section is found by the form's layout, not its words: the form's labels
are set in Times New Roman, the applicant's text in Arial, and the link is the
seventh section (the eighth in the 2019 form). The text is quoted as the file
has it, typing errors included. Translations into the app's languages are made
from it by hand, checked like every other (`appellation-translations.json`,
with the file as `sourceUrl`), and marked as translations on the page.

A variety is linked to a grape card only where that is certain: by the grape's
own name in one of the library's languages, or by a synonym its sources give —
and then not when the synonym is a family name that opens three or more of the
register's variety names ("Malvasia", "Schiava"), not when a colour in the name
contradicts the grape's ("Sauvignon Gris" is not Sauvignon blanc, "Greco Nero"
not Greco), not when the grape is listed in the same document under its own
name, and not for the synonyms `build-appellations.ts` lists as naming a
variety of their own ("Aglianicone", "Trebbiano Giallo", "Moreto"…). An
unlinked variety is shown as the register writes it.

## Beyond the EU

The EU register holds only the few names other countries have protected
there, so each country's names come from its own official register
(`pnpm kb:fetch-world-appellations`, then the build), with no model either.

**United States.** Every American Viticultural Area is a section of the Code
of Federal Regulations, 27 CFR part 9, subpart C, read from eCFR as of its
latest issue: the name is the one its paragraph (a) gives, with the words it
must be qualified by ("Solano County Green Valley"). The UC Davis AVA project
has drawn each official boundary; it gives the states the area lies in, the
date it was established, and a point inside its boundary — exact, unlike the
EU names' approximate points (`pointSource: "boundary"`). The few areas not
yet drawn take their Wikidata item's point. Wikidata items are matched by
name among those filed as AVAs, or by the English article titled
"<name> AVA"; a name two items share links neither. The summary is the
article's lead, as for EU names; an AVA's rule draws its area and names no
grapes, so its grapes are only those their own articles place there. An AVA
has no eAmbrosia id: its id in the library is `us-` and its name, and
`registerRef` is its section ("27 CFR 9.23"), linked on eCFR.

The AVAs an AVA lies within, as UC Davis records them, become its `within`
(the nearest first).

**New Zealand.** The geographical indications registered for wine in the
register IPONZ keeps under the Geographical Indications (Wine and Spirits)
Registration Act 2006, read from the register's own export: the three the
Act registered itself (New Zealand, North Island, South Island) and those
registered since. Only facts are taken — each name, its IP number
(`registerRef`), its date of registration and its page in the register,
which each name links to — since the register's Crown copyright licence
does not extend to the registers. A name's summary is the lead of the
English article titled for its wine ("Marlborough wine region"), never the
town's or the region's; its point is OpenStreetMap's for the place or area
of that name, in the region the register gives — approximate
(`pointSource: "place"`).

**South Africa.** The production areas of the Wine of Origin scheme, as the
list SAWIS publishes for the Wine and Spirit Board names them (February
2026), transcribed by hand into `za-wine-of-origin.json`: each area's names
as the list writes them (English, then Afrikaans), its kind
(`registerLevel`: geographical unit, region, district, ward…) and the areas
the list places it in, from which each gets its `within`. The list gives no
dates. Points are OpenStreetMap's for the place of each name, in its
province, and a ward's near its district's; an area with no point of its own
takes the middle of the areas inside it, or else the point of the area it
lies in (`pointSource: "area"`), never a whole province's. Summaries only
where an English article is titled for the area's wine ("Western Cape
wine"), or is the district's own (Breedekloof's, read by hand).

**Australia.** The geographical indications of the Register of Protected
GIs and Other Terms, as Wine Australia lists them: the country, South
Eastern Australia, the states and territories, the Adelaide super zone, and
every zone, region and subregion. Each one's date is the one its own page in
the register gives for its entry ("entered in the Register of Protected
Names on 15 August 1997"; one page's "Octoer" is read as October). Wine
Australia's open data draws the zones, regions and subregions (CC BY 4.0, ©
Wine Australia) and gives each its kind (`registerLevel`) and GI number
(`registerRef`); the point is inside that boundary (`pointSource:
"boundary"`). The states and the country are placed by OpenStreetMap; the
super zone and South Eastern Australia at the middle of what they hold. Each
name lies within the one the register lists it under (`within`): a
subregion its region, a region its zone — Murray Darling and Swan Hill both
zones they are listed under — a zone its state, and the Adelaide super zone
the three zones its entry names. Summaries are the leads of the English
articles titled for the name's wine ("Barossa Valley wine region", "Fleurieu
zone", "Margaret River (wine region)"), and of the states' wine articles
("South Australian wine"), never a town's.

**Chile.** The viticultural zoning of Decree 464 of 1994 (Ministry of
Agriculture), as Ley Chile consolidates it (version of 14 July 2026),
transcribed by hand from its article 1 into `cl-zonificacion-viticola.json`:
the six viticultural regions, their subregions, zones and areas, and Rapa
Nui – Isla de Pascua; each with the units it is in (`within`), its kind
(`registerLevel`: region, subregion, zone, area) and the communes, provinces
or rural locality the decree defines its boundary by. The names a label may
carry, as the decree's own table writes them ("Región de Atacama", "Valle
de Huasco", "Valle del Bio Bio"), are kept as other names. Each is placed at
the middle of the communes or provinces that define it, as OpenStreetMap
places them inside the administrative regions the decree names — a region
at the middle of its subregions — approximately (`pointSource: "area"`).
Summaries from the English articles about the area's wine, read by hand
("Central Valley (Chilean wine region)", "Maule Valley") — the articles
titled for the other valleys lead to their province or river — and from the
articles of Wikidata's items for Chile's wine regions and designations of
origin, matched by their Spanish label ("Valle del Cachapoal (vino)"), whose
labels in other languages ("Colchagua Valley") are kept as other names. The
decree allows no translation of a name; "Maipo Valley", as export labels
write it, is read as "Valle del Maipo" when a wine's region or a grape's
article is linked — a reading, not a name the register gives.

**Argentina.** The geographical indications (IG) and controlled
denominations of origin (DOC) the Instituto Nacional de Vitivinicultura
has recognised under Law 25.163, transcribed by hand into
`ar-indicaciones-geograficas.json`: from the INV's own list (revised April 2022) — each name as it writes it, its kind, department and province, the
resolutions that recognised it and the English names it gives ("Uco
Valley") — and, for the names recognised since, from each one's resolution
in the Boletín Oficial, found among the norms argentina.gob.ar lists as
complementing the law, with its date of publication. Resolution C.32/2002
(14 November 2002) recognised the areas of its Annex I, each under its
province's indication, and C.37/2002 (16 December 2002) the regional ones;
those are the dates shown where no other is known. A name lies within its
province's indication, within the one named after the department the list
or its resolution places it in (Agrelo in Luján de Cuyo), and within the
regions the list says comprise it (Cuyo: Mendoza, San Juan and La Rioja;
Valle de Uco: San Carlos, Tunuyán and Tupungato). Points are
OpenStreetMap's for the department or place of each name in its province —
a small one near its department's — approximately.

**Mexico.** The declarations of protection for wine the Instituto
Mexicano de la Propiedad Industrial has published in the Diario Oficial de
la Federación, transcribed by hand into `mx-indicaciones-geograficas.json`:
each name as the declaration writes it, its kind ("Indicación Geográfica
Protegida", I.G.P.) and its zone. On 16 October 2026 there was one, "Vinos
de la Región Vitivinícola de Querétaro" (DOF, 10 March 2025), whose zone is
the state of Querétaro; none for Baja California, the Valle de Guadalupe or
Parras. Its point is OpenStreetMap's for the state, approximately. A wine
whose region reads "Querétaro" is read as that indication — a reading, not
a name the declaration gives.

**Brazil.** The indications of provenance (IP) and denominations of origin
(DO) for wine the Instituto Nacional da Propriedade Industrial has
recognised, transcribed by hand into `br-indicacoes-geograficas.json` from
its two lists (IPs up to 29 September 2026, DOs up to 23 June 2026): each
geographical name as the list writes it, its kind and number, its product,
its date and the municipalities its delimitation names. Vale dos Vinhedos
is in both lists, an IP since 2002 and a DO since 2012; Vales da Uva
Goethe became a DO in 2025, the date shown. Points are OpenStreetMap's for
the place of each name in its state, or else the middle of the
municipalities its delimitation names — approximately.

**Registers transcribed by hand** (`registers/`, one file a country, read by
`pnpm kb:fetch-registers`): each name as its official list writes it, its
kind, number and date, and the places its delimitation names; placed where
OpenStreetMap has its place, or amid those places, or else at the area it
lies in — approximately. Each file says where it comes from and what it
leaves out:

- `ch.json` — Switzerland: the 63 cantonal, regional and local AOCs of the
  federal directory (OFAG, 1 January 2026).
- `jp.json` — Japan: the five geographical indications for wine of the
  National Tax Agency's list (Yamanashi, Hokkaido, Yamagata, Osaka, Nagano).
- `md.json` — Moldova: the three protected geographical indications and the
  four appellations of origin for wine that AGEPI's register showed (it
  counts more appellations than its list could show).

**United Kingdom.** The UK's own wine names in its register of protected
food and drink names on GOV.UK (Open Government Licence v3.0), registered
ones only: their designation (PDO or PGI) and the date the register gives.

The small map draws a country on its sheet: Europe's, North or South
America's (from 6° S, for the Vale do São Francisco), Japan's, Oceania's or southern Africa's (`pnpm kb:build-map`, all from Natural
Earth).

## Keeping the registers current

Registers change: eCFR adds AVAs, the INV recognises new indications, IPONZ,
Wine Australia and the UK register names, the EU registers and amends them.
Every few months, or when a register announces a name:

1. `pnpm kb:fetch-appellations` — the EU register, and Wikidata's items for
   it. Wikipedia leads already fetched are kept; only new items are asked.
2. `pnpm kb:fetch-world-appellations` — the registers beyond the EU.
3. For EU names registered since: `pnpm kb:fetch-register-links` (the
   Journal's single documents; EUR-Lex may answer with a challenge page, and
   is then left alone, never worked around), `pnpm kb:fetch-register-documents`
   and `pnpm kb:extract-technical-file-links`.
4. `pnpm kb:build-appellations` and `pnpm kb:build-map`.
5. `pnpm kb:diff-appellations` — by country, the names added or dropped and
   those whose summary, point, Wikidata item or grapes changed. A dropped
   name, a new item and a moved point are checked by hand; an item that is
   another wine's goes in `scripts/kb/appellation-exclusions.ts`.
6. `pnpm check`. `scripts/kb/translations.test.ts` names every translation
   whose original is no longer the text shown: remove it, translate the new
   text faithfully, and fill the languages a new summary lacks.
7. Deploy: the library load writes only what changed.

## Licences

- **Wikidata** names and aliases: CC0 1.0.
- **Wikipedia** summaries and quoted sentences: CC BY-SA 4.0. Each summary
  and each grape records the article it came from (`url`, `wikipediaUrl`);
  the app shows that link next to the text. Text derived from these articles
  is shared under the same licence.

- **27 CFR part 9** (eCFR): a work of the US government, public domain.
- **UC Davis AVA project** boundaries
  (https://github.com/UCDavisLibrary/ava): CC0 1.0; credited under the map.
- **Wine Australia's** GI boundaries, kinds and numbers: CC BY 4.0, ©
  Wine Australia; credited under the map. The register's pages give only
  facts here: names and dates.
- **The INV's list and resolutions** (Argentina): official texts; only
  their facts are taken, and each name links to the list.
- **The UK register of protected food and drink names** (GOV.UK): Open
  Government Licence v3.0.
- **The INPI's lists of recognised geographical indications** (Brazil):
  official acts have no copyright in Brazil (Lei 9.610/1998, art. 8, IV);
  only their facts are taken, and each name links to its list.
- **The registers transcribed by hand** (`registers/`): the Swiss federal
  directory of AOCs, Japan's National Tax Agency list and Moldova's AGEPI
  register — only their facts are taken (names, kinds, numbers, dates and
  places), and each name links to its source.
- **The IMPI's declarations in the Diario Oficial de la Federación**
  (Mexico): legislative, regulatory and administrative texts have no
  copyright in Mexico (Ley Federal del Derecho de Autor, art. 14, fr. VIII);
  only their facts are taken, and each name links to its declaration.
- **Chile's Decree 464 of 1994**, read on Ley Chile (Biblioteca del Congreso
  Nacional): only its facts are taken — names, kinds, nesting and the units
  that define each — and each name links to the decree.
- **IPONZ's register of geographical indications**: Crown copyright; only
  facts are taken from it (names, IP numbers, dates), and each name links to
  its page there.
- **The Wine of Origin scheme's production areas** (SAWIS, for the Wine and
  Spirit Board): official texts of a legislative nature have no copyright in
  South Africa (Copyright Act 98 of 1978, s 12(8)(a)).
- **OpenStreetMap** points (Nominatim): © OpenStreetMap contributors, ODbL
  1.0; credited under the map.

- **eAmbrosia** register data: © European Union, reused under the
  Commission's reuse notice (Decision 2011/833/EU). Each entry links back to
  its page in the register.

- **Wikimedia Commons** photographs: each under its own free licence (public
  domain, CC0, CC BY or CC BY-SA), recorded with its author and source in
  `grape-images.json` and credited under the photograph in the app. The
  release scan refuses any picture in that folder without its record.
- **eAmbrosia technical files** (`pnpm kb:fetch-appellation-areas`): the
  single document each registered name was filed with names the NUTS regions
  of its demarcated area. A place of the wine's name is taken only inside
  them (Naoussa in Imathia, not on Paros), OpenStreetMap's points are checked
  against them, and where nothing else places a name, their own point gives
  an approximate one. Same reuse notice as the register.
- **The register's own places** (`appellation-areas.json`, read by hand):
  for names whose technical file gives no NUTS region, or that were
  registered later, the municipalities and villages their demarcated area
  names (in the technical file, or the single document in the Official
  Journal), each with its Wikidata item; the point is their median. A name
  made of others ("Zapadna kontinentalna Hrvatska") takes the median of theirs.
- **Eurostat GISCO NUTS regions** (outlines and label points, every edition
  since 2003, read in the edition whose name matches the technical file's):
  © EuroGeographics for the administrative boundaries.
- **OpenStreetMap** (via its Nominatim geocoder, `pnpm kb:geocode-appellations`):
  approximate points for registered names Wikidata could not place, taken
  only on an exact name match in the same country. © OpenStreetMap
  contributors, ODbL; credited under the map.
- **VIVC photographs on Commons** (some grapes): © Doris Schneider, Ursula
  Brühl, Julius Kühn-Institut (JKI), www.vivc.de, CC BY-SA 4.0.
- **Natural Earth** country outlines (the library's map,
  `apps/web/src/library/europe-map.json`, built by `pnpm kb:build-map`):
  public domain.

Since October 2026 the grapes' structure, aromas, regions, pairings, berry
colour and the kinds of wine they make were
also read in a working session with Claude, under the same rules and the same
check: every value with its verbatim quote, kept only if `grape-validation.ts`
finds the quote in the article and the quote says it.

Where a grape's English article says nothing of its wine, its article in its
own language (Spanish, Catalan, French, Italian, Portuguese or German) was
read the same way: the check knows how levels are stated in those languages,
an aroma is given as the library's term with the article's own word for it,
and each fact keeps the article it came from, which the card links.

Georgia's grapes were read in Russian, the language their best articles are
in, the same way: a place is given by its English name with the article's own
word for it ("Kakheti" for "Кахетии"). A grape no English Wikipedia covers at
all (Kisi, Ojaleshi, Goruli Mtsvane) is read only from that article; its card
links it, and its summary is a faithful translation of the article's lead
(`grape-translations.json`), marked as a translation on the page. The same
file gives a Spanish summary to every grape Spanish Wikipedia has no article
for, translated from the English lead the card shows.

A few registered names with no article of their own (Greek, Bulgarian,
Romanian, Slovenian) take their summary from one whole sentence of their
country's wine article on English Wikipedia — only a sentence that names them,
describes the wine, and carries no figures or lists. Alsace's grand crus take
the coordinates of their vineyards from French Wikipedia's article on them.

Where a style or method has a wine-specific article in one language only
(sulphites: French and German), the other languages carry a faithful
translation of it (`topic-translations.json`), marked as such on the page.

The styles and methods (`topics.json`) are articles chosen by hand in
`topics-include.json`; their explanations are each article's lead, in every
language Wikipedia has it, and no model is involved.

What a grape goes with, beyond what its own article says, comes from the
application's pairing rules, not from this directory: each rule, each grape
placed in a wine style and each classic pairing quotes an open source
(`docs/pairing-rules.md`, checked by `pnpm kb:check-pairing-sources`).

Nothing here is copied from commercial wine references.
