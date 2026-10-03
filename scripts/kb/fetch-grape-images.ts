import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ImageEntry } from "./appellation-names";
import type { GrapeEntry } from "./grape-validation";
import { wikimedia, wikimediaFile } from "./wikimedia";

/**
 * A photograph for each grape that has one: the image Wikidata gives the
 * grape (P18), from Wikimedia Commons, kept only under a licence that allows
 * reuse — public domain, CC0, CC BY or CC BY-SA — and copied into the app at
 * 360 pixels. Served from the app itself, so opening a card asks nothing
 * of a third party. Author, licence and source are recorded beside it in
 * `data/kb/grape-images.json`, and the card shows them, as the licences ask.
 *
 * Usage: pnpm kb:fetch-grape-images
 */
const grapes = JSON.parse(readFileSync(resolve("data/kb/grapes.json"), "utf8")) as GrapeEntry[];
const directory = resolve("apps/web/public/library/grapes");
mkdirSync(directory, { recursive: true });
const recordPath = resolve("data/kb/grape-images.json");
const record = (
  existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : {}
) as Record<string, ImageEntry>;

// 0. A grape that has left the library takes its photograph with it.
for (const [grapeId, image] of Object.entries(record)) {
  if (grapes.some((grape) => grape.id === grapeId)) continue;
  rmSync(resolve("apps/web/public", image.path), { force: true });
  delete record[grapeId];
}

// 1. The image each grape's item names.
const fileOf = new Map<string, string>();
for (let start = 0; start < grapes.length; start += 50) {
  const batch = grapes.slice(start, start + 50);
  const body = await wikimedia<{
    entities: Record<
      string,
      { claims?: { P18?: { mainsnak: { datavalue?: { value: string } } }[] } }
    >;
  }>(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims" +
      `&ids=${batch.map((grape) => grape.wikidataId).join("|")}`,
  );
  for (const grape of batch) {
    const file = body.entities[grape.wikidataId]?.claims?.P18?.[0]?.mainsnak.datavalue?.value;
    if (file !== undefined) fileOf.set(grape.id, file);
  }
}

// Pictures looked at and found not to show the grape — a bottle, a glass, a
// vineyard from afar, a sign in a field. A grape's item names what its
// editors chose, which is not always the fruit; these stay out.
const notTheGrape = new Set([
  "arneis",
  "athiri",
  "falanghina",
  "feteasca-regala",
  "frappato",
  "godello",
  "marzemino",
  "posip",
  "prieto-picudo",
  "verdejo",
  "airen",
  "carignan",
  "folle-blanche",
  "gamaret",
  "glera",
  "grillo",
  "ribolla-gialla",
  "goruli-mtsvane",
  "kisi",
  "muscadelle",
]);
for (const grapeId of notTheGrape) fileOf.delete(grapeId);

// Pictures found on Commons by hand and looked at, for grapes whose item
// names none, or names one that is not the fruit.
const reviewedFiles: Record<string, string> = {
  // Jules Troncy's plate in Viala and Vermorel's Ampélographie (CC0).
  muscadelle: "Muscadelle - Ampélographie.jpg",
};
for (const [grapeId, file] of Object.entries(reviewedFiles)) fileOf.set(grapeId, file);

// 1b. Where Wikidata names none, the picture its Wikipedia article leads
//     with — asked only for a free one — in the first language that has one,
//     for the grapes whose article picture has been checked by eye.
// An article's lead picture is as often a bottle, a label or a landscape as
// the grape: Blatina's was a bottle, Mavrodafni's a hundred-year-old poster.
// So it is taken only for a grape whose picture has been looked at and found
// to be the grape.
const reviewedArticleImages = new Set(["castelao", "molinara"]);
for (const grape of grapes) {
  if (fileOf.has(grape.id) || record[grape.id] !== undefined) continue;
  if (!reviewedArticleImages.has(grape.id)) continue;
  const articles = [
    grape.wikipediaUrl,
    ...Object.values(grape.summaries).map((entry) => entry.url),
  ];
  for (const url of new Set(articles)) {
    const match = /^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/.exec(url);
    if (match === null) continue;
    const body = await wikimedia<{
      query?: { pages?: Record<string, { pageimage?: string }> };
    }>(
      `https://${match[1]}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages` +
        `&piprop=name&pilicense=free&redirects=1&titles=${match[2]}`,
    );
    const image = Object.values(body.query?.pages ?? {})[0]?.pageimage;
    if (image !== undefined) {
      fileOf.set(grape.id, image);
      break;
    }
  }
}

// 2. Its licence, author and a 480-pixel rendition, from Commons.
// Commons' own free licences: "Attribution" asks only for credit, and
// "Copyrighted free use" for nothing.
const free = /^(public domain|pd\b|cc0|cc[ -]by(-sa)?[ -]?\d|attribution$|copyrighted free use$)/i;
const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
let kept = 0;
for (const [grapeId, file] of fileOf) {
  if (record[grapeId] !== undefined && existsSync(resolve("apps/web/public", record[grapeId].path)))
    continue;
  const body = await wikimedia<{
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: {
            descriptionurl: string;
            extmetadata?: Record<string, { value: string } | undefined>;
            thumburl?: string;
          }[];
        }
      >;
    };
  }>(
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
      `&iiprop=url|extmetadata&iiurlwidth=480&titles=${encodeURIComponent(`File:${file}`)}`,
  );
  const info = Object.values(body.query?.pages ?? {})[0]?.imageinfo?.[0];
  const license = info?.extmetadata?.LicenseShortName?.value ?? "";
  if (info?.thumburl === undefined || !free.test(license)) {
    console.warn(`  ${grapeId}: ${file} — no free licence (${license || "none"}); skipped.`);
    continue;
  }
  const extension = /\.(jpe?g|png|webp)$/i.exec(info.thumburl)?.[1]?.toLowerCase() ?? "jpg";
  const path = `library/grapes/${grapeId}.${extension === "jpeg" ? "jpg" : extension}`;
  const target = resolve("apps/web/public", path);
  writeFileSync(target, await wikimediaFile(info.thumburl));
  // Commons' renditions are generous; at 360 pixels and quality 60 a photo is
  // about a third the size, which matters in a repository and on a phone.
  // `sips` ships with macOS; elsewhere the rendition is kept as it came.
  if (process.platform === "darwin") {
    execFileSync(
      "sips",
      ["-Z", "360", "-s", "format", "jpeg", "-s", "formatOptions", "60", target],
      {
        stdio: "ignore",
      },
    );
  }
  record[grapeId] = {
    author: strip(info.extmetadata?.Artist?.value ?? "") || "Wikimedia Commons",
    license,
    licenseUrl: info.extmetadata?.LicenseUrl?.value ?? null,
    path,
    sourceUrl: info.descriptionurl,
  };
  kept += 1;
}

writeFileSync(
  recordPath,
  `${JSON.stringify(Object.fromEntries(Object.entries(record).sort()), null, 2)}\n`,
);
console.info(
  `${fileOf.size} of ${grapes.length} grapes have an image (on Wikidata, or leading their article); ` +
    `${Object.keys(record).length} kept under a free licence (${kept} new).`,
);
