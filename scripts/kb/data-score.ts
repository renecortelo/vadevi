import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * How complete the wine library is, as one number to follow while looking for
 * more data: the plain mean of each field's coverage, ten for the grapes and
 * seven for the regions, every field weighing the same. Tannin counts against
 * red and pink grapes only — a white grape has none to find.
 *
 * Beside a field, the gaps that are not for want of looking: data whose
 * licence we declined (Chile's, non-commercial), data waiting on a
 * publisher's permission (Portugal's IVV, the VIVC) and data whose
 * publisher has not been asked yet (Italy's Federdoc and ISMEA). They still count as
 * gaps; the line only says why they are there. The rest of a field's gaps
 * are those no open source we have found fills. At the end, the points each
 * cause keeps from the score, and the score the permissions would give.
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
  countryCode: string;
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

type Why = "awaiting permission" | "licence declined" | "permission not asked yet";
type Row = { have: number; label: string; total: number; why: Map<Why, number> };
const row = <T>(
  label: string,
  pool: T[],
  has: (item: T) => unknown,
  blocked: (item: T) => Why | null = () => null,
): Row => {
  const why = new Map<Why, number>();
  for (const item of pool.filter((one) => !has(one))) {
    const reason = blocked(item);
    if (reason !== null) why.set(reason, (why.get(reason) ?? 0) + 1);
  }
  return { have: pool.filter((item) => Boolean(has(item))).length, label, total: pool.length, why };
};
/**
 * Chile's zoning is non-commercial (declined); Portugal's figures await the
 * IVV; Italy's, by DOC, are Federdoc's and ISMEA's, not yet asked for.
 */
const regionBlocked = (region: Region): Why | null =>
  region.countryCode === "CL"
    ? "licence declined"
    : region.countryCode === "PT"
      ? "awaiting permission"
      : region.countryCode === "IT"
        ? "permission not asked yet"
        : null;
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
  // The VIVC gives every cultivar's origin; its reuse awaits permission.
  row(
    "origin",
    grapes,
    (grape) => grape.origin,
    () => "awaiting permission",
  ),
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
    (region) => (region.countryCode === "CL" ? "licence declined" : null),
  ),
  row("vineyard area", regions, (region) => region.figures?.planted, regionBlocked),
  row("production", regions, (region) => region.figures?.production, regionBlocked),
];

const percent = ({ have, total }: Row) => (100 * have) / total;
const mean = (rows: Row[]) => rows.reduce((sum, item) => sum + percent(item), 0) / rows.length;
const print = (title: string, rows: Row[]) => {
  console.info(`${title} — ${mean(rows).toFixed(1)} / 100`);
  for (const item of rows) {
    const blocked = [...item.why.values()].reduce((sum, count) => sum + count, 0);
    const open = item.total - item.have - blocked;
    const why = [
      ...[...item.why].map(([reason, count]) => `${count} ${reason}`),
      ...(blocked > 0 && open > 0 ? [`${open} no open source`] : []),
    ].join(", ");
    console.info(
      `  ${item.label.padEnd(24)} ${String(item.have).padStart(5)} / ${String(item.total).padEnd(5)} ${percent(item).toFixed(1).padStart(5)} %` +
        (why === "" ? "" : `   (of the gaps: ${why})`),
    );
  }
};

const rows = [...grapeRows, ...regionRows];
print(`Grapes (${grapes.length})`, grapeRows);
print(`Regions (${regions.length})`, regionRows);
const score = mean(rows);
console.info(`Library score: ${score.toFixed(1)} / 100`);

// The points each cause of the gaps keeps from the score: one field weighs
// 100 / fields, and a gap its share of that field.
const pointsFor = (count: (item: Row) => number) =>
  rows.reduce((sum, item) => sum + (100 * count(item)) / item.total, 0) / rows.length;
const awaiting = pointsFor((item) => item.why.get("awaiting permission") ?? 0);
const unasked = pointsFor((item) => item.why.get("permission not asked yet") ?? 0);
const declined = pointsFor((item) => item.why.get("licence declined") ?? 0);
const unfound = 100 - score - awaiting - unasked - declined;
console.info(
  `  Missing ${(100 - score).toFixed(1)}: ${awaiting.toFixed(1)} awaiting permission, ${unasked.toFixed(1)} permission not asked yet, ${declined.toFixed(1)} licence declined, ${unfound.toFixed(1)} with no open source found.`,
);
console.info(
  `  With every permission granted: ${(score + awaiting + unasked).toFixed(1)}; with the declined licence too: ${(score + awaiting + unasked + declined).toFixed(1)}.`,
);
