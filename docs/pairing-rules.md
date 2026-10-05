# Pairing rules

How Va de Vi decides which wine suits a dish, and which dishes suit a grape —
offline, free, in all eight languages, and with a source for every rule.

The rules live in `apps/api/src/adapters/`:

| File                   | What it holds                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `pairing-knowledge.ts` | The bibliography: every principle, every grape placed in a style and every classic, each quoted.    |
| `dish-profile.ts`      | How a dish typed in any of the eight languages is read: protein, weight, fat, acid, salt, spice…    |
| `local-pairing.ts`     | The 19 wine styles, the scoring, and the reasons the reader is told.                                |
| `grape-pairing.ts`     | The same rules run backwards: which dishes suit each style a grape makes ("Va bien con" on a card). |

Vicenç uses the first three to answer "¿qué vino con…?" and to look for the
reader's own bottles that fit; the library card uses the last.

## Where the rules come from

Every rule, grape and classic cites a sentence from an open source — mostly
Wikipedia's articles on wine and food pairing in English, French, Spanish,
Dutch and Ukrainian, and the articles on the wines themselves (Sherry, Port,
Madeira, Sauternes, Banyuls, Tokaji, Champagne, Gewürztraminer, rosé, Moscato
d'Asti). A grape's own article, as the library already holds it, counts too.

```bash
pnpm kb:check-pairing-sources
```

fetches every article once (cached in `.kb-cache/pairing/`; `--refresh`
fetches again) and fails unless each quote is in its source word for word. At
the time of writing: 114 citations, 20 articles plus the library. A unit test
checks the rest of the structure: every classic names styles and families the
rules have, every grape named for a style exists in the library.

What no open source says, the rules do not do. The earlier rule that umami
hardens tannin had no source the rules could cite, so it was removed:
soy-glazed and sweet-and-sour dishes are now kept from tannic wines by what the
sources do say — sweetness and spice make tannin taste harsh.

## The principles

| Principle            | What the rules do                                                                   | Source (Wine and food pairing, en, unless noted) |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Weight               | The wine's body follows the dish's intensity; alcohol counts as weight.             | "the most basic element… the weight"             |
| Acidity and fat      | Fat and salt want acidity.                                                          | "In dishes that are fatty, oily, rich or salty…" |
| Acid with acid       | A tart dish needs a wine at least as tart.                                          | "A wine that is less tart than the dish…"        |
| Tannin and protein   | Red meat and hard cheese allow tannin.                                              | "the tannins bind to the proteins…"              |
| No protein           | Without protein, little tannin.                                                     | "In the absence of protein from the food…"       |
| Char, fish oils      | Grilling allows tannin; fish never does.                                            | "grilling and blackening… fish oils…"            |
| Sweeter than dessert | A sweet wine must out-sweeten the pudding.                                          | "Sweet wines often need to be sweeter…"          |
| Sweetness and heat   | Spice wants a touch of sweetness, and little tannin and alcohol.                    | "sweetness balances spice and heat"; alcohol     |
| Sweet and sour       | A sweet-and-sour sauce wants a touch of sweetness.                                  | "Sweetness in a wine can balance tartness…"      |
| Salt and sweetness   | Blue cheese and foie gras take a sweet wine as contrast.                            | "salty Stilton cheese with a sweet Port"         |
| Salt and alcohol     | Salt makes a high-alcohol wine burn.                                                | "salt and spicy heat accentuates the alcohol"    |
| Earthy with earthy   | Mushrooms with an earthy light red.                                                 | "an earthy, Burgundian Pinot noir…"              |
| Versatile sparkling  | Traditional-method sparkling suits most savoury dishes a little.                    | Maridaje (es): "Los cavas pueden utilizarse…"    |
| Classics             | A pairing a source names counts for more; each further source, a little more (≤ 3). | 59 pairings from 17 sources                      |

## Styles and grapes

19 styles, shaped by the weights the English article lists ("Lighter whites",
"Heavier reds"…). A grape is listed under a style only where a source names it
there: Albariño, Chardonnay, Sémillon, Viognier, Roussanne and Marsanne among
"Medium to heavy whites"; Pinot noir, Pinot meunier and Chardonnay for
Champagne; the five Port grapes; Palomino for fino, amontillado and oloroso;
Sémillon, Sauvignon blanc and Muscadelle for Sauternes; Rkatsiteli and Kisi
for amber wine, from their own articles. A style that needs a kind of wine —
sweet, sparkling, fortified, rosé — takes a grape only if the library knows it
makes that kind, or knows nothing of what it makes.

## A grape's card

1. **The styles a source names it in**, each with its own dishes: a dry
   Riesling and a sweet one do not go with the same things.
2. **Its table wine, by its structure**, where no source names it in a still
   style of its own colour (a red known only for Port or rosé, a grape no
   source names at all): placed in the light, medium or full red, the light or
   full-bodied white, or the rosé its acidity, tannin and body fit best.
   Marked "(por su perfil)" on the card.
3. **The dishes**: for each of 34 kinds of dish, the styles the rules rank
   best — at most three, and only those close to the best.
4. **Never what the source already says.** Dishes the grape's own article
   names are shown as the source's, and not suggested again.

## Limits

The rules are a good sommelier's floor, not their ceiling. They know styles,
not bottles: they will not know that one Priorat is atypically light. The
sources are general references; where they disagree (light reds with lamb in
the Spanish article, full reds in the English), both are counted and the
structure decides. A dish nothing in the vocabulary recognises gets no answer
rather than a guess.

To extend the rules: add the sentence to `pairing-knowledge.ts`, run
`pnpm kb:check-pairing-sources`, then the tests.
