import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The library's map: Europe and its neighbours as simplified outlines, small
 * enough to ship with the app (`apps/web/src/library/europe-map.json`), so a
 * region or a grape's origin is shown on a map without asking a tile server
 * for anything. Natural Earth's 1:50m countries, public domain; download
 * `ne_50m_admin_0_countries.geojson` into `.kb-cache/map/` first.
 *
 * Usage: pnpm kb:build-map
 */
type Ring = [number, number][];
type Geometry =
  { coordinates: Ring[]; type: "Polygon" } | { coordinates: Ring[][]; type: "MultiPolygon" };
const source = JSON.parse(
  readFileSync(resolve(".kb-cache/map/ne_50m_admin_0_countries.geojson"), "utf8"),
) as { features: { geometry: Geometry; properties: Record<string, string> }[] };

// The frame: the Azores to the Caspian, the Canaries to the North Cape.
const frame = { latMax: 72, latMin: 26.5, lonMax: 45, lonMin: -32 };
const scale = 10;
const squeeze = Math.cos((49 * Math.PI) / 180);
const project = (lon: number, lat: number): [number, number] => [
  (lon - frame.lonMin) * squeeze * scale,
  (frame.latMax - lat) * scale,
];
const width = Math.round((frame.lonMax - frame.lonMin) * squeeze * scale);
const height = Math.round((frame.latMax - frame.latMin) * scale);

/** Douglas–Peucker, in projected units. */
function simplify(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 3) return points;
  const [first, last] = [points[0]!, points.at(-1)!];
  let index = 0;
  let distance = 0;
  for (let position = 1; position < points.length - 1; position += 1) {
    const [x, y] = points[position]!;
    const [dx, dy] = [last[0] - first[0], last[1] - first[1]];
    const length = Math.hypot(dx, dy) || 1;
    const away = Math.abs(dy * x - dx * y + last[0] * first[1] - last[1] * first[0]) / length;
    if (away > distance) [index, distance] = [position, away];
  }
  if (distance <= tolerance) return [first, last];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

const margin = 8;
const countries: Record<string, string> = {};
// Each country's mainland, as a box: the frame a small map zooms to, so
// Spain is not drawn at the scale of the Canaries' distance from it.
const boxes: Record<string, [number, number, number, number]> = {};
const areas: Record<string, number> = {};
for (const feature of source.features) {
  const code = feature.properties.ISO_A2_EH ?? feature.properties.ISO_A2;
  if (code === undefined || !/^[A-Z]{2}$/.test(code)) continue;
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const paths: string[] = [];
  for (const polygon of polygons) {
    const ring = polygon[0]!;
    const lons = ring.map(([lon]) => lon);
    const lats = ring.map(([, lat]) => lat);
    // Rings wholly outside the frame (French Guiana, Siberia's islands) go.
    if (
      Math.max(...lons) < frame.lonMin ||
      Math.min(...lons) > frame.lonMax ||
      Math.max(...lats) < frame.latMin ||
      Math.min(...lats) > frame.latMax
    ) {
      continue;
    }
    // What runs past the frame is pinned just beyond it, where the clip hides
    // it — Russia's far east would otherwise be most of the file.
    const projected = ring.map(([lon, lat]) => {
      const [x, y] = project(lon, lat);
      return [
        Math.min(width + margin, Math.max(-margin, x)),
        Math.min(height + margin, Math.max(-margin, y)),
      ] as [number, number];
    });
    // A ring starts and ends on the same point, which leaves Douglas–Peucker
    // no line to measure from: halve it at its farthest point first.
    const start = projected[0]!;
    let far = 0;
    projected.forEach(([x, y], position) => {
      if (
        Math.hypot(x - start[0], y - start[1]) >
        Math.hypot(projected[far]![0] - start[0], projected[far]![1] - start[1])
      )
        far = position;
    });
    const simple = [
      ...simplify(projected.slice(0, far + 1), 0.9).slice(0, -1),
      ...simplify(projected.slice(far), 0.9),
    ];
    if (simple.length < 4) continue;
    const xs = simple.map(([x]) => x);
    const ys = simple.map(([, y]) => y);
    const area = Math.abs(
      simple.reduce(
        (total, [x, y], position) =>
          total +
          x * simple[(position + 1) % simple.length]![1] -
          simple[(position + 1) % simple.length]![0] * y,
        0,
      ) / 2,
    );
    if (area > (areas[code] ?? 0)) {
      areas[code] = area;
      boxes[code] = [
        Math.round(Math.min(...xs)),
        Math.round(Math.min(...ys)),
        Math.round(Math.max(...xs)),
        Math.round(Math.max(...ys)),
      ];
    }
    paths.push(`M${simple.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`);
  }
  if (paths.length > 0) countries[code] = (countries[code] ?? "") + paths.join("");
}

const output = resolve("apps/web/src/library/europe-map.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify({ boxes, countries, frame, height, scale, squeeze, width })}\n`,
);
console.info(
  `${Object.keys(countries).length} countries, ${Math.round(
    JSON.stringify(countries).length / 1024,
  )} KiB, ${width}×${height}.`,
);
