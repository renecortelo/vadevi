import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { validateEnvironment, wranglerVars } from "./environment";
import { parseJsonc } from "./jsonc";

/**
 * Deploy in the one order that is safe.
 *
 * Migrations are forward-only, so they go on before the Worker, never after.
 * Getting that backwards is not a warning — it deploys code that writes columns
 * the database does not have, and every read that names one fails. It happened:
 * a Worker went out ahead of `0020` and listing, opening and creating an event
 * all broke, whether or not the event had a place.
 *
 * The order was written down in three documents and still went wrong, because
 * following it depended on someone remembering which of two commands to paste.
 * So it is a script: migrate, build, deploy, in that order, stopping at the
 * first failure. A migration that fails never reaches the deploy, which is the
 * property the documents could not enforce.
 *
 * Usage: pnpm deploy:preview  (or `--config <file>` for another deployment)
 */

const configFlag = process.argv.indexOf("--config");
const requested = configFlag === -1 ? "wrangler.preview.jsonc" : process.argv[configFlag + 1];

if (requested === undefined || requested.length === 0) {
  console.error("deploy: --config needs a wrangler configuration file.");
  process.exit(1);
}
// Narrowed once, so the helpers below take a string rather than re-checking it.
const config: string = requested;

if (!existsSync(config)) {
  console.error(
    `deploy: ${config} does not exist.\n` +
      "That file is the deployment's own configuration and is deliberately not in\n" +
      "the repository. See docs/self-hosting.md.",
  );
  process.exit(1);
}

/** The D1 database this configuration deploys against. */
function databaseName(): string | null {
  return /"database_name"\s*:\s*"([^"]+)"/.exec(readFileSync(config, "utf8"))?.[1] ?? null;
}

function run(label: string, command: string, args: string[]): void {
  console.log(`\n▶ ${label}\n  ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(
      `\n✘ ${label} failed. Nothing after this step ran, on purpose:\n` +
        "  a Worker deployed ahead of its migrations breaks every read that\n" +
        "  names a column the database does not have yet.",
    );
    process.exit(result.status ?? 1);
  }
}

/**
 * A failure worth retrying, rather than one worth stopping on.
 *
 * `wrangler d1 migrations apply` has hit a Cloudflare 7403 ("not valid or is not
 * authorized to access this service") on its own preflight query, twice, on
 * deploys with nothing actually wrong — the same token ran `d1 execute` fine
 * seconds later, and a retry went straight through. That, and the ordinary
 * transient network faults, are the only things retried; a real migration error
 * (bad SQL, a genuine auth problem) fails fast so a broken deploy is not dressed
 * up as a flake.
 */
export function isTransientMigrationFailure(output: string): boolean {
  return [
    "7403",
    "not valid or is not authorized",
    "fetch failed",
    "Connection reset",
    "socket hang up",
    "ETIMEDOUT",
    "ECONNRESET",
    "EAI_AGAIN",
  ].some((marker) => output.includes(marker));
}

/** Sleep without async, so the retry loop stays inside this synchronous script. */
function sleepMs(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Apply migrations, retrying only the transient Cloudflare flake.
 *
 * The apply is idempotent — wrangler skips what is already recorded — so
 * retrying it is safe. Output is captured to decide whether the failure is worth
 * retrying, and echoed so the deploy still reads exactly as it did before.
 */
function applyMigrations(database: string): void {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(
      "\n▶ Applying migrations\n  npx wrangler d1 migrations apply " +
        `${database} --remote --config ${config}` +
        (attempt === 1 ? "" : `  (attempt ${attempt} of ${maxAttempts})`),
    );
    const result = spawnSync(
      "npx",
      ["wrangler", "d1", "migrations", "apply", database, "--remote", "--config", config],
      { encoding: "utf8" },
    );
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.status === 0) return;

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (attempt === maxAttempts || !isTransientMigrationFailure(output)) {
      console.error(
        "\n✘ Applying migrations failed. Nothing after this step ran, on purpose:\n" +
          "  a Worker deployed ahead of its migrations breaks every read that\n" +
          "  names a column the database does not have yet.",
      );
      process.exit(result.status ?? 1);
    }
    const waitSeconds = attempt * 3;
    console.error(
      `\n  A transient Cloudflare error (7403 or similar) — not a migration fault.\n` +
        `  Retrying in ${waitSeconds}s (${attempt} of ${maxAttempts - 1})…`,
    );
    sleepMs(waitSeconds * 1_000);
  }
}

/** The migration files in the repository, by their `NNNN_name.sql` filenames. */
function localMigrations(): string[] {
  return readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * The migrations D1 records as applied — read through `d1 execute`, not through
 * `migrations apply`.
 *
 * `wrangler d1 migrations apply` has hit an intermittent Cloudflare 7403 on its
 * own preflight query (2026-09-07, 2026-09-15), while `d1 execute` against the
 * same `/query` endpoint, with the same token, kept working seconds apart. So
 * the "is anything pending?" question is answered with the call that does not
 * flake, and the flaky `apply` is only ever run when there is real work for it.
 *
 * Returns null when the answer cannot be trusted — the call failed, or a fresh
 * database has no `d1_migrations` table yet — in which case the caller applies
 * migrations the old way rather than assuming the database is current.
 */
function appliedMigrations(db: string): string[] | null {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      db,
      "--remote",
      "--config",
      config,
      "--json",
      "--command",
      "SELECT name FROM d1_migrations",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  // `--json` prints a JSON array to stdout; take it from the first bracket so a
  // stray warning line cannot break the parse.
  const start = result.stdout.indexOf("[");
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(result.stdout.slice(start)) as Array<{
      results?: Array<{ name?: unknown }>;
    }>;
    const names = parsed
      .flatMap((block) => block.results ?? [])
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string");
    return names;
  } catch {
    return null;
  }
}

const database = databaseName();
if (database === null) {
  console.error(`deploy: could not find a database_name in ${config}.`);
  process.exit(1);
}

const migrationCount = readdirSync("migrations").filter((file) => file.endsWith(".sql")).length;
console.log(
  `Deploying with ${config} → D1 "${database}" (${migrationCount} migrations in the repository).`,
);

// 0. The settings the Worker will ship with, before anything remote is touched.
//    A typo in ACCESS_MODE used to reach the Worker and mean "open"; half of the
//    second door meant "no door". The same rules `pnpm validate:env` applies to
//    a developer's .dev.vars now apply to the vars this file deploys.
{
  const settings = validateEnvironment(wranglerVars(parseJsonc(readFileSync(config, "utf8"))));
  if (!settings.ok) {
    console.error(
      `\n✘ The vars in ${config} are not a valid deployment. Nothing was deployed.\n${settings.message}`,
    );
    process.exit(1);
  }
  console.log(
    `  Settings valid: ${settings.value.APP_ENV}, access ${settings.value.ACCESS_MODE}, AI ${settings.value.AI_PROVIDER}.`,
  );
}

// 1. The database first, always — but skip the apply when there is provably
//    nothing to apply, so a code-only deploy is not held hostage by the flaky
//    migration preflight. The skip is taken ONLY when the reliable check
//    confirms every local migration is already recorded; any doubt falls back
//    to running the apply.
const applied = appliedMigrations(database);
const pending =
  applied === null ? null : localMigrations().filter((file) => !applied.includes(file));

if (pending !== null && pending.length === 0) {
  console.log(
    "\n▶ Applying migrations\n  skipped — the database already has all " +
      `${localMigrations().length} migrations (checked with d1 execute).`,
  );
} else {
  if (pending !== null) {
    console.log(`\n  ${pending.length} migration(s) to apply: ${pending.join(", ")}`);
  } else {
    console.log("\n  Could not read applied migrations; applying to be safe.");
  }
  applyMigrations(database);
}

/**
 * The optional features, and whether this deployment turned each on.
 *
 * Printed after a deploy because the failure that keeps recurring is not a bug —
 * it is a provider var left unset. A feature is built and shipped, but its
 * switch is off, so it silently does nothing and the deploy looks complete. This
 * makes the state visible at the one moment it matters: a glance says "map: off"
 * right after the deploy that was meant to turn it on.
 *
 * Never a failure — every provider defaults off by design, and a deployment may
 * mean any of them to be off. It only reports.
 */
function summariseFeatures(configText: string): void {
  const value = (key: string): string =>
    new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(configText)?.[1] ?? "none";
  const features: Array<{ label: string; on: boolean; detail: string }> = [
    {
      label: "Vicenç, OCR and narrative",
      detail: "AI_PROVIDER",
      on: value("AI_PROVIDER") !== "none",
    },
    {
      label: "Wine research",
      detail: "RESEARCH_PROVIDER",
      on: value("RESEARCH_PROVIDER") !== "none",
    },
    {
      label: "Private access (allowlist)",
      detail: "ACCESS_MODE",
      on: value("ACCESS_MODE") === "allowlist",
    },
    {
      label: "Admin second factor (Cloudflare Access)",
      detail: "ACCESS_TEAM_DOMAIN",
      // `value` answers "none" for an unset key, so both must be real values.
      on:
        !["", "none"].includes(value("ACCESS_TEAM_DOMAIN")) &&
        /^[a-f0-9]{64}$/.test(value("ACCESS_ADMIN_AUD")),
    },
    { label: "Food pairing", detail: "PAIRING_PROVIDER", on: value("PAIRING_PROVIDER") !== "none" },
    {
      label: "Open-web discovery",
      detail: "WEBSEARCH_PROVIDER",
      on: value("WEBSEARCH_PROVIDER") !== "none",
    },
    { label: "Venue lookup", detail: "PLACES_PROVIDER", on: value("PLACES_PROVIDER") !== "none" },
    {
      label: "Street map background",
      detail: "MAP_TILES_PROVIDER",
      on: value("MAP_TILES_PROVIDER") !== "none",
    },
  ];
  console.log("\nOptional features in this deployment:");
  for (const feature of features) {
    console.log(`  ${feature.on ? "on " : "off"}  ${feature.label}  (${feature.detail})`);
  }
  const off = features.filter((feature) => !feature.on);
  if (off.length > 0) {
    console.log(
      `\n  ${off.length} feature(s) are built but switched off. If one of those is the\n` +
        "  thing you just deployed to enable, set its provider var in the config and\n" +
        "  deploy again — the code is there, only the switch is missing.",
    );
  }
}

// 2. The bundle. Every interface change lives here; deploying only the Worker
//    ships none of them, which has been mistaken for "the fix did not deploy".
run("Building the web bundle", "pnpm", ["--filter", "@vadevi/web", "build"]);

// 3. The Worker last.
run("Deploying the Worker", "npx", ["wrangler", "deploy", "--config", config]);

summariseFeatures(readFileSync(config, "utf8"));

console.log(
  "\n✔ Deployed. On the phone, close and reopen the app — or reinstall it from the\n" +
    "  home screen — so the service worker picks up the new bundle. With the old\n" +
    "  one cached, none of this is present.",
);
