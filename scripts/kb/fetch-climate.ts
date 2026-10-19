import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

import { userAgent } from "./wikimedia";

/**
 * The monthly climate at each registered name's point on the map, 1981–2010,
 * read from CHELSA V2.1 (Karger et al. 2017, 2021; CC0 1.0): mean air
 * temperature and precipitation for each month. The files are 43 200 × 20 880
 * GeoTIFFs of one row per strip, so only the rows the points fall on are read,
 * by byte range — a few hundred kilobytes a month, not the 120 MB of each file.
 *
 * Usage: pnpm kb:fetch-climate
 */
const base = "https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010/";
const outPath = resolve("data/kb/region-climate.json");

async function range(url: string, start: number, length: number): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${start + length - 1}`, "User-Agent": userAgent },
      });
      if (response.status !== 206) throw new Error(`${url}: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 6) throw error;
      await new Promise((done) => setTimeout(done, 5000 * attempt));
    }
  }
}

type Raster = {
  counts: number[];
  offsets: number[];
  originX: number;
  originY: number;
  pixel: number;
  scale: number;
  shift: number;
  url: string;
};

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u16 = (bytes: Uint8Array, at: number) => view(bytes).getUint16(at, true);
const u32 = (bytes: Uint8Array, at: number) => view(bytes).getUint32(at, true);

/** The few tags of a little-endian, deflated, one-row-per-strip GeoTIFF. */
async function openRaster(url: string): Promise<Raster> {
  const head = await range(url, 0, 1 << 20);
  if (head[0] !== 0x49 || head[1] !== 0x49 || u16(head, 2) !== 42) {
    throw new Error(`${url}: not a little-endian classic TIFF`);
  }
  const at = async (offset: number, length: number) =>
    offset + length <= head.length
      ? head.subarray(offset, offset + length)
      : await range(url, offset, length);
  const ifd = u32(head, 4);
  const entries = u16(head, ifd);
  const size: Record<number, number> = { 2: 1, 3: 2, 4: 4, 12: 8 };
  const tags = new Map<number, Uint8Array>();
  const types = new Map<number, number>();
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    const tag = u16(head, entry);
    types.set(tag, u16(head, entry + 2));
    const length = (size[u16(head, entry + 2)] ?? 1) * u32(head, entry + 4);
    tags.set(
      tag,
      length <= 4
        ? head.subarray(entry + 8, entry + 8 + length)
        : await at(u32(head, entry + 8), length),
    );
  }
  // Offsets and counts are SHORT or LONG, as the writer chose.
  const longs = (tag: number) => {
    const buffer = tags.get(tag)!;
    const width = types.get(tag) === 3 ? 2 : 4;
    return Array.from({ length: buffer.length / width }, (_, index) =>
      width === 2 ? u16(buffer, index * 2) : u32(buffer, index * 4),
    );
  };
  const doubles = (tag: number) => {
    const buffer = tags.get(tag)!;
    return Array.from({ length: buffer.length / 8 }, (_, index) =>
      view(buffer).getFloat64(index * 8, true),
    );
  };
  if (u16(tags.get(259)!, 0) !== 8 || u16(tags.get(317)!, 0) !== 2) {
    throw new Error(`${url}: expected deflate with horizontal predictor`);
  }
  if (longs(278)[0] !== 1) {
    throw new Error(`${url}: expected one row per strip`);
  }
  const metadata = new TextDecoder("latin1").decode(tags.get(42112));
  const item = (role: string) =>
    Number(new RegExp(`role="${role}">([^<]+)<`).exec(metadata)?.[1] ?? Number.NaN);
  const tiepoint = doubles(33922);
  return {
    counts: longs(279),
    offsets: longs(273),
    originX: tiepoint[3]!,
    originY: tiepoint[4]!,
    pixel: doubles(33550)[0]!,
    scale: item("scale"),
    shift: item("offset"),
    url,
  };
}

type Point = { id: string; latitude: number; longitude: number };

/** Each point's value in one raster, reading every row it needs once. */
async function sample(raster: Raster, points: Point[]): Promise<Map<string, number>> {
  const byRow = new Map<number, { column: number; id: string }[]>();
  for (const point of points) {
    const row = Math.floor((raster.originY - point.latitude) / raster.pixel);
    const column = Math.floor((point.longitude - raster.originX) / raster.pixel);
    byRow.set(row, [...(byRow.get(row) ?? []), { column, id: point.id }]);
  }
  const values = new Map<string, number>();
  const rows = [...byRow.keys()];
  // Four reads at a time: a university's object store, read politely.
  for (let start = 0; start < rows.length; start += 4) {
    await Promise.all(
      rows.slice(start, start + 4).map(async (row) => {
        const bytes = inflateSync(
          await range(raster.url, raster.offsets[row]!, raster.counts[row]!),
        );
        const wanted = byRow.get(row)!;
        const last = Math.max(...wanted.map((entry) => entry.column));
        // The horizontal predictor stores each pixel as the difference from
        // the one before it.
        const data = view(bytes);
        const running: number[] = [];
        let value = 0;
        for (let column = 0; column <= last; column += 1) {
          value = (value + data.getUint16(column * 2, true)) & 0xffff;
          running.push(value);
        }
        for (const { column, id } of wanted) {
          // The sea, and anywhere CHELSA has no value, is the format's nodata.
          if (running[column] === 0xffff) continue;
          values.set(id, running[column]! * raster.scale + raster.shift);
        }
      }),
    );
  }
  return values;
}

const points = (
  JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as {
    id: string;
    latitude: number | null;
    longitude: number | null;
  }[]
).filter((entry): entry is Point => entry.latitude !== null && entry.longitude !== null);

const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const tas = new Map<string, number[]>();
const pr = new Map<string, number[]>();
for (const [variable, into] of [
  ["tas", tas],
  ["pr", pr],
] as const) {
  for (const month of months) {
    const raster = await openRaster(
      `${base}${variable}/CHELSA_${variable}_${month}_1981-2010_V.2.1.tif`,
    );
    const values = await sample(raster, points);
    for (const [id, value] of values) into.set(id, [...(into.get(id) ?? []), value]);
    console.info(`  ${variable} ${month}: ${values.size} points.`);
  }
}

const previous = existsSync(outPath)
  ? (JSON.parse(readFileSync(outPath, "utf8")) as { regions: Record<string, unknown> }).regions
  : {};
const regions = Object.fromEntries(
  points
    .filter((point) => tas.get(point.id)?.length === 12 && pr.get(point.id)?.length === 12)
    .map((point) => [
      point.id,
      {
        point: [point.latitude, point.longitude],
        pr: pr.get(point.id)!.map((value) => Math.round(value)),
        tas: tas.get(point.id)!.map((value) => Math.round(value * 10) / 10),
      },
    ]),
);
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      about:
        "Monthly mean air temperature (°C) and precipitation (mm) at each registered name's point on the map, 1981–2010, January first, from CHELSA V2.1 (Karger, D.N. et al. 2017, Climatologies at high resolution for the earth's land surface areas, Scientific Data 4, 170122; data: Karger et al. 2021, EnviDat, doi:10.16904/envidat.228), CC0 1.0. `point` is where it was read; a build attaches it only while the name's point is the same. A point is approximate for a large area: one value for its middle.",
      regions,
    },
    null,
    1,
  )}\n`,
);
console.info(
  `Climate for ${Object.keys(regions).length} of ${points.length} points (${Object.keys(previous).length} before).`,
);
