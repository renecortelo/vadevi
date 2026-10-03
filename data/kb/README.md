# The wine library

Reference knowledge about grapes and the EU's registered wine names, loaded
into D1 (migrations `0025`–`0028`) by
`pnpm kb:load` — and by every deploy, which reloads only when this directory
changes, and then writes only the rows that changed. D1's free plan allows
100,000 written rows a day for the whole database, the application's own
saves included; a load that would write more than 25,000 stops before writing
anything (`--max-writes` to raise it, after 00:00 UTC). Vicenç and the app read it instead of searching the web for general
questions ("what does a Garnacha smell like?").

## Where it comes from

| File                | Built by                                                                    | Sources                                                               |
| ------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `grapes.json`       | `pnpm kb:fetch-grapes`, `pnpm kb:extract-grapes`, `pnpm kb:build-grapes`    | Wikidata (names, aliases), Wikipedia (prose)                          |
| `terms.json`        | by hand                                                                     | The vocabulary aromas and foods are shown in, in eight languages      |
| `appellations.json` | `pnpm kb:fetch-appellations`, `pnpm kb:build-appellations`                  | eAmbrosia (the EU register), Wikidata, Wikipedia                      |
| `topics.json`       | `pnpm kb:fetch-topics`, `pnpm kb:build-topics` (from `topics-include.json`) | Wikidata (names), Wikipedia (explanations)                            |
| `grape-images.json` | `pnpm kb:fetch-grape-images`                                                | Wikimedia Commons (photographs, in `apps/web/public/library/grapes/`) |

Every structured value carries `evidence`: the sentence of the English
Wikipedia article it was read from. A language model reads the article and
proposes values with quotes; `scripts/kb/grape-validation.ts` keeps a value
only if its quote occurs in the article and says it. The model is the reader,
never the source.

The atlas (`appellations.json`) involves no model at all. Every registered
wine PDO and PGI comes from the EU register itself; Wikidata adds names in
other languages and a point on the map, matched by the register's id or by
name in the same country (Greek and Bulgarian names in Latin letters too).
Where the wine's own item has no point, the area it lies in gives an
approximate one, and a name with no wine item at all may take the point of
the town it is named after (same name, same country); the page says when a
point is approximate; a Wikipedia lead becomes the summary only when it is
about the wine rather than the town it is named for. A grape is listed under a
registered name only where the grape's own article says it is grown there,
with that sentence — the full list of authorised varieties is in each name's
product specification, linked from the register.

## Licences

- **Wikidata** names and aliases: CC0 1.0.
- **Wikipedia** summaries and quoted sentences: CC BY-SA 4.0. Each summary
  and each grape records the article it came from (`url`, `wikipediaUrl`);
  the app shows that link next to the text. Text derived from these articles
  is shared under the same licence.

- **eAmbrosia** register data: © European Union, reused under the
  Commission's reuse notice (Decision 2011/833/EU). Each entry links back to
  its page in the register.

- **Wikimedia Commons** photographs: each under its own free licence (public
  domain, CC0, CC BY or CC BY-SA), recorded with its author and source in
  `grape-images.json` and credited under the photograph in the app. The
  release scan refuses any picture in that folder without its record.
- **Natural Earth** country outlines (the library's map,
  `apps/web/src/library/europe-map.json`, built by `pnpm kb:build-map`):
  public domain.

The styles and methods (`topics.json`) are articles chosen by hand in
`topics-include.json`; their explanations are each article's lead, in every
language Wikipedia has it, and no model is involved.

Nothing here is copied from commercial wine references.
