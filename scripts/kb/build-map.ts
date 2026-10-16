import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The library's maps: simplified outlines small enough to ship with the app,
 * so a region or a grape's origin is shown on a map without asking a tile
 * server for anything — one sheet for Europe and its neighbours
 * (`apps/web/src/library/europe-map.json`), one each for North America
 * (`america-map.json`), South America (`south-america-map.json`), Oceania (`oceania-map.json`) and southern Africa
 * (`africa-map.json`), each in its own frame. Natural Earth's 1:50m
 * countries, public domain; download `ne_50m_admin_0_countries.geojson` into
 * `.kb-cache/map/` first.
 *
 * Usage: pnpm kb:build-map
 */
type Ring = [number, number][];
type Geometry =
  { coordinates: Ring[]; type: "Polygon" } | { coordinates: Ring[][]; type: "MultiPolygon" };
const source = JSON.parse(
  readFileSync(resolve(".kb-cache/map/ne_50m_admin_0_countries.geojson"), "utf8"),
) as { features: { geometry: Geometry; properties: Record<string, string> }[] };

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

/**
 * One sheet: the countries inside `frame`, projected with each degree of
 * longitude squeezed by the cosine of the sheet's middle latitude.
 */
function buildSheet(
  file: string,
  frame: { latMax: number; latMin: number; lonMax: number; lonMin: number },
  middleLatitude: number,
) {
  const scale = 10;
  const squeeze = Math.cos((middleLatitude * Math.PI) / 180);
  const project = (lon: number, lat: number): [number, number] => [
    (lon - frame.lonMin) * squeeze * scale,
    (frame.latMax - lat) * scale,
  ];
  const width = Math.round((frame.lonMax - frame.lonMin) * squeeze * scale);
  const height = Math.round((frame.latMax - frame.latMin) * scale);

  const margin = 8;
  const countries: Record<string, string> = {};
  // Each country's mainland, as a box: the frame a small map zooms to, so
  // Spain is not drawn at the scale of the Canaries' distance from it.
  const boxes: Record<string, [number, number, number, number]> = {};
  const rings: { area: number; box: [number, number, number, number]; code: string }[] = [];
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
      // A ring pinned wholly beyond the frame has no area to frame.
      if (area > 0)
        rings.push({
          area,
          box: [
            Math.round(Math.min(...xs)),
            Math.round(Math.min(...ys)),
            Math.round(Math.max(...xs)),
            Math.round(Math.max(...ys)),
          ],
          code,
        });
      paths.push(`M${simple.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`);
    }
    if (paths.length > 0) countries[code] = (countries[code] ?? "") + paths.join("");
  }
  // The mainland is the largest piece, and any at least half its size: New
  // Zealand's two islands; not the Canaries, Sicily or Alaska.
  for (const code of new Set(rings.map((ring) => ring.code))) {
    const own = rings.filter((ring) => ring.code === code);
    const largest = Math.max(...own.map((ring) => ring.area));
    const main = own.filter((ring) => ring.area >= largest / 2).map((ring) => ring.box);
    boxes[code] = [
      Math.min(...main.map((box) => box[0])),
      Math.min(...main.map((box) => box[1])),
      Math.max(...main.map((box) => box[2])),
      Math.max(...main.map((box) => box[3])),
    ];
  }

  const output = resolve("apps/web/src/library", file);
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
}

// Europe: the Azores to the Caspian, the Canaries to the North Cape.
buildSheet("europe-map.json", { latMax: 72, latMin: 26.5, lonMax: 45, lonMin: -32 }, 49);
// The Americas' wine countries so far: the United States from Hawaii to
// Maine, with Canada and Mexico around it for bearings.
buildSheet("america-map.json", { latMax: 62, latMin: 15, lonMax: -52, lonMin: -162 }, 38);
// South America: Chile, Argentina and Brazil's wine country, from the Vale
// do São Francisco (9° S) south, with their neighbours.
buildSheet("south-america-map.json", { latMax: -6, latMin: -56, lonMax: -34, lonMin: -82 }, -35);
// Oceania: New Zealand, with Australia beside it.
buildSheet("oceania-map.json", { latMax: -9, latMin: -48, lonMax: 179.5, lonMin: 112 }, -36);
// Southern Africa: South Africa and its neighbours.
buildSheet("africa-map.json", { latMax: -15, latMin: -35.5, lonMax: 37, lonMin: 10 }, -27);
