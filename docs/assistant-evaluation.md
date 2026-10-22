# Vicenç's question bank

`pnpm eval:vicenc` asks Vicenç about the whole wine library and scores what
it would hand the language model — the statements — so the score measures
the app, not a model's phrasing. It runs apart from `pnpm check` (it loads
every grape and asks some 450 questions in about five seconds), from
`apps/api/eval/vicenc.eval.ts` with its own config
(`apps/api/vitest.eval.config.ts`).

## What it asks and what it scores

| Question                                                                                                      | Scored                                                                                                                                                                                                                                                                                                                                                                                                          | Must reach                                   |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Every grape, in one of the eight languages by turns, by its name in that language («Wie ist die Rebsorte …?») | the grape is found; every fact its card holds — acidity, tannin, body, alcohol, sweetness — reaches the statements, and a fact read from one place's wine says so («said of the wine of Tokaj»); every researched statement carries a source; every citation is credited to who its address is (Wikipedia, Wikivoyage, an open-access paper, the University of Adelaide, the Internet Archive, the EU register) | 95 % found; facts, citations and credits all |
| Every grape with a synonym, by its first one («Ull de Llebre?»)                                               | the grape is found                                                                                                                                                                                                                                                                                                                                                                                              | 80 %                                         |
| A sample of 44 registered names in 18 countries (every 60th), by the name a Spanish reader writes             | the name is found; its card's vineyard area, production and climate reach the statements; a citation is credited to Wikipedia only when it is Wikipedia's                                                                                                                                                                                                                                                       | 90 % found; figures, climate and credits all |
| Five grapes that do not exist («Zarvenelle»)                                                                  | no grape found and no library statement given                                                                                                                                                                                                                                                                                                                                                                   | all                                          |
| Every style and method, in the eight languages by turns («Qu'est-ce que le vin orange ?»)                     | the style is found; its citation credited as itself                                                                                                                                                                                                                                                                                                                                                             | 90 % found; credits all                      |
| Every grape whose source gives pairings («¿Con qué marida el …?»)                                             | its source's dishes given and cited; the pairing rules' suggestion given as a suggestion, uncited                                                                                                                                                                                                                                                                                                               | all                                          |

## Results

22 October 2026, first run:

| Measure                                                  | Result        |
| -------------------------------------------------------- | ------------- |
| Grapes found                                             | 209 / 209     |
| Card facts given                                         | 560 / 560     |
| Researched statements cited                              | 1,068 / 1,068 |
| Citations credited to their own source                   | 773 / 773     |
| Grapes found by a synonym                                | 179 / 182     |
| Registered names found                                   | 44 / 44       |
| Their figures and climate given                          | 87 / 87       |
| Their citations credited as Wikipedia only when they are | 270 / 270     |
| Invented grapes met with silence                         | 5 / 5         |
| Styles and methods found                                 | 40 / 41       |
| Grapes whose pairings are given as their kind            | 95 / 95       |

The three synonyms missed are by design: «Alicante» (a region and another
grape too), «Côt» and «PX» (too short to match without false hits).

Run against the code of the morning, the bank caught what it was written
for: only 324 of 560 card facts reached Vicenç (it gave acidity, tannin and
body but never alcohol or sweetness, and gave a place's wine as the
variety's), and 36 citations of papers and of the Adelaide database were
credited as Wikipedia. Both are fixed — and the same evening, a registered name's vineyard area,
production and climate, which the card shows, reached Vicenç for the first
time, each cited to whoever gives it (the Ministry, the customs, the ABS,
CHELSA…), and a name's grapes stopped being credited all to Wikipedia — and `apps/api/tests/assistant-library.test.ts`
now holds them in every check.

The styles and pairings added the same night found one more: asked about
Sauvignon vert, Vicenç answered about Muscadelle and Sauvignon blanc —
«Sauvignon vert» is also a synonym of Muscadelle, and on a tie the
alphabet chose. Now a name matched as a grape's own wins over the same name
as another's synonym. The one style not found is the lees in French, «Lie»:
three letters, too short to match without false hits, like «PX».
