import { normalizeWineText } from "./wine-memory";

/**
 * Grape-variety synonyms, so a wine entered under one name is found by another
 * the reader knows — "Tinto Fino" and "Ull de Llebre" reach a Tempranillo, and
 * "Shiraz" reaches a Syrah. These are established varietal equivalences (the kind
 * VIVC and datasets like X-Wines record), not the model's guesses, which is the
 * point: the app should know Tempranillo = Tinto Fino rather than let Vicenç
 * invent it.
 *
 * Each entry is a canonical name followed by its common synonyms. Matching is
 * accent- and case-insensitive through `normalizeWineText`, so only distinct
 * spellings need listing. Scope is the better-known varieties; an unlisted grape
 * simply searches its own name.
 */
const grapeGroups: readonly (readonly string[])[] = [
  [
    "Tempranillo",
    "Tinto Fino",
    "Tinta del País",
    "Cencibel",
    "Ull de Llebre",
    "Tinta de Toro",
    "Aragonez",
    "Aragonês",
    "Tinta Roriz",
  ],
  ["Garnacha", "Grenache", "Garnatxa", "Cannonau", "Garnacha Tinta"],
  ["Garnacha Blanca", "Grenache Blanc", "Garnatxa Blanca"],
  ["Monastrell", "Mourvèdre", "Mataró"],
  ["Cariñena", "Mazuelo", "Carignan", "Samsó", "Carignano"],
  ["Mencía", "Jaen"],
  ["Syrah", "Shiraz"],
  ["Pinot Noir", "Pinot Nero", "Spätburgunder", "Blauburgunder"],
  ["Pinot Gris", "Pinot Grigio", "Grauburgunder", "Ruländer"],
  ["Pinot Blanc", "Pinot Bianco", "Weissburgunder"],
  ["Chardonnay", "Morillon"],
  ["Sauvignon Blanc", "Fumé Blanc"],
  ["Trebbiano", "Ugni Blanc"],
  ["Sangiovese", "Brunello", "Morellino", "Prugnolo Gentile", "Nielluccio"],
  ["Nebbiolo", "Spanna", "Chiavennasca"],
  ["Malbec", "Côt", "Cot", "Auxerrois du Malbec"],
  ["Zinfandel", "Primitivo", "Tribidrag", "Crljenak Kaštelanski"],
  ["Albariño", "Alvarinho"],
  ["Macabeo", "Viura"],
  ["Palomino", "Listán Blanco"],
  ["Verdejo"],
  ["Godello"],
  ["Xarel·lo", "Xarello", "Pansa Blanca"],
  ["Touriga Nacional"],
  ["Carmenère", "Carmenere", "Grande Vidure"],
  ["Grüner Veltliner", "Gruner Veltliner"],
  ["Gewürztraminer", "Gewurztraminer", "Traminer", "Traminer Aromatico"],
  ["Furmint"],
  ["Verdicchio", "Trebbiano di Soave"],
  ["Cabernet Sauvignon"],
  ["Cabernet Franc"],
  ["Merlot"],
  ["Riesling"],
  ["Viognier"],
  ["Chenin Blanc", "Steen", "Pineau de la Loire"],
  ["Sémillon", "Semillon"],
  ["Glera", "Prosecco"],
] as const;

// Every normalized name → the normalized names of its whole group, so any
// spelling expands to all the equivalents to search for.
const nameToGroup = new Map<string, string[]>();
for (const group of grapeGroups) {
  const normalized = [
    ...new Set(group.map((name) => normalizeWineText(name)).filter((name) => name.length >= 2)),
  ];
  for (const name of normalized) {
    if (!nameToGroup.has(name)) nameToGroup.set(name, normalized);
  }
}

/**
 * The grape names to search for a term: the term itself plus any known synonyms,
 * so "Tinto Fino" also finds wines entered as "Tempranillo". Unknown grapes
 * return just their own normalized name.
 */
export function resolveGrapeGroup(term: string): string[] {
  const normalized = normalizeWineText(term);
  if (normalized.length < 2) return [];
  return nameToGroup.get(normalized) ?? [normalized];
}

/**
 * Whether a term is a grape this gazetteer knows to have other names — used to
 * decide when it is worth searching the synonyms as well.
 */
export function isKnownGrapeSynonym(term: string): boolean {
  const group = nameToGroup.get(normalizeWineText(term));
  return group !== undefined && group.length > 1;
}

/**
 * The grape names to search for a whole question, expanding every grape named in
 * it — single- or multi-word ("Tinto Fino") — to its synonyms. Matched as whole
 * phrases over the normalized message, so a multi-word variety survives the
 * per-word term split that a token search would lose.
 */
export function resolveGrapeNamesFromMessage(message: string, limit = 8): string[] {
  const normalized = normalizeWineText(message);
  if (normalized.length === 0) return [];
  const padded = ` ${normalized} `;
  const names = new Set<string>();
  for (const [phrase, group] of nameToGroup) {
    if (phrase.length < 3 || !padded.includes(` ${phrase} `)) continue;
    for (const name of group) names.add(name);
    if (names.size >= 24) break;
  }
  return [...names].slice(0, limit);
}
