import { normalizeWineText } from "./wine-memory";

/**
 * One producer, however it was written.
 *
 * A label says "Bodegas Sumarroca", a receipt "Sumarroca", a hurried entry
 * "sumarroca"; "Celler Mas Doix" and "Mas Doix", "Domaine Leflaive" and
 * "Leflaive", "Weingut Dönnhoff" and "Dönnhoff" are each one house. A
 * producer's name is read without accents, case, and the words that say what
 * kind of house it is or what company form it takes, at either end. What is
 * left must still be a name — at least three letters — or the whole is kept:
 * "Bodega Prueba" is "prueba", but "Celler" alone stays "celler".
 */
const leading = new Set([
  "bodega",
  "bodegas",
  "celler",
  "cellers",
  "cellar",
  "cellars",
  "cave",
  "caves",
  "domaine",
  "domaines",
  "chateau",
  "cantina",
  "cantine",
  "tenuta",
  "weingut",
  "grup",
  "grupo",
  "group",
  "vinicola",
  "vinos",
  "vins",
  "vini",
  "vinhos",
]);
const trailing = new Set([
  "winery",
  "wines",
  "vineyards",
  "estate",
  "estates",
  "bodegas",
  "bodega",
  "sa",
  "sl",
  "slu",
  "sau",
  "srl",
  "spa",
  "gmbh",
  "sas",
  "sarl",
  "ltd",
  "inc",
]);

export function producerKey(name: string): string {
  // Letters standing alone in a row are one word: "S.A." is "sa", "S.L.U." "slu".
  const words: string[] = [];
  let letters = false;
  for (const word of normalizeWineText(name).split(" ").filter(Boolean)) {
    if (word.length === 1 && letters) words[words.length - 1] += word;
    else words.push(word);
    letters = word.length === 1;
  }
  let start = 0;
  let end = words.length;
  while (start < end && leading.has(words[start]!)) start += 1;
  while (end > start && trailing.has(words[end - 1]!)) end -= 1;
  const kept = words.slice(start, end).join(" ");
  return kept.replaceAll(" ", "").length >= 3 ? kept : words.join(" ");
}
