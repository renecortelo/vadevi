# The wine library

Reference knowledge about grapes and the world's registered wine names — the
EU's, and those of each other country's own register: 2,621 names in 35
countries as of October 2026 — loaded into D1 (the `wine_library` migrations,
`0025`–`0043`) by
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
| `article-items.json`               | chosen by hand                                                                                 | Wikipedia articles for names beyond the EU that no title rule reached, each opening on the name as a wine region or appellation (`pnpm kb:fetch-article-items`)                                                                                                                                                                                                                                                                                                                                  |
| `region-grape-sentences.json`      | read by hand                                                                                   | Grapes a region's own Wikipedia article names as grown or made there, for names no register lists varieties for; each quote is checked against the cached article                                                                                                                                                                                                                                                                                                                                |
| `mx-indicaciones-geograficas.json` | transcribed by hand                                                                            | The IMPI's declarations of protection for wine in the Diario Oficial de la Federación (Mexico, March 2025)                                                                                                                                                                                                                                                                                                                                                                                       |
| `topics.json`                      | `pnpm kb:fetch-topics`, `pnpm kb:build-topics` (from `topics-include.json`)                    | Wikidata (names), Wikipedia (explanations)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `grape-images.json`                | `pnpm kb:fetch-grape-images`                                                                   | Wikimedia Commons (photographs, in `apps/web/public/library/grapes/`)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `wineries.json`                    | `pnpm kb:fetch-wineries`                                                                       | Wikidata (CC0): wineries, champagne houses, wine companies and firms whose product is wine — name, country and point — that the producer field suggests as the reader types (1,897; only suggested, any producer can be typed)                                                                                                                                                                                                                                                                   |
| `wineries-osm.json`                | `pnpm kb:fetch-osm-wineries`                                                                   | OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0): every place mapped as a winery (`craft=winery`) with a name, country by country — name, country and point; not restaurants, bars or shops that also carry the tag. `pnpm kb:build-wineries` joins it to `wineries.json` (without the names Wikidata already gives) into `apps/web/public/library/wineries.json`, the static list the producer field fetches once and searches in the browser                                             |
| `topic-images.json`                | `pnpm kb:fetch-topic-images`                                                                   | Wikimedia Commons (each picture under its own free licence, credited on its page), chosen by each style's Wikidata item (P18) — or by hand on Commons where it gives none — and looked at by eye                                                                                                                                                                                                                                                                                                 |
| `grape-readings.json`              | read by hand                                                                                   | A grape's levels, sweetness, aromas, pairings and origin from its articles in any language (`pnpm kb:fetch-grape-articles`, `--every` for all of them) or a public-domain book, each with its quote, checked by the grape build                                                                                                                                                                                                                                                                  |
| `grape-names.json`                 | given by hand                                                                                  | A grape's name in an app language Wikidata has no label in (an international name, a proper name)                                                                                                                                                                                                                                                                                                                                                                                                |
| `place-sentences.json`             | chosen by hand                                                                                 | One sentence on a name's wine from the Wikipedia article of its place, for names no article of their own describes                                                                                                                                                                                                                                                                                                                                                                               |
| `region-climate.json`              | `pnpm kb:fetch-climate`, `pnpm kb:fetch-elevation`                                             | CHELSA V2.1, Copernicus DEM GLO-90 (see «Climate, planted area and production»)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `region-soil.json`                 | `pnpm kb:fetch-soil`                                                                           | ISRIC SoilGrids 2.0 (CC BY 4.0): clay, silt, sand, pH and organic carbon in the top 30 cm at each name's point                                                                                                                                                                                                                                                                                                                                                                                   |
| `region-figures.json`              | `pnpm kb:fetch-region-figures`                                                                 | Area and production from the infobox of a name's Wikipedia articles                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `*-figures.json`, `adelaide.json`  | transcribed by hand, or read from the publisher's files                                        | Official statistics on vineyard area and production, and the University of Adelaide's areas by region and variety (see «Licences»)                                                                                                                                                                                                                                                                                                                                                               |
| `registers/`                       | transcribed by hand                                                                            | The registers of Switzerland, Canada, Japan, Moldova, Georgia, Brazil and the regions of Mexico and Uruguay (see «Registers transcribed by hand»)                                                                                                                                                                                                                                                                                                                                                |

`pnpm kb:score` measures how complete the library is: the mean of seventeen
fields' coverage (ten for grapes, seven for registered names), with each
field's gaps by cause — awaiting a publisher's permission, a permission not
asked for yet, a licence declined, or no open source found — and the score
the permissions would give.

Every structured value carries `evidence`: the sentence it was read from — of
the grape's English Wikipedia article, of its article in another language,
of a public-domain book or of an open-access article under CC BY (see
«Licences»), whose text is cached beside the books — or, for an origin no text
gives, the row of the University of Adelaide's table. A language model, or a
reader by hand, proposes values with quotes; `scripts/kb/grape-validation.ts`
keeps a value only if its quote occurs in the text and says it. The model is
the reader, never the source.

Where no sentence speaks of the variety everywhere, a value may be read from
what one place's wine is, and the card says so beside it («Said of the wine
of Tokaj», linked to that name's card): the wine of a DOC made of the grape
alone or nearly so (its register lists that one grape, or its specification asks 85 % or more), as its specification describes it — the
«caratteristiche organolettiche» and «abbinamenti» its Italian article copies
from the disciplinare, or a Spanish name's own specification (pliego de
condiciones) as Spain's Ministry publishes it, reusable citing the source
(the Godello of Valdeorras) — or the varietal wine of the region where nearly all
of the grape grows (Furmint and Hárslevelű in Tokaj, from Wikivoyage). The
reading names the place and its atlas entry (`scope` in
`grape-readings.json`; `place`, `placeId` in the evidence), the build refuses
an atlas entry that does not exist, and `pnpm kb:score` counts these values
like the rest and shows how many there are. A DOC whose grape shares a name
with another (Trebbiano d'Abruzzo, Vernaccia di Oristano) is not used for it.

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
registered name only where a source says it is grown or allowed there, with
that source's words: the register's single document (the main varieties, see
below), a canton's wine law, the grape's own article or the name's, the
grapes line of the name's infobox, or the University of Adelaide's areas by
region and variety — the full list of authorised varieties is in each name's
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
recognised, transcribed by hand into `registers/br.json` from
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

- `br.json` — Brazil: the INPI's indications of provenance and
  denominations of origin for wine (see Brazil above).
- `ca.json` — Canada, Ontario: the 17 viticultural areas of Table 1 of
  O. Reg. 406/00 (VQA), nested where the table says one comprises others.
- `mx-regions.json` — Mexico's wine regions that no register protects (the
  Valle de Guadalupe, the Parras Valley…), each named as a wine-growing area
  by a sentence of Wikipedia's articles on Mexican wine; marked in the app as
  not protected names (`WR`), and left out of the count of registered names.
- `ca-bc.json` — Canada, British Columbia: the 22 geographical indications
  of section 56 of its Wines of Marked Quality Regulation, the Okanagan
  Valley's subdivisions within it.
- `uy-regions.json` — Uruguay, which has no register of wine regions: the
  four departments Wikipedia's article names as where most of its vineyards
  are, as wine regions no register protects.
- `ch.json` — Switzerland: the 63 cantonal, regional and local AOCs of the
  federal directory (OFAG, 1 January 2026).
- `ge.json` — Georgia: the 31 appellations of origin for wine in
  Sakpatenti's state registry (each registered document read for its
  product) and its three recognised wine geographical indications; summaries
  from their own articles or, failing one, from their document's sentence on
  the kind of wine (`GE-official-text`).
- `jp.json` — Japan: the five geographical indications for wine of the
  National Tax Agency's list (Yamanashi, Hokkaido, Yamagata, Osaka, Nagano),
  each summarised by the opening of its product specification's account of
  the wine (the Agency's English translation; notices of the State have no
  copyright in Japan), marked `JP-official-text`.
- `md.json` — Moldova: the three protected geographical indications and the
  four appellations of origin for wine that AGEPI's register showed (it
  counts more appellations than its list could show).

**United Kingdom.** The UK's own wine names in its register of protected
food and drink names on GOV.UK (Open Government Licence v3.0), registered
ones only: their designation (PDO or PGI) and the date the register gives.

The small map draws a country on its sheet: Europe's, North or South
America's (from 6° S, for the Vale do São Francisco), Japan's, Oceania's or southern Africa's (`pnpm kb:build-map`, all from Natural
Earth).

## Facts from pages that are not openly licensed

Where no open source says it, a grape's fact may come from a page whose
rights are reserved — an interprofessional body's, or the grape's
single-variety wines as their own producers describe them — under the
operator's rule of the fact alone (24 October 2026). The library keeps the
value and the link and names who says it; it never shows the page's
sentence. A page whose terms forbid automated access, extraction, building a
database or reusing its data is not used at all (Wine Folly, VinoVoss, the
German Wine Institute's «private, non-commercial» copies), nor are rating or
shop sites; a site that refuses scripts goes on the operator's list to read
by hand.

- **A page about the grape itself** (the Georgian Wine Association's
  «Grape varieties», the Italian ministry's register of vine varieties):
  one is enough, as an article is.
- **The grape's own wines**: a fact a producer states of its wine made of
  that grape alone («100 % Grillo», «in purezza», «monovarietal») is about
  that wine, not the grape, so it stands only when **three producers or
  more** say the same of theirs. Each counts once however many sites carry
  its sheet (its own, an importer's); a shop's tasting note is not the
  producer's and does not count. The card says «according to the wines of
  three producers» and lists each wine, linked. A sheet's label line naming
  one grape alone («Rebsorte: Silvaner», «Varietal: Lagrein») counts as the
  wine being that grape. A sentence that rules a dish out («con esclusione
  della selvaggina») gives no pairing, and a name more than one variety
  goes by (Trebbiano, Arvine) proves nothing.
- **Alcohol from the sheets' figures** (the operator's decision of 26
  October 2026): a sheet gives the alcohol as a number («13,5 % vol»), not
  a word, so the build turns each into a level on WSET's scale (Level 3,
  Systematic Approach to Tasting: low below 11 %, medium to 13.9 %, high
  from 14 %). Only still, dry wines count — a page whose title or address
  says sparkling, rosé, semi-dry, sweet or fortified does not, nor one that
  gives two figures — and every producer's figure is listed, those that
  disagree too: the level stands when three producers and two thirds of
  them reach it (Pinot Noir: 93 medium, 16 high, 1 low → medium). The card
  says «from the alcohol of the wines of N producers (WSET scale)» and
  shows each wine's figure.
- **Sweetness across producers**: «dry» stands only where the grape's other
  single-variety wines do not say otherwise; where three producers make it
  dry and three others semi-dry (Blauer Portugieser «trocken» and
  «halbtrocken», «lieblich»), the fact is the range, each end on three
  producers' wines.
- **Dry or sweet from the sheets' residual sugar** (the operator's decision
  of 28 October 2026): a sheet's «zucchero residuo 1,5 g/l» is turned into
  the term the EU's labelling rules define for it (Regulation (EU) 2019/33,
  Annex III, Part B): dry up to 4 g/l, semi-dry («medium dry», «medium») to
  45, sweet above. Between 4 and 9 g/l a wine is dry only if its acidity is
  high enough, which a sheet rarely says, so it gets no level and counts
  against any; an upper bound («< 1,5 g/l») is read only when it is dry's.
  Sparkling and rosé pages are left out, as for alcohol. A level, or a range
  of two, stands when three producers reach each end and two thirds of all
  those listed fall within it. Red wines rarely write «dry» on their sheets
  but often give the figure (Garnacha: five producers, 0.2–3 g/l). The card
  says «from the residual sugar of the wines of N producers (EU terms)» and
  shows each wine's grams a litre.
- **Aromas** from the producers' tasting notes («al naso…», «on the nose…»)
  in the library's aroma words: each aroma on three producers' wines, only
  for a grape no other source gives aromas for (Falanghina: citrus, peach,
  pineapple, floral). «Rosé», the wine, is not «rose», the flower; an aroma
  named after the grape (Muscat's «musk») proves nothing.
- **A body's page about one place's wine** — a single-variety DOC's — may
  carry its place (`scope`), labelled on the card as a hand reading's is.

The readings are in `data/kb/web-readings.json`, which stays in the private
repository: each sentence is checked word for word against our copy of its
page (`.kb-cache/web/`), exactly as an article's is, and only the fact
reaches `grapes.json`. `KB_WEB=0 pnpm kb:build-grapes` builds the library
without any of them, and `pnpm kb:score` says how many fields they fill.

The producers' pages were found by visiting, politely (`robots.txt`
honoured, one request every two seconds per site, technical-sheet PDFs
within the operator's grant of 400), the official websites Wikidata lists
for wineries (P856), those OpenStreetMap lists for its `craft=winery`
places (only the address is used, to visit the site; nothing of
OpenStreetMap's data enters the library), a hand list of producer groups
and importers, and targeted searches. The tools stay outside the
repository; each page is cached under `.kb-cache/web/`.

## Climate, planted area and production

Each name's card shows the climate at its point on the map and, where a
source gives them, its vineyards' size and production: an official
statistic first (Spain's Ministry, France's customs, Argentina's INV,
Destatis, Statistik Austria, the KSH, ARTEA, Lombardy, Umbria, the Federal
Register, Switzerland's BLW, Statistics Portugal), then its Wikipedia
article's infobox or text, then the University of Adelaide's areas, then the
Australian Bureau of Statistics' for Australian names still without one —
each credited as «Licences» says. Last, where none of them gives a figure,
the appellation's own body may (a consorzio, a regulatory council, an
interprofession), on a page that is not openly licensed, under the
operator's rule of the fact alone: `data/kb/web-region-figures.json`
(private; the public mirror leaves it out) holds the sentence, checked word
for word against our copy of the page and holding the figure, and the card
shows the figure and who gives it, linked, never the sentence (Roero and
Lugana from their consorzi, Nemea from Wines of Greece). A body's figure
never replaces an official one: where they differ (Friuli Grave's consorzio
gives «circa 300.000 hl», the official source 73,800) the official stays. A
body that gives acres (Wine Growers British Columbia, VQA Ontario) has its
figure marked `acres`: the build converts it to hectares and keeps the acres,
and the card says «≈ … ha, converted from acres». A body that counts production as tonnes of grapes harvested (New Zealand Winegrowers' Annual Report 2026, «By region (tonnes)», from its vintage survey; the country as its «Industry total») has its figure marked `tonnes`: the card and Vicenç give it in tonnes of grapes, never converted to hectolitres of wine.

A name with no grapes from any source above may take them from its own
body's page, under the same rule (`data/kb/web-region-grapes.json`, private):
the list or sentence, checked against our copy of the page and naming each
grape by one of its names in the library, and the card lists the grapes with
who gives them, linked (`kb_region_grapes.publisher`, `0048`), never the
sentence. Wine Growers British Columbia's «Varietals» of each sub-region,
VQA Ontario's «Common Varieties» of each appellation, and sentences from Wines
of South Africa, Wine Australia and New Zealand Winegrowers that say a grape
is grown or known there — not that a place is «ideal for» or «promising for»
it, and not a bare «Cabernet», which names no one grape.

- `pnpm kb:fetch-climate` reads the monthly mean temperature and
  precipitation, 1981–2010, at every point from CHELSA V2.1 — only the rows
  of its GeoTIFFs the points fall on, by byte range — into
  `region-climate.json`, with the point each was read at. The atlas build
  works out the Köppen–Geiger class (Peel et al. 2007, with Beck et al.'s
  0 °C line), the yearly rain, the mean temperature and Winkler's degree days
  and region (April–October north, October–April south), and attaches them
  only while the name's point is the one read: run it again after points
  move. One point stands for the whole name, so for a large area the card
  calls it a guide.
- `pnpm kb:fetch-region-figures` reads the infobox of the Wikipedia articles
  that already describe each name (English, French, Spanish, German): the
  planted area in hectares and the production in hectolitres, with the line
  each came from and its year where the article gives one. Only a wine
  region's infobox counts, and only a figure with its unit. A figure in
  acres is converted and marked as such.
- `pnpm kb:fetch-elevation` reads the elevation at every point (Copernicus
  DEM GLO-90, through Open-Meteo) into `region-climate.json`.
- `pnpm kb:fetch-soil` reads the soil at every point from ISRIC's SoilGrids
  2.0 REST API — clay, silt and sand, pH in water and organic carbon in the
  0–5, 5–15 and 15–30 cm layers, averaged by thickness — one point a request,
  twelve seconds apart as ISRIC asks (some nine hours; each answer cached in
  `.kb-cache/soil/`, so a stopped run picks up where it left), into
  `region-soil.json`. A point in a town or on water has no soil in SoilGrids
  (Rioja's falls in Logroño): the nearest point one or two kilometres away
  that has is read instead, and its distance kept (`nearKm`), which the card
  and Vicenç say. The atlas build attaches it with the climate read at the
  same point; the card shows it with a note that one point is a guide.
- `pnpm kb:fetch-region-articles` caches the full articles of each name
  (`--every`: in every language Wikidata links), which the figures and grape
  sentences read by hand are checked against.

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

The figures follow their publishers' calendars: Spain's Ministry publishes
each campaign's PDO report the following year, France's customs and the INV
their harvest and area reports in spring, Destatis its production in March;
the University of Adelaide revises its database every few years
(`pnpm kb:read-adelaide` after downloading its files again). A new report
is transcribed into its file, the atlas rebuilt, and `pnpm kb:score` read
for what moved.

## Licences

- **Wikidata** names and aliases: CC0 1.0.
- **Wikipedia** summaries and quoted sentences: CC BY-SA 4.0. Each summary
  and each grape records the article it came from (`url`, `wikipediaUrl`);
  the app shows that link next to the text. Text derived from these articles
  is shared under the same licence.

- **CHELSA V2.1** climatologies (Karger et al. 2017, _Scientific Data_ 4,
  170122; data: Karger et al. 2021, EnviDat, doi:10.16904/envidat.228):
  CC0 1.0. The card credits it under the climate. WorldClim was not used:
  its terms allow no redistribution without permission.

- **Spain's Ministry of Agriculture (MAPA)**, «Datos de las Denominaciones de
  Origen Protegidas de Vinos, Campaña 2023/2024» (`es-dop-figures.json`):
  public-sector information, reusable citing the source (Ley 37/2007, RD
  1495/2011); each PDO's registered area is shown with the campaign and a
  link to the report.

- **French customs (DGDDI)**, «Superficies et volumes en production par
  produit», 2024 harvest declarations (`fr-aop-figures.json`): Licence
  Ouverte / Etalab 2.0; each PDO's area and volume are shown with the year
  and a link to the file.

- **Statistik Austria**, «Weingartenflächen nach Weinbauregionen 2020»
  (`at-weinbau-figures.json`): reproduction for commercial and non-commercial
  purposes allowed with «STATISTIK AUSTRIA» named and a note that the content
  is an extract; each region, area and state shows its vineyard area so
  credited, with the year and a link. Its «Weinernte und Weinbestand 2025»
  (table 5) gives the wine harvested in 2025 in 20 regions and states, each
  row checked by its area and yield and against its state's total; Leithaberg
  and Rosalia, which share a row, take none.

- **The University of Adelaide**, «Database of Regional, National and Global
  Winegrape Bearing Areas by Variety, 2000 to 2023» (K. Anderson, S. Nelgen
  and G. Puga, Wine Economics Research Centre, December 2025, revised March
  2026; CC BY 4.0, https://doi.org/10.25909/32870405.v1), read from its
  files in `.kb-cache/adelaide/` by `pnpm kb:read-adelaide` into
  `adelaide.json`. Changed, as the licence asks to say: its rows summed by
  region and by library grape. A name that is one of its regions — an
  Australian or New Zealand GI, a Slovenian or Czech district, a Portuguese
  region, a Japanese prefecture, a Swiss canton (by its code), an Argentine
  department (by the INV's province and department, never the name alone)
  — takes the region's bearing area where nothing else gives one, and the
  library's grapes covering at least 2 % of it (the twelve largest) where
  the register lists none, beside any an article names. South Africa's units are SAWIS's statistical
  regions, not the Wine of Origin districts: grapes only. A grape no
  article gives an origin for takes the country its table gives the prime
  variety, unless the sources the library reads dispute it (Albariño,
  Loureiro, Graševina, Kadarka, Muscat of Alexandria, Gouais, Savagnin) or
  the prime is another grape (Vernaccia). Compared with the origins the
  library already quotes it agrees on 156 of 176; where it differs, the
  quoted one stays. The database calls itself a beta and may hold errors.

- **The US Federal Register** (`us-ava-figures.json`): for American
  Viticultural Areas with no area from Wikipedia, the acres of vineyards the
  rule that established each one states, read by hand from the rule as
  govinfo.gov serves it (`pnpm kb:fetch-ava-rules`, rules from 1994 on). Works
  of the US federal government, in the public domain in the United States;
  each AVA shows the area with the rule's year, its sentence and a link.

- **Hungary's Central Statistical Office (KSH)**, «Szőlőültetvények, 2020»,
  table 1 (`hu-borvidek-figures.json`): CC BY 4.0, credited «Forrás: KSH»
  (www.ksh.hu/copyright); each of the 22 wine regions' vineyard area in 2020,
  on the protected name that bears the region's name, with the year and a
  link to the table.

- **The University of California's «Report of the viticultural work»**
  (1885–1896, E. W. Hilgard and others; US public domain): the same way, for
  a variety's wine described as such («The Ploussard yields a wine of very
  light tint and body, with little tannin»), never a single sample's.

- **P. P. Demaria and C. Leardi, «Ampelografia della provincia di
  Alessandria»** (1875; public domain): the Internet Archive's text
  (`ampelografiadel00leargoog`), read the same way. A sentence is used only
  where the articles do not contradict it: its «poco tannino» for Dolcetto
  is not, as they call the grape tannic. V. Rendu's «Ampélographie
  française» (1857) was read too and gave nothing usable (its sentences are
  comparative or about a place's wine).

- **J. Guyot, «Étude des vignobles de France»** (2nd ed., Masson, 1876; the
  author died in 1872), two volumes in the Internet Archive
  (`bwb_Y0-BSE-098_1`, `etudedesvignobl00guyogoog`): Aramon's body, «des
  vins qui n'ont pas assez d'alcool, de corps ni de couleur» (the check now
  reads «pas assez» as low). Also read, with nothing usable — they list a
  quinta's or a region's grapes, or describe its blended wine: Villa Maior,
  «O Douro illustrado» (1876); A. A. de Aguiar, «Conferencias sobre vinhos»
  (1876–77); E. Abela, «El libro del viticultor» (1885).

- **Open-access articles under CC BY 4.0**, read the same way where a
  sentence states a level for the variety itself: M. Kreidlmayer, «Wines of
  Fire and Earth: Exploring the Volcanic Terroirs of the Canary Islands»,
  Ecocycles 11(3), 2026 (doi:10.19040/ecocycles.v11i3.648) — Baboso Negro,
  that is Alfrocheiro, «known for their high natural acidity»; M. Plantevin
  et al., «Characterization of varietal effects on the acidity and pH of
  grape berries for selection of varieties better adapted to climate
  change», Frontiers in Plant Science 15, 2024 (doi:10.3389/fpls.2024.1439114,
  read from Europe PMC) — «two white varieties known for their high acidity:
  Alvarinho and Petit Manseng»; and six MDPI articles read from Europe PMC
  (MDPI's own pages refuse scripts), each in its introduction or methods
  describing the variety itself: Ibn Amor et al., Insects 16:497, 2025 —
  Cabernet Franc «characterized by high acidity, moderate tannins»;
  Cisterna-Castillo et al., Foods 13:3065, 2024 — Carménère's «usual low
  acidity»; Thomaz et al., Antioxidants 11:859, 2022 — Negroamaro «used to
  produce full-bodied and aromatic wines»; Valcárcel-Muñoz et al., Foods
  12:1911, 2023 — «The dry fortified wines are made from Palomino grapes»;
  Filimon et al., Foods 15:321, 2026 — Muscat Ottonel «usually deficient in
  acidity»; Sarais et al., Foods 14:2290, 2025 — Carignano's «dry, spicy, and
  harmonious taste»; and, from the PDF (MDPI's pages refuse scripts, so it was
  downloaded by hand), Damiano et al., Horticulturae 8:829, 2022 — Falanghina's
  «musts generally have high acidity», said of the musts, as Plantevin's is of
  the berries. They were found by searching Europe PMC's CC BY full texts for
  each grape and trait still missing; a sentence about an experimental wine,
  a sample, a comparison or a region is not used. Each article's text (from
  its PDF or Europe PMC's XML) is cached beside the books, and the reading
  names the article's address (`source.url`), which the grape's card links
  beside the quote.

- **P. Viala and V. Vermorel, «Ampélographie»** (Masson, 1901–1910; the
  authors died in 1936 and 1927, so in the public domain): the Internet
  Archive's text of its scanned volumes (`.kb-cache/ampelography/`, not in
  the repository), where a grape's articles say nothing of a level; each
  reading in `grape-readings.json` names its volume (`source`), its quote is
  checked against that volume's text, and the fact links the scan.

- **The grapes line of a region's English Wikipedia infobox**
  (`region-infobox-grapes.json`, `pnpm kb:fetch-region-infobox-grapes`):
  for names nothing else gives varieties for, the line as a reader sees it,
  each name matched to a library grape; CC BY-SA 4.0.

- **Swiss cantonal wine laws** (`ch-cantonal-grapes.json`): the varieties
  a canton's law authorises in its AOC, where no register lists them —
  Geneva's «Règlement sur la vigne et les vins» (RSG M 2 50.05), annex, for
  the AOC Genève and its 22 premiers crus; Vaud's «Règlement sur les vins
  vaudois» (annex of 2018) for Côtes-de-l'Orbe, Bonvillars and
  Dézaley-Marsens; Fribourg's «Ordonnance sur la vigne et le vin» (annex 1)
  for Vully and Cheyres. Official texts, free to reuse
  (Swiss Copyright Act, art. 5); each list's quote is checked against the
  law's text cached in `.kb-cache/ch-law/`.

- **Figures in the body of a name's Wikipedia article**
  (`region-text-figures.json`, articles cached by `pnpm
kb:fetch-region-articles`): area and production where the infobox gives
  none, each sentence copied as written and checked against the cached
  article by the build; CC BY-SA 4.0 like every Wikipedia text.

- **Tuscany's agricultural payments agency (ARTEA)**, «Artea - Raccolta Uva»
  on dati.toscana.it (`it-regional-figures.json`, `pnpm
kb:fetch-it-regional-figures`): CC BY 4.0, credited «Fonte: ARTEA – Regione
  Toscana»; the area declared at the latest grape harvest for each wine,
  summed over its types, on the registered name each type begins with.
  **Regione Lombardia**, «Superfici rivendicate per la produzione vini
  DOC_DOCG_IGT» on dati.lombardia.it: CC0; the area claimed at the 2013
  harvest. Names that span another region take none. **Regione Umbria**,
  «Produzioni Certificate» on dati.regione.umbria.it: CC BY 4.0; the wine
  each name certified as fit for its DO in the latest year.

- **Germany's Federal Statistical Office (Destatis)**, «Weinerzeugung 2025»
  (press release no. 105, 30 March 2026) for production, and «Rebflächen 2022»
  (`de-anbaugebiete-figures.json`): its publications allow reproduction and
  distribution, in part too, with the source named; each of the 13
  Anbaugebiete shows its planted area with the year and a link.

- **Argentina's Instituto Nacional de Vitivinicultura (INV)**, «Informe anual
  de superficie 2025» (`ar-ig-figures.json`): published on argentina.gob.ar
  under Creative Commons Attribution 4.0; each indication named after a
  department or a province shows that area's vineyard surface, with the year
  and a link to the report; and, from «Informe anual de cosecha y elaboración
  2025», the wine made in that department or province. Chile's vineyard survey (SAG/ODEPA) was not used:
  its CC BY-NC-SA licence forbids commercial reuse.

- **Switzerland's Federal Office for Agriculture (BLW/OFAG)**, annex to its
  press release «Weinlese 2025» (3 March 2026), «Rebfläche und Erntemenge»
  by canton (`ch-canton-figures.json`, transcribed by hand; each language
  region adds up to its total): reports of federal authorities are not
  protected by copyright (Swiss Copyright Act, art. 5 para. 1 lit. c). The
  21 cantonal AOCs with a row of their own (Graubünden and Bern adding their
  two) show their canton's area and harvest, in place of any other figure.

- **The Australian Bureau of Statistics (ABS)**, data cube «Vineyards,
  Australia, 2014-15» (1329.0.55.002, `1329055002do001_201415.xls`, CC BY
  4.0): the row «Wine grapes - Total - Total area (ha)» of each state, GI zone
  and GI region (`au-gi-figures.json`). 32 Australian names with no other area
  take it; Murray Darling and Swan Hill add up the two states' rows the ABS
  splits them into. Estimates with a relative standard error of 25 % or more
  are left out, and so is «Port Phillip and Gippsland», whose extent is
  unclear. Its production is in tonnes of grapes, not wine, so it is not used.

- **Statistics Portugal (INE)**, indicator 0012835 «Produção vinícola
  declarada em vinho (hl) pelos produtores por Local de vinificação e
  Qualidade e cor do vinho» on dados.gov.pt (CC BY 4.0;
  `pt-production-figures.json`, `pnpm kb:fetch-pt-production`): for the 15
  Portuguese names whose demarcated area, as their technical file writes it,
  is whole districts, an autonomous region or a set of municipalities where
  no other name of their kind lies, the PDO wine and PDO fortified wine (or
  the PGI wine) declared in those municipalities in 2025, summed. Names that
  share their ground (Setúbal and Palmela, Madeira and Madeirense, Óbidos and
  Encostas d'Aire, Douro and Porto) take none; wine is counted where it was
  made.

- **Copernicus DEM GLO-90** (doi:10.5270/ESA-c5d3d65), through
  Open-Meteo's elevation API: CC BY 4.0, credited to the Copernicus programme
  and Open-Meteo under the climate (`pnpm kb:fetch-elevation`).

- **27 CFR part 9** (eCFR): a work of the US government, public domain.
- **UC Davis AVA project** boundaries
  (https://github.com/UCDavisLibrary/ava): CC0 1.0; credited under the map.
- **ISRIC SoilGrids 2.0** (Poggio et al. 2021, _SOIL_ 7, 217–240,
  doi:10.5194/soil-7-217-2021): CC BY 4.0; the card credits it under the soil.

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
  directory of AOCs, Ontario's VQA regulation, Japan's National Tax Agency list and Moldova's AGEPI
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
- **OpenStreetMap** wineries (`wineries-osm.json` and the producer field's
  list, `apps/web/public/library/wineries.json`): © OpenStreetMap
  contributors; both files are made available under the Open Database
  Licence 1.0, and «Sources and licences» credits them.

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

Where a grape's English article says nothing of its wine, its articles in
other languages were read the same way: first its own language's (Spanish,
Catalan, French, Italian, Portuguese or German), then, in October 2026, those
of the grapes' countries and of the Soviet ampelography many were described
in (Russian, Ukrainian, Bulgarian, Hungarian, Croatian, Romanian, Czech,
Slovenian, Greek, Polish, Georgian), and the other languages with many grape
articles (Dutch, Swedish, Japanese, Turkish, Finnish, Norwegian, Danish,
Chinese, Galician, Basque, and any other with `--every`). The check knows how
levels are stated in those languages and a country's name declined or in
another script; an aroma or a dish is given as the library's term with the
article's own word for it, and each fact keeps the article it came from,
which the card links. A sentence that is conditional, regional, comparative,
or contradicted by another language's article is left unread.

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
country's wine article on English Wikipedia (`pnpm kb:fetch-country-wine`) —
only a sentence that names them, describes the wine, and carries no figures
or lists. Others take one sentence on their wine from the article of their
place (`place-sentences.json`, chosen by hand). Alsace's grand crus take the
coordinates of their vineyards from French Wikipedia's article on them
(`pnpm kb:fetch-grand-crus`).

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
