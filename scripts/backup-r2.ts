import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Back up the media bucket, using D1 as the index and the recorded hash as proof.
 *
 * A D1 export is not a backup of this application. It carries `media_assets`
 * rows; the photographs are bytes in R2, so restoring the database alone gives
 * you a row for every bottle and a label for none of them. The restore drill on
 * 2026-09-17 is what made that concrete, and this exists so the other half is
 * not something anyone has to remember to do by hand.
 *
 * Three decisions worth knowing about.
 *
 * It drives `wrangler`, which is already authenticated, rather than an S3 client
 * against an R2 API token. No new credential has to be created, stored, or
 * rotated to take a backup — and a backup procedure gated behind a secret is a
 * backup procedure that stops being run. The cost is one process per object,
 * which is fine at this scale and would not be at a hundred thousand; `rclone`
 * against an R2 remote is the answer then, and that does need a token.
 *
 * It verifies rather than assumes. Every row records a `sha256`, so each
 * download is hashed and compared. A truncated transfer, a byte that rotted, an
 * object replaced by another — each one looks like a successful backup until
 * something checks. A single failure exits non-zero, because a backup you are
 * told is good and is not is worse than none at all.
 *
 * Objects the database does not know about are not fetched. An orphan in the
 * bucket is unreferenced by definition, and restoring it would put back
 * something nothing points at.
 *
 * Usage: pnpm backup:r2 [output-directory] [--config wrangler.preview.jsonc]
 */

const configFlag = process.argv.indexOf("--config");
const config = configFlag === -1 ? "wrangler.preview.jsonc" : (process.argv[configFlag + 1] ?? "");
const positional = process.argv
  .slice(2)
  .filter((argument, index, all) => !argument.startsWith("--") && all[index - 1] !== "--config");
// By default the backup goes beside the repository, not inside it: it holds
// every photograph in the Space, and a directory inside the working tree is
// one careless `git add` from a public record. (The pattern is ignored too,
// and the release scan refuses it; this is the first of three lines.)
const outputDirectory = resolve(
  positional[0] ?? `../vadevi-backups/r2-backup-${new Date().toISOString().slice(0, 10)}`,
);

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!existsSync(config)) {
  fail(
    `backup:r2: ${config} does not exist.\n` +
      "That file is the deployment's own configuration and is deliberately not in\n" +
      "the repository. See docs/self-hosting.md.",
  );
}

const configText = readFileSync(config, "utf8");
const databaseMatch = /"database_name"\s*:\s*"([^"]+)"/.exec(configText)?.[1];
const bucketMatch = /"bucket_name"\s*:\s*"([^"]+)"/.exec(configText)?.[1];
if (databaseMatch === undefined) fail(`backup:r2: no database_name in ${config}.`);
if (bucketMatch === undefined) fail(`backup:r2: no bucket_name in ${config}.`);

// Narrowed once here rather than asserted at each use: left optional, the
// spawnSync overload below silently resolves to the Buffer-returning form and
// the JSON parse fails somewhere far from the cause.
const database: string = databaseMatch;
const bucket: string = bucketMatch;

/** One object to fetch, and what it must be when it arrives. */
type Asset = { byteSize: number; key: string; mimeType: string; sha256: string };

/**
 * Every live object, from the database that indexes them.
 *
 * `reserved` rows are skipped because an upload that never finished may have no
 * object behind it, and soft-deleted ones are on their way out of the bucket.
 */
function liveAssets(): Asset[] {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      database,
      "--remote",
      "--config",
      config,
      "--json",
      "--command",
      `SELECT r2_key, sha256, byte_size, mime_type FROM media_assets
       WHERE deleted_at IS NULL AND processing_status = 'ready' ORDER BY r2_key`,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) fail(`backup:r2: could not read ${database}.\n${result.stderr ?? ""}`);

  const output = result.stdout ?? "";
  const start = output.indexOf("[");
  if (start === -1) fail("backup:r2: no JSON array in the query output.");
  let blocks: Array<{ results?: unknown[] }>;
  try {
    blocks = JSON.parse(output.slice(start)) as Array<{ results?: unknown[] }>;
  } catch {
    fail("backup:r2: could not parse the query output as JSON.");
  }

  const rows = blocks.flatMap((block) => block.results ?? []) as Array<{
    byte_size: number;
    mime_type: string;
    r2_key: string;
    sha256: string;
  }>;
  return rows.map((row) => ({
    byteSize: row.byte_size,
    key: row.r2_key,
    mimeType: row.mime_type,
    sha256: row.sha256,
  }));
}

/**
 * The digest in the same shape the application stores.
 *
 * `media_assets.sha256` is written by `sha256Base64Url`: a SHA-256 digest in
 * unpadded base64url, 43 characters, not the 64-character hex a backup script
 * reaches for by reflex. Comparing the wrong encoding does not fail loudly — it
 * reports every single object as corrupt, which reads as a catastrophe and is
 * only a bug here.
 */
function digestBase64Url(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

const assets = liveAssets();
console.info(
  `Backing up ${assets.length} object(s) from R2 "${bucket}" into ${outputDirectory}\n` +
    `  index: D1 "${database}" · each object verified against its recorded sha256`,
);
mkdirSync(outputDirectory, { recursive: true });

const failures: string[] = [];
let verified = 0;

for (const [index, asset] of assets.entries()) {
  const destination = resolve(outputDirectory, "objects", asset.key);
  mkdirSync(dirname(destination), { recursive: true });

  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "r2",
      "object",
      "get",
      `${bucket}/${asset.key}`,
      "--remote",
      "--file",
      destination,
      "--config",
      config,
    ],
    { encoding: "utf8" },
  );

  const position = `[${index + 1}/${assets.length}]`;
  if (result.status !== 0 || !existsSync(destination)) {
    failures.push(`${asset.key} — could not be fetched`);
    console.error(`  ${position} x ${asset.key} — not fetched`);
    continue;
  }

  const bytes = readFileSync(destination);
  const digest = digestBase64Url(bytes);
  if (digest !== asset.sha256) {
    failures.push(`${asset.key} — sha256 mismatch (recorded ${asset.sha256}, got ${digest})`);
    console.error(`  ${position} x ${asset.key} — sha256 mismatch`);
    continue;
  }
  if (bytes.byteLength !== asset.byteSize) {
    failures.push(
      `${asset.key} — size mismatch (recorded ${asset.byteSize}, got ${bytes.byteLength})`,
    );
    console.error(`  ${position} x ${asset.key} — size mismatch`);
    continue;
  }

  verified += 1;
  console.info(`  ${position} ok ${asset.key}`);
}

// A manifest, so a restore does not depend on this script still existing and a
// later backup can be compared against this one.
writeFileSync(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(
    { bucket, database, objects: assets, takenAt: new Date().toISOString(), verified },
    null,
    2,
  )}\n`,
);

console.info(
  `\n${verified} of ${assets.length} object(s) verified against their recorded hash.` +
    `\n  manifest: ${resolve(outputDirectory, "manifest.json")}`,
);

if (failures.length > 0) {
  console.error(
    `\nx ${failures.length} object(s) did not come back intact:\n` +
      failures.map((line) => `  ${line}`).join("\n") +
      "\n\nThis backup is incomplete. Do not treat it as one.",
  );
  process.exit(1);
}

console.info(
  "\nBackup complete and verified. Keep it beside the matching D1 export:\n" +
    "  the database indexes these objects, and neither half restores without the other.",
);
