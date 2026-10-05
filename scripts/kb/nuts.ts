import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey } from "./appellation-names";
import { userAgent } from "./wikimedia";

/**
 * The EU's statistical regions (NUTS), as Eurostat's GISCO service publishes
 * them: each region's outline and a label point inside it, for every edition
 * of the classification since 2003. The register's technical files name the
 * regions a wine is made in by code and name ("GR121 Ημαθία"); codes change
 * between editions (Greece's "GR" became "EL"), so a code is read in the
 * edition where it carries the name the file gives, or else the edition of
 * the file's time.
 *
 * © EuroGeographics for the administrative boundaries; reused under
 * Eurostat's copyright notice. Cached under `.kb-cache/nuts/`.
 */
const cache = resolve(".kb-cache/nuts");
/** The file's time first: technical files were written in 2009–2014. */
const editions = ["2006", "2010", "2013", "2003", "2016", "2021", "2024"] as const;

type Ring = [number, number][];
type Geometry =
  { coordinates: Ring[]; type: "Polygon" } | { coordinates: Ring[][]; type: "MultiPolygon" };
type Feature<G> = {
  geometry: G;
  properties: { NAME_LATN?: string; NUTS_ID: string; NUTS_NAME?: string };
};
export type Point = { latitude: number; longitude: number };
export type NutsRegion = {
  code: string;
  edition: string;
  geometry: Geometry;
  label: Point;
  name: string;
};

async function load<G>(kind: "LB" | "RG_20M", edition: string): Promise<Feature<G>[]> {
  mkdirSync(cache, { recursive: true });
  const path = resolve(cache, `NUTS_${kind}_${edition}_4326.geojson`);
  if (!existsSync(path)) {
    const response = await fetch(
      `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_${kind}_${edition}_4326.geojson`,
      { headers: { "User-Agent": userAgent } },
    );
    if (!response.ok) throw new Error(`GISCO NUTS ${kind} ${edition}: HTTP ${response.status}`);
    writeFileSync(path, await response.text());
  }
  return (JSON.parse(readFileSync(path, "utf8")) as { features: Feature<G>[] }).features;
}

const loaded = new Map<
  string,
  {
    labels: Map<string, Feature<{ coordinates: [number, number] }>>;
    shapes: Map<string, Feature<Geometry>>;
  }
>();
async function edition(year: string) {
  const known = loaded.get(year);
  if (known !== undefined) return known;
  const labels = new Map(
    (await load<{ coordinates: [number, number] }>("LB", year)).map((feature) => [
      feature.properties.NUTS_ID,
      feature,
    ]),
  );
  const shapes = new Map(
    (await load<Geometry>("RG_20M", year)).map((feature) => [feature.properties.NUTS_ID, feature]),
  );
  const value = { labels, shapes };
  loaded.set(year, value);
  return value;
}

const sameName = (a: string | undefined, b: string) => {
  if (a === undefined) return false;
  const left = matchKey(a);
  const right = matchKey(b);
  return left.length > 0 && right.length > 0 && (left.includes(right) || right.includes(left));
};

/** The region a technical file means by a code and the name written after it. */
export async function nutsRegion(code: string, name: string): Promise<NutsRegion | null> {
  let fallback: NutsRegion | null = null;
  for (const year of editions) {
    const { labels, shapes } = await edition(year);
    const shape = shapes.get(code);
    const label = labels.get(code);
    if (shape === undefined || label === undefined) continue;
    const region: NutsRegion = {
      code,
      edition: year,
      geometry: shape.geometry,
      label: { latitude: label.geometry.coordinates[1], longitude: label.geometry.coordinates[0] },
      name: shape.properties.NAME_LATN ?? shape.properties.NUTS_NAME ?? code,
    };
    if (sameName(shape.properties.NUTS_NAME, name) || sameName(shape.properties.NAME_LATN, name))
      return region;
    fallback ??= region;
  }
  return fallback;
}

function inRing(point: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (
      yi > point.latitude !== yj > point.latitude &&
      point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

/** Whether a point lies inside a region's outline (its holes excluded). */
export function insideRegion(point: Point, region: NutsRegion): boolean {
  const polygons =
    region.geometry.type === "Polygon"
      ? [region.geometry.coordinates]
      : region.geometry.coordinates;
  return polygons.some(
    ([outer, ...holes]) =>
      outer !== undefined && inRing(point, outer) && !holes.some((hole) => inRing(point, hole)),
  );
}
