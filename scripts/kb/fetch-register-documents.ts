import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RegionEntry } from "./appellation-names";
import { readOfficialJournal, readTechnicalFile } from "./fetch-appellation-areas";

/**
 * Every registered name's technical file, fetched once and cached under
 * `.kb-cache/appellations/register/` — the source the atlas build reads each
 * name's wine categories and main grapes from (`register-facts.ts`). A name
 * the register holds no technical file for takes its single document from the
 * Official Journal instead. One request a second; a rerun asks only for what
 * is not cached yet.
 *
 * Usage: pnpm kb:fetch-register-documents
 */
const regions = JSON.parse(
  readFileSync(resolve("data/kb/appellations.json"), "utf8"),
) as RegionEntry[];

let read = 0;
let missing = 0;
for (const region of regions) {
  try {
    const file =
      (await readTechnicalFile(region.eambrosiaId)) ??
      (await readOfficialJournal(region.eambrosiaId));
    if (file === null) missing += 1;
    else read += 1;
  } catch (error) {
    missing += 1;
    console.warn(`  ${region.name}: ${(error as Error).message}`);
  }
  if ((read + missing) % 50 === 0) console.info(`  ${read + missing} of ${regions.length}`);
}
console.info(`${read} single documents cached; ${missing} names without one.`);
