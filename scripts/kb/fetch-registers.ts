import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { cache, leadLanguages, placeOf, wineArticleItems } from "./world-sources";

/**
 * The atlas beyond the EU, from registers transcribed by hand: one file per
 * country in `data/kb/registers/`, each name as its official list writes it,
 * with its kind, number, date and the places its delimitation names. Each is
 * placed where OpenStreetMap has the place of its name (or the places the
 * file lists for it), or else at the middle of the places its delimitation
 * names — approximately; its article on Wikipedia found as for the other
 * registers. Nothing here is a model's: no AI quota is spent.
 *
 * Usage: pnpm kb:fetch-registers (then pnpm kb:build-appellations)
 */

export type TranscribedArea = {
  /** An English Wikipedia article on the name's wine, when its title is not "<name> wine". */
  article?: string;
  key: string;
  /** True where "<name> wine" is another place's wine (Jura's is France's). */
  noArticle?: boolean;
  /** The kind of area the register gives it, where it gives several. */
  level?: string;
  names: string[];
  /** Where to look for its point first, when its name is not a place. */
  places?: string[];
  /** False where the name is also another place than the area's. */
  placeByName?: boolean;
  ref?: string;
  registeredOn?: string;
  /** The places its delimitation names, to place it amid them. */
  spread?: string[];
  /** The region, state or canton names OpenStreetMap files its places under. */
  states?: string[];
  type: string;
  /** Its own page or document, where the register has one per name. */
  url?: string;
  /** The keys of the areas it lies within. */
  within?: string[];
};

export type TranscribedRegister = {
  areas: TranscribedArea[];
  countryCode: string;
  source: { issued: string; note: string; publisher: string; title: string; url: string };
};

export const registersFolder = resolve("data/kb/registers");
const outFolder = resolve(cache, "registers");

const middle = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
};

async function main() {
  mkdirSync(outFolder, { recursive: true });
  for (const file of readdirSync(registersFolder).filter((name) => name.endsWith(".json"))) {
    const register = JSON.parse(
      readFileSync(resolve(registersFolder, file), "utf8"),
    ) as TranscribedRegister;
    const country = register.countryCode.toLowerCase();
    const items = await wineArticleItems(
      new Map(
        register.areas
          .filter((area) => area.noArticle !== true)
          .map((area) => [area.key, area.names]),
      ),
      Object.fromEntries(
        register.areas.flatMap((area) =>
          area.article === undefined ? [] : [[area.key, area.article]],
        ),
      ),
    );
    await leadLanguages([...new Set(items.values())]);
    const records = [];
    for (const area of register.areas) {
      const states = area.states ?? [];
      const byName = [...(area.places ?? []), ...(area.placeByName === false ? [] : area.names)];
      const own = byName.length === 0 ? null : await placeOf(byName, country, states, null);
      let point: { latitude: number; longitude: number } | null = own;
      let pointSource: "area" | "place" | null = own === null ? null : "place";
      if (point === null && (area.spread ?? []).length > 0) {
        const found = [];
        for (const place of area.spread!) {
          const at = await placeOf([place], country, states, null);
          if (at !== null) found.push(at);
        }
        if (found.length > 0) {
          point = {
            latitude: middle(found.map((at) => at.latitude)),
            longitude: middle(found.map((at) => at.longitude)),
          };
          pointSource = "area";
        }
      }
      records.push({
        key: area.key,
        latitude: point?.latitude ?? null,
        level: area.level ?? null,
        longitude: point?.longitude ?? null,
        names: area.names,
        pointSource,
        qid: items.get(area.key) ?? null,
        ref: area.ref ?? null,
        registeredOn: area.registeredOn ?? null,
        type: area.type,
        url: area.url ?? register.source.url,
        within: area.within ?? [],
      });
    }
    writeFileSync(
      resolve(outFolder, `${country}.json`),
      JSON.stringify({ countryCode: register.countryCode, records }, null, 1),
    );
    console.info(
      `  ${register.countryCode}: ${records.length} names from ${register.source.publisher}, ` +
        `${items.size} with an article on their wine, ` +
        `${records.filter((record) => record.pointSource === "place").length} placed at their place, ` +
        `${records.filter((record) => record.pointSource === "area").length} amid theirs.`,
    );
  }
}

if (existsSync(registersFolder)) await main();
