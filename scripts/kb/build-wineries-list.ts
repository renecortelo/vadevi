import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { WineryEntry } from "./appellation-names";
import { normalizeLibraryText } from "./library-sql";

/**
 * The wineries the producer field suggests, as one static file the browser
 * fetches the first time the field is used and searches itself
 * (`apps/web/public/library/wineries.json`): Wikidata's (`wineries.json`,
 * CC0), then OpenStreetMap's (`wineries-osm.json`, ODbL) that Wikidata does
 * not already give — by its item, or by its name in its country. Name and
 * country only, as `[name, country]` pairs. A list this size never touches
 * the database: no rows to load, none read as the reader types.
 *
 * Usage: pnpm kb:build-wineries (after kb:fetch-wineries or kb:fetch-osm-wineries)
 */
type OsmWinery = WineryEntry & { wikidata?: string };
const read = <T>(path: string): T[] =>
  existsSync(resolve(path))
    ? (JSON.parse(readFileSync(resolve(path), "utf8")) as { wineries: T[] }).wineries
    : [];

const wikidata = read<WineryEntry>("data/kb/wineries.json");
const osm = read<OsmWinery>("data/kb/wineries-osm.json");
const items = new Set(wikidata.map((winery) => winery.id));
const seen = new Set(
  wikidata.map((winery) => `${winery.countryCode}:${normalizeLibraryText(winery.name)}`),
);
const added = osm.filter((winery) => {
  const key = `${winery.countryCode}:${normalizeLibraryText(winery.name)}`;
  if ((winery.wikidata !== undefined && items.has(winery.wikidata)) || seen.has(key)) return false;
  seen.add(key);
  return true;
});
const list = [...wikidata, ...added]
  .map((winery) => [winery.name, winery.countryCode] as const)
  .sort((one, other) => one[0].localeCompare(other[0], "en") || one[1].localeCompare(other[1]));

writeFileSync(
  resolve("apps/web/public/library/wineries.json"),
  `${JSON.stringify({
    about:
      "Wineries the producer field suggests: from Wikidata (CC0) and OpenStreetMap (© OpenStreetMap contributors, Open Database Licence 1.0, https://opendatacommons.org/licenses/odbl/1-0/). Built by `pnpm kb:build-wineries`.",
    wineries: list,
  })}\n`,
);
console.info(
  `${list.length} wineries (${wikidata.length} from Wikidata, ${added.length} more from OpenStreetMap).`,
);
