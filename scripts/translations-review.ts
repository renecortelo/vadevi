import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The interface's catalogs for a fluent reviewer (docs/localization-review.md):
 * one spreadsheet per language, each string beside its English source, with a
 * column to write a correction in and one for notes. A reviewer needs no
 * repository and no JSON — any spreadsheet program opens the files.
 *
 *   pnpm i18n:export <folder>   writes <folder>/<locale>.csv for each language
 *   pnpm i18n:import <folder>   applies the corrections written in them
 *
 * Only the correction column is read back, and only where it is filled; the
 * catalogs are then checked as always (`pnpm i18n:check`), so a correction
 * that drops a {{placeholder}} or breaks a plural is refused there.
 */

const locales = ["ca", "de", "es", "fr", "it", "nl", "pt-PT"] as const;
const catalogPath = (locale: string) =>
  resolve(import.meta.dirname, `../packages/i18n/src/locales/${locale}/common.json`);

type Catalog = { [key: string]: Catalog | string };

function flatten(catalog: Catalog, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") flat.set(path, value);
    else for (const [inner, text] of flatten(value, path)) flat.set(inner, text);
  }
  return flat;
}

function setPath(catalog: Catalog, path: string, value: string): boolean {
  const parts = path.split(".");
  let node: Catalog = catalog;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (typeof next !== "object") return false;
    node = next;
  }
  const last = parts.at(-1)!;
  if (typeof node[last] !== "string") return false;
  node[last] = value;
  return true;
}

/** A CSV field, quoted always: the strings hold commas, quotes and line breaks. */
/** The byte-order mark: spreadsheet programs then read the file as UTF-8. */
const bom = String.fromCharCode(0xfeff);

const field = (text: string) => `"${text.replaceAll('"', '""')}"`;

/** RFC 4180 rows, as a spreadsheet program saves them. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const [command, folderArgument] = process.argv.slice(2);
if ((command !== "export" && command !== "import") || folderArgument === undefined) {
  console.error("Usage: tsx scripts/translations-review.ts export|import <folder>");
  process.exit(1);
}
const folder = resolve(folderArgument);
const english = flatten(JSON.parse(readFileSync(catalogPath("en"), "utf8")) as Catalog);

if (command === "export") {
  mkdirSync(folder, { recursive: true });
  for (const locale of locales) {
    const translated = flatten(JSON.parse(readFileSync(catalogPath(locale), "utf8")) as Catalog);
    const lines = [["key", "english", locale, "correction", "notes"].map(field).join(",")];
    for (const [key, source] of english) {
      lines.push([key, source, translated.get(key) ?? "", "", ""].map(field).join(","));
    }
    // The byte-order mark lets spreadsheet programs read the file as UTF-8.
    writeFileSync(resolve(folder, `${locale}.csv`), `${bom}${lines.join("\r\n")}\r\n`);
  }
  console.info(`Wrote ${locales.length} sheets of ${english.size} strings each to ${folder}.`);
} else {
  let applied = 0;
  for (const locale of locales) {
    const path = resolve(folder, `${locale}.csv`);
    if (!existsSync(path)) continue;
    const rows = parseCsv(readFileSync(path, "utf8").replace(new RegExp(`^${bom}`), ""));
    const header = rows[0] ?? [];
    const keyColumn = header.indexOf("key");
    const correctionColumn = header.indexOf("correction");
    if (keyColumn < 0 || correctionColumn < 0) {
      console.error(`${locale}.csv has no "key" and "correction" columns; skipped.`);
      continue;
    }
    const catalog = JSON.parse(readFileSync(catalogPath(locale), "utf8")) as Catalog;
    let changed = 0;
    for (const row of rows.slice(1)) {
      const key = row[keyColumn]?.trim() ?? "";
      const correction = row[correctionColumn] ?? "";
      if (key === "" || correction.trim() === "") continue;
      if (setPath(catalog, key, correction)) changed += 1;
      else console.warn(`${locale}: no string "${key}" in the catalog; skipped.`);
    }
    if (changed > 0) {
      writeFileSync(catalogPath(locale), `${JSON.stringify(catalog, null, 2)}\n`);
      console.info(`${locale}: ${changed} corrections applied.`);
      applied += changed;
    }
  }
  console.info(
    applied === 0
      ? "No corrections found."
      : `${applied} corrections applied. Run pnpm i18n:check before committing.`,
  );
}
