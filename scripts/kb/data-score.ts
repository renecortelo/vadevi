import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * How complete the wine library is, as one number to follow while looking for
 * more data: the plain mean of each field's coverage, ten for the grapes and
 * seven for the regions, every field weighing the same. Tannin counts against
 * red and pink grapes only — a white grape has none to find.
 *
 * Usage: pnpm kb:score
 */

const locales = ["en", "es", "ca", "fr", "de", "it", "nl", "pt"] as const;

type Grape = {
  acidity: string | null;
  alcohol: string | null;
  aromas: string[];
  body: string | null;
  color: string | null;
  names: Record<string, string>;
  origin: string | null;
  pairings: string[];
  summaries: Record<string, unknown>;
  sweetness: unknown;
  tannin: string | null;
};

type Region = {
  climate?: { elevation?: number | null } | null;
  figures?: { planted: unknown; production: unknown } | null;
  grapes: unknown[];
  latitude: number | null;
  register?: { grapes: unknown[] } | null;
  summaries: Record<string, unknown>;
};

const read = <T>(path: string) => JSON.parse(readFileSync(resolve(path), "utf8")) as T;
const grapes = read<Grape[]>("data/kb/grapes.json");
const regions = read<Region[]>("data/kb/appellations.json");

type Row = { have: number; label: string; total: number };
const row = <T>(label: string, pool: T[], has: (item: T) => unknown): Row => ({
  have: pool.filter((item) => Boolean(has(item))).length,
  label,
  total: pool.length,
});
const inEvery = (texts: Record<string, unknown> | undefined) =>
  locales.every((locale) => Boolean(texts?.[locale]));

const reds = grapes.filter((grape) => grape.color === "red" || grape.color === "pink");
const grapeRows: Row[] = [
  row("aromas", grapes, (grape) => grape.aromas.length > 0),
  row("acidity", grapes, (grape) => grape.acidity),
  row("tannin (red and pink)", reds, (grape) => grape.tannin),
  row("body", grapes, (grape) => grape.body),
  row("alcohol", grapes, (grape) => grape.alcohol),
  row("dry or sweet", grapes, (grape) => grape.sweetness),
  row("summary, 8 languages", grapes, (grape) => inEvery(grape.summaries)),
  row("own name, 8 languages", grapes, (grape) => inEvery(grape.names)),
  row("origin", grapes, (grape) => grape.origin),
  row("pairings", grapes, (grape) => grape.pairings.length > 0),
];
const regionRows: Row[] = [
  row("summary, 8 languages", regions, (region) => inEvery(region.summaries)),
  row("climate", regions, (region) => region.climate),
  row("elevation", regions, (region) => typeof region.climate?.elevation === "number"),
  row("point on the map", regions, (region) => region.latitude !== null),
  row(
    "grapes",
    regions,
    (region) => (region.register?.grapes.length ?? 0) > 0 || region.grapes.length > 0,
  ),
  row("vineyard area", regions, (region) => region.figures?.planted),
  row("production", regions, (region) => region.figures?.production),
];

const percent = ({ have, total }: Row) => (100 * have) / total;
const mean = (rows: Row[]) => rows.reduce((sum, item) => sum + percent(item), 0) / rows.length;
const print = (title: string, rows: Row[]) => {
  console.info(`${title} — ${mean(rows).toFixed(1)} / 100`);
  for (const item of rows) {
    console.info(
      `  ${item.label.padEnd(24)} ${String(item.have).padStart(5)} / ${String(item.total).padEnd(5)} ${percent(item).toFixed(1).padStart(5)} %`,
    );
  }
};

print(`Grapes (${grapes.length})`, grapeRows);
print(`Regions (${regions.length})`, regionRows);
console.info(`Library score: ${mean([...grapeRows, ...regionRows]).toFixed(1)} / 100`);
