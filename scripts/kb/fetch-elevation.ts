import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { userAgent } from "./wikimedia";

/**
 * The height above the sea of each point the climate was read at
 * (`data/kb/region-climate.json`), from the Copernicus DEM GLO-90 (90 m) as
 * Open-Meteo's elevation API serves it — free for non-commercial use, under
 * CC BY 4.0, crediting the Copernicus programme and Open-Meteo. A hundred
 * points a request, a second apart: some thirty requests in all.
 *
 * Usage: pnpm kb:fetch-elevation (after pnpm kb:fetch-climate)
 */
const path = resolve("data/kb/region-climate.json");
const file = JSON.parse(readFileSync(path, "utf8")) as {
  about: string;
  regions: Record<string, { elevation?: number | null; point: [number, number] }>;
};
const ids = Object.keys(file.regions);
let read = 0;
for (let start = 0; start < ids.length; start += 100) {
  const batch = ids.slice(start, start + 100);
  const points = batch.map((id) => file.regions[id]!.point);
  const url = `https://api.open-meteo.com/v1/elevation?${new URLSearchParams({
    latitude: points.map((point) => point[0].toFixed(5)).join(","),
    longitude: points.map((point) => point[1].toFixed(5)).join(","),
  })}`;
  let elevations: (number | null)[] | null = null;
  for (let attempt = 1; attempt <= 5 && elevations === null; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok)
      elevations = ((await response.json()) as { elevation: (number | null)[] }).elevation;
    else await new Promise((done) => setTimeout(done, 10_000 * attempt));
  }
  if (elevations === null) throw new Error(`Elevation failed at ${start}.`);
  batch.forEach((id, index) => {
    const elevation = elevations[index];
    // The sea, where a coastal point falls in it, has no height to give.
    file.regions[id]!.elevation =
      elevation === null || elevation === undefined || Number.isNaN(elevation)
        ? null
        : Math.round(elevation);
    if (file.regions[id]!.elevation !== null) read += 1;
  });
  await new Promise((done) => setTimeout(done, 1_000));
}
if (!file.about.includes("Copernicus")) {
  file.about +=
    " `elevation`: metres above sea level at the point, from the Copernicus DEM GLO-90 via Open-Meteo's elevation API (CC BY 4.0; doi:10.5270/ESA-c5d3d65).";
}
writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
console.info(`Elevation for ${read} of ${ids.length} points.`);
