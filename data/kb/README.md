# The wine library

Reference knowledge about grapes and the EU's registered wine names, loaded
into D1 (migrations `0025`–`0027`) by
`pnpm kb:load` — and by every deploy, which reloads only when this directory
changes. Vicenç and the app read it instead of searching the web for general
questions ("what does a Garnacha smell like?").

## Where it comes from

| File                | Built by                                                                 | Sources                                                          |
| ------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `grapes.json`       | `pnpm kb:fetch-grapes`, `pnpm kb:extract-grapes`, `pnpm kb:build-grapes` | Wikidata (names, aliases), Wikipedia (prose)                     |
| `terms.json`        | by hand                                                                  | The vocabulary aromas and foods are shown in, in eight languages |
| `appellations.json` | `pnpm kb:fetch-appellations`, `pnpm kb:build-appellations`               | eAmbrosia (the EU register), Wikidata, Wikipedia                 |

Every structured value carries `evidence`: the sentence of the English
Wikipedia article it was read from. A language model reads the article and
proposes values with quotes; `scripts/kb/grape-validation.ts` keeps a value
only if its quote occurs in the article and says it. The model is the reader,
never the source.

The atlas (`appellations.json`) involves no model at all. Every registered
wine PDO and PGI comes from the EU register itself; Wikidata adds names in
other languages and a point on the map, matched by the register's id or by
name in the same country; a Wikipedia lead becomes the summary only when it is
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

Nothing here is copied from commercial wine references.
