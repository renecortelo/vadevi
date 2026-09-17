/**
 * Pseudo-localization.
 *
 * The pseudo locale is a build/test artifact, never a shipped product language.
 * It exists to expose three classes of defect before a fluent reviewer sees a
 * catalog:
 *
 * - layouts that break once German or Dutch strings run long
 * - text that is concatenated or hard-coded instead of resolved from a key
 * - interpolation and ICU plural/select syntax that a translator could damage
 *
 * Placeholders (`{{name}}`), ICU blocks (`{count, plural, ...}`), and HTML-ish
 * tags are copied through untouched so a pseudo string stays functional.
 */

/** §13.4 requires pseudo strings to expand by at least 35%. */
export const minimumExpansionRatio = 0.35;

const accentMap: Readonly<Record<string, string>> = {
  a: "ä",
  b: "þ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ķ",
  l: "ł",
  m: "ɱ",
  n: "ñ",
  o: "ö",
  p: "þ",
  q: " q",
  r: "ř",
  s: "š",
  t: "ť",
  u: "ü",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Ä",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ķ",
  L: "Ł",
  M: "Ṁ",
  N: "Ñ",
  O: "Ö",
  P: "Þ",
  Q: "Q",
  R: "Ř",
  S: "Š",
  T: "Ť",
  U: "Ü",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

/** Segments that must survive untouched: `{{var}}`, `{icu, ...}`, and `<tag>`. */
const protectedSegment = /(\{\{[^}]*\}\}|\{[^}]*\}|<[^>]*>)/g;

/** Padding characters chosen to be visibly non-Latin without changing width class. */
const padStart = "⟦";
const padEnd = "⟧";

function accent(text: string): string {
  return [...text].map((character) => accentMap[character] ?? character).join("");
}

/**
 * Expand and accent one source string.
 *
 * The expansion is deterministic: the same input always produces the same
 * output, so a catalog diff stays reviewable.
 */
export function pseudoLocalizeString(source: string): string {
  const parts = source.split(protectedSegment);
  const accented = parts.map((part, index) => (index % 2 === 1 ? part : accent(part))).join("");

  // Expand on the translatable characters only, so a string that is mostly
  // placeholders is not padded out of proportion.
  const translatableLength = parts
    .filter((_, index) => index % 2 === 0)
    .reduce((total, part) => total + part.length, 0);
  const padding = "·".repeat(Math.max(1, Math.ceil(translatableLength * minimumExpansionRatio)));
  return `${padStart}${accented}${padding}${padEnd}`;
}

export type Catalog = { [key: string]: Catalog | string };

export function pseudoLocalizeCatalog(source: Catalog): Catalog {
  const output: Catalog = {};
  for (const [key, value] of Object.entries(source)) {
    output[key] =
      typeof value === "string" ? pseudoLocalizeString(value) : pseudoLocalizeCatalog(value);
  }
  return output;
}

/** The placeholders and ICU blocks a translator must not alter. */
export function extractPlaceholders(source: string): string[] {
  return (source.match(protectedSegment) ?? []).sort();
}

/**
 * Expansion ratio measured against the source, ignoring the protected segments
 * that neither locale is allowed to translate.
 */
export function expansionRatio(source: string, pseudo: string): number {
  const strip = (text: string) => text.replaceAll(protectedSegment, "");
  const sourceLength = strip(source).length;
  if (sourceLength === 0) return Number.POSITIVE_INFINITY;
  return (strip(pseudo).length - sourceLength) / sourceLength;
}
