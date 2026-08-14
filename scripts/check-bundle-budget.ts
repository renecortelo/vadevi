import { gzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Enforces the §18.4 initial-route JavaScript budget.
 *
 * The budget covers JavaScript: the entry module plus its modulepreload graph.
 * Lazily imported routes and non-default locale catalogs are excluded because
 * they load on demand. Render-blocking CSS is reported alongside for context
 * but is not counted against a JavaScript budget.
 *
 * The spec treats budgets as targets whose regressions need an explicit
 * decision rather than silent acceptance, so this runs in `pnpm check`.
 */
const budgetBytes = 250 * 1024;

const distributionRoot = resolve("apps/web/dist");
const indexPath = resolve(distributionRoot, "index.html");

if (!existsSync(indexPath)) {
  console.error("Run the web production build before checking the bundle budget.");
  process.exitCode = 1;
} else {
  const html = readFileSync(indexPath, "utf8");
  const assets = new Set<string>([
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]!),
    ...[...html.matchAll(/<link[^>]+href="([^"]+\.(?:js|css))"/g)].map((match) => match[1]!),
  ]);

  let scriptTotal = 0;
  let styleTotal = 0;
  const rows: { bytes: number; name: string }[] = [];
  for (const asset of assets) {
    const path = resolve(distributionRoot, asset.replace(/^\//, ""));
    if (!existsSync(path)) continue;
    const bytes = gzipSync(readFileSync(path)).byteLength;
    if (asset.endsWith(".css")) styleTotal += bytes;
    else scriptTotal += bytes;
    rows.push({ bytes, name: asset });
  }

  rows.sort((left, right) => right.bytes - left.bytes);
  for (const row of rows) {
    console.info(`${(row.bytes / 1024).toFixed(1).padStart(7)} KiB  ${row.name}`);
  }

  const totalKib = (scriptTotal / 1024).toFixed(1);
  const budgetKib = (budgetBytes / 1024).toFixed(0);
  console.info(`${(styleTotal / 1024).toFixed(1)} KiB gzip of render-blocking CSS (not budgeted).`);
  if (scriptTotal > budgetBytes) {
    console.error(
      `Initial route JavaScript is ${totalKib} KiB gzip, above the ${budgetKib} KiB budget. ` +
        `Split a route or move a dependency behind a lazy import, or record the change in an ADR.`,
    );
    process.exitCode = 1;
  } else {
    console.info(
      `Initial route JavaScript is ${totalKib} KiB gzip, within the ${budgetKib} KiB budget.`,
    );
  }
}
