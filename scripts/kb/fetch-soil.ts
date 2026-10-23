import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { userAgent } from "./wikimedia";

/**
 * The soil under each point the climate was read at
 * (`data/kb/region-climate.json`): clay, silt and sand, pH in water and
 * organic carbon in the top 30 cm, from ISRIC's SoilGrids 2.0 (Poggio et al.
 * 2021, SOIL 7, 217–240; CC BY 4.0) through its REST API. One point a
 * request and twelve seconds apart, as ISRIC asks of its free service: some
 * nine hours for every point, each answer cached
 * (`.kb-cache/soil/<id>.json`) so a run stopped half-way picks up where it
 * left. The three depths (0–5, 5–15, 15–30 cm) are averaged by thickness;
 * the result goes to `data/kb/region-soil.json`. A point on water, rock or
 * town has no soil to give and is left out.
 *
 * Usage: pnpm kb:fetch-soil
 */
const climate = JSON.parse(readFileSync(resolve("data/kb/region-climate.json"), "utf8")) as {
  regions: Record<string, { point: [number, number] }>;
};
const cache = resolve(".kb-cache/soil");
mkdirSync(cache, { recursive: true });

type Layer = {
  depths: { label: string; values: { mean: number | null } }[];
  name: string;
  unit_measure: { d_factor: number };
};
const properties = ["clay", "silt", "sand", "phh2o", "soc"] as const;
const thickness: Record<string, number> = { "0-5cm": 5, "15-30cm": 15, "5-15cm": 10 };

async function answer(id: string, [latitude, longitude]: [number, number]) {
  const path = resolve(cache, `${id}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as { layers: Layer[] };
  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${longitude.toFixed(5)}` +
    `&lat=${latitude.toFixed(5)}&${properties.map((name) => `property=${name}`).join("&")}` +
    "&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    // A request the service never answers is tried again, like a refused one.
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(120_000),
    }).catch(() => null);
    if (response?.ok) {
      const body = (await response.json()) as { properties: { layers: Layer[] } };
      writeFileSync(path, JSON.stringify(body.properties));
      await new Promise((done) => setTimeout(done, 12_000));
      return body.properties;
    }
    await new Promise((done) => setTimeout(done, 60_000 * attempt));
  }
  throw new Error(`SoilGrids failed at ${id}.`);
}

const regions: Record<string, Record<(typeof properties)[number], number>> = {};
const ids = Object.keys(climate.regions).sort();
for (const [index, id] of ids.entries()) {
  const { layers } = await answer(id, climate.regions[id]!.point);
  const values: Partial<Record<(typeof properties)[number], number>> = {};
  for (const layer of layers) {
    const read = layer.depths.filter((depth) => depth.values.mean !== null);
    if (read.length !== 3) continue;
    const sum = read.reduce(
      (total, depth) => total + depth.values.mean! * thickness[depth.label]!,
      0,
    );
    values[layer.name as (typeof properties)[number]] =
      Math.round((sum / 30 / layer.unit_measure.d_factor) * 10) / 10;
  }
  if (properties.every((name) => values[name] !== undefined)) {
    regions[id] = values as Record<(typeof properties)[number], number>;
  }
  if ((index + 1) % 100 === 0) console.info(`  ${index + 1} of ${ids.length} points read.`);
}
writeFileSync(
  resolve("data/kb/region-soil.json"),
  `${JSON.stringify(
    {
      about:
        "Clay, silt and sand (%), pH in water and organic carbon (g/kg) in the top 30 cm at each name's point, averaged over SoilGrids 2.0's 0–5, 5–15 and 15–30 cm layers by their thickness (ISRIC; Poggio et al. 2021, SOIL 7, 217–240; CC BY 4.0). `pnpm kb:fetch-soil`.",
      regions,
    },
    null,
    1,
  )}\n`,
);
console.info(`Soil for ${Object.keys(regions).length} of ${ids.length} points.`);
