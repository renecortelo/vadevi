import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey } from "./appellation-names";
import { wikimedia } from "./wikimedia";

/**
 * Alsace's 51 grand crus are lieux-dits, named like villages elsewhere in
 * Alsace, and the register does not say where each one is. French
 * Wikipedia's article on them lists every grand cru with its commune and the
 * coordinates of the vineyard itself; those become the grand crus' points.
 *
 * Writes `.kb-cache/appellations/grand-crus.json`, which the atlas build reads.
 *
 * Usage: pnpm kb:fetch-grand-crus
 */
const title = "Alsace grand cru";
const body = await wikimedia<{ parse?: { wikitext?: { "*": string } } }>(
  "https://fr.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1" +
    `&page=${encodeURIComponent(title)}`,
);
const text = body.parse?.wikitext?.["*"] ?? "";
const points: Record<
  string,
  { latitude: number; longitude: number; name: string; sourceUrl: string }
> = {};
const pattern =
  /\{\{[Cc]oord\|(\d+)\|(\d+)\|(\d+(?:\.\d+)?)\|N\|(\d+)\|(\d+)\|(\d+(?:\.\d+)?)\|E\|name=([^}|]+)\}\}/g;
for (const match of text.matchAll(pattern)) {
  const [, latD, latM, latS, lonD, lonM, lonS, name] = match;
  points[matchKey(`Alsace grand cru ${name!.trim()}`)] = {
    latitude: Number(latD) + Number(latM) / 60 + Number(latS) / 3600,
    longitude: Number(lonD) + Number(lonM) / 60 + Number(lonS) / 3600,
    name: name!.trim(),
    sourceUrl: `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
  };
}
writeFileSync(resolve(".kb-cache/appellations/grand-crus.json"), JSON.stringify(points, null, 2));
console.info(`${Object.keys(points).length} grand crus with their vineyard's coordinates.`);
