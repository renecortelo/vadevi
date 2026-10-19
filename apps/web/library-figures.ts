import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Plugin } from "vite";

/**
 * The library's size, counted from its own files when the app is built, so
 * the figures the sign-in screen shows are never written by hand: the names
 * in the atlas, their countries, the grapes, the aroma terms and the
 * interface's languages.
 */
export type LibraryFigures = {
  aromas: number;
  countries: number;
  grapes: number;
  languages: number;
  names: number;
};

export function libraryFigures(root: string): LibraryFigures {
  const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
  const names = read<{ countryCode: string }[]>("data/kb/appellations.json");
  return {
    aromas: Object.keys(read<{ aroma: { terms: object } }>("data/kb/terms.json").aroma.terms)
      .length,
    countries: new Set(names.map((name) => name.countryCode)).size,
    grapes: read<unknown[]>("data/kb/grapes.json").length,
    languages: readdirSync(resolve(root, "packages/i18n/src/locales")).length,
    names: names.length,
  };
}

const id = "virtual:library-figures";

export function libraryFiguresPlugin(): Plugin {
  return {
    load(requested) {
      if (requested !== `\0${id}`) return null;
      return `export default ${JSON.stringify(libraryFigures(resolve(import.meta.dirname, "../..")))};`;
    },
    name: "library-figures",
    resolveId(requested) {
      return requested === id ? `\0${id}` : null;
    },
  };
}
