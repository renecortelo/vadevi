import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ImageEntry, TopicEntry } from "./appellation-names";
import { creditName } from "./image-credit";
import { wikimedia, wikimediaFile } from "./wikimedia";

/**
 * A picture for each style and method that has one: the image Wikidata gives
 * its item (P18) — or, where it gives none, one chosen by hand on Commons
 * that shows the style or the method itself — kept only under a licence that
 * allows reuse — public domain, CC0, CC BY or CC BY-SA — and copied into the
 * app at 360 pixels, as the grapes' are. Author, licence and source are
 * recorded in `data/kb/topic-images.json`, and the page shows them.
 *
 * Usage: pnpm kb:fetch-topic-images
 */
const topics = JSON.parse(readFileSync(resolve("data/kb/topics.json"), "utf8")) as TopicEntry[];
const directory = resolve("apps/web/public/library/topics");
mkdirSync(directory, { recursive: true });
const recordPath = resolve("data/kb/topic-images.json");
const record = (
  existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : {}
) as Record<string, ImageEntry>;

// Pictures looked at and found not to show the style or the method.
const notIt = new Set<string>([]);

// Chosen by hand on Commons for items Wikidata gives no picture: each shows
// the thing itself (a riddling rack, a dosage machine, a fining agent going
// into a tank). Styles and methods with nothing that shows them stay
// without one: pét-nat, natural wine, malolactic fermentation,
// chaptalisation, wine faults, cork taint, late harvest, carbonic maceration;
// kosher wine (the bottle Commons has is grape juice) and sulfites (the
// words on the label do not read at 360 pixels).
const chosen: Record<string, string> = {
  aging:
    "Oak barrels used for aging of wine in a cellar at Grover Zampa Vineyard, Doddaballapura, Karnataka, India.jpg",
  "biodynamic-wine": "Biodynamic sheep grazing vineyard for weeds.jpg",
  clarification: "Semillon tank getting Bentonite addition.JPG",
  dosage: "Pol Roger disgorgement line 5-dosage.jpg",
  fermentation: "Wine fermentation tanks in a winery in Tarija.jpg",
  maceration: "Pigeage in a wine barrel.jpg",
  "organic-wine": "Organic Chianti vineyard with expansive cover crop Italia 2010.jpg",
  sweetness: "Malaga wine glass.JPG",
  terroir: "Rocky vineyard soil terroir-la-peira.jpg",
  "traditional-method": "Champagne bottles in riddling rack.jpg",
  "vegan-wine": "Vegan-wine.jpg",
  vintage: "Grape harvest - La vendemmia.jpg",
};

for (const [topicId, image] of Object.entries(record)) {
  if (topics.some((topic) => topic.id === topicId) && !notIt.has(topicId)) continue;
  rmSync(resolve("apps/web/public", image.path), { force: true });
  delete record[topicId];
}

const fileOf = new Map<string, string>();
const withItem = topics.filter((topic) => topic.wikidataId !== null && !notIt.has(topic.id));
for (let start = 0; start < withItem.length; start += 50) {
  const batch = withItem.slice(start, start + 50);
  const body = await wikimedia<{
    entities: Record<
      string,
      { claims?: { P18?: { mainsnak: { datavalue?: { value: string } } }[] } }
    >;
  }>(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims" +
      `&ids=${batch.map((topic) => topic.wikidataId).join("|")}`,
  );
  for (const topic of batch) {
    const file = body.entities[topic.wikidataId!]?.claims?.P18?.[0]?.mainsnak.datavalue?.value;
    if (file !== undefined) fileOf.set(topic.id, file);
  }
}
for (const [topicId, file] of Object.entries(chosen)) {
  if (!fileOf.has(topicId)) fileOf.set(topicId, file);
}

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
for (const [topicId, file] of fileOf) {
  if (record[topicId] !== undefined && existsSync(resolve("apps/web/public", record[topicId].path)))
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
    console.warn(`  ${topicId}: ${file} — no free licence (${license || "none"}); skipped.`);
    continue;
  }
  const path = `library/topics/${topicId}.jpg`;
  const target = resolve("apps/web/public", path);
  writeFileSync(target, await wikimediaFile(info.thumburl));
  if (process.platform === "darwin") {
    execFileSync(
      "sips",
      ["-Z", "360", "-s", "format", "jpeg", "-s", "formatOptions", "60", target],
      { stdio: "ignore" },
    );
  }
  record[topicId] = {
    author: creditName(strip(info.extmetadata?.Artist?.value ?? "")) || "Wikimedia Commons",
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
  `${fileOf.size} of ${topics.length} styles and methods have an image on Wikidata; ` +
    `${Object.keys(record).length} kept under a free licence (${kept} new).`,
);
